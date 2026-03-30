import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Avatar, Button, Card, Dropdown, Empty, Progress, Segmented, Space, Spin, Tag } from 'antd'
import type { MenuProps } from 'antd'
import { DownOutlined, PlusOutlined } from '@ant-design/icons'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { useOutletContext } from 'react-router-dom'
import type { AppLayoutOutletContext } from '../../../components/layout/AppLayout'
import type { BoardColumn, ProjectView, WorkTask } from '../../workspace/types'
import { useWorkspaceStore } from '../../workspace/store/workspace-store'
import { getPriorityColor, getStatusColor } from '../../workspace/utils/task-ui'
import { getAvatarLabel, getAvatarSeed, getAvatarStyle, getNeutralAvatarStyle } from '../../workspace/utils/avatar'
import {
  useProjectGanttQuery,
  useProjectsQuery,
  useProjectStatisticsQuery,
  useProjectTasksQuery,
} from '../../workspace/services/workspace.queries'

const projectAccentColors = ['#6a83ff', '#20d6a7', '#9b7bff', '#ff8f6b', '#f6c54f', '#37c3ff']

const hashString = (value: string) =>
  Array.from(value).reduce((acc, char) => acc * 31 + char.charCodeAt(0), 7)

const pickStableColor = (seed: string, palette: string[]) => palette[Math.abs(hashString(seed)) % palette.length]
const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '')
  const fullHex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized
  const value = Number.parseInt(fullHex, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function ProjectStatsChart({ option, className }: { option: EChartsOption; className?: string }) {
  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current)
    chart.setOption(option)

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [option])

  return <div ref={chartRef} className={className ?? 'project-stats-chart'} />
}

function ProjectsPage() {
  const { setHeaderToolbar } = useOutletContext<AppLayoutOutletContext>()
  const openProjectModal = useWorkspaceStore((state) => state.openProjectModal)
  const openTaskDetail = useWorkspaceStore((state) => state.openTaskDetail)
  const [projectStatusTab, setProjectStatusTab] = useState('全部项目')
  const [projectFilter, setProjectFilter] = useState('all')
  const [projectView, setProjectView] = useState<ProjectView>('kanban')
  const { data: projectCards = [], isLoading: loadingProjects } = useProjectsQuery(projectStatusTab)
  const [activeProjectId, setActiveProjectId] = useState('')
  const visibleProjectCards = useMemo(() => {
    if (projectFilter === 'risk') return projectCards.filter((project) => project.riskCount > 0)
    if (projectFilter === 'delay') return projectCards.filter((project) => project.delayCount > 0)
    return projectCards
  }, [projectCards, projectFilter])
  const resolvedActiveProjectId = visibleProjectCards.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : (visibleProjectCards[0]?.id ?? '')

  const activeProject = useMemo(() => {
    if (!visibleProjectCards.length) return null
    return visibleProjectCards.find((project) => project.id === resolvedActiveProjectId) ?? visibleProjectCards[0]
  }, [visibleProjectCards, resolvedActiveProjectId])

  const { data: activeProjectBoardData = [], isLoading: loadingBoard } = useProjectTasksQuery(activeProject?.id ?? '', 'kanban')
  const { data: activeProjectListData = [], isLoading: loadingList } = useProjectTasksQuery(activeProject?.id ?? '', 'list')
  const { data: activeGanttRows = [], isLoading: loadingGantt } = useProjectGanttQuery(activeProject?.id ?? '')
  const { data: projectStats } = useProjectStatisticsQuery(activeProject?.id ?? '')
  const activeProjectBoard = activeProjectBoardData as BoardColumn[]
  const activeProjectList = activeProjectListData as WorkTask[]
  const resolvedProjectStats = useMemo(
    () => ({
      totalTasks: projectStats?.totalTasks ?? activeProject?.taskCount ?? 0,
      completedTasks: projectStats?.completedTasks ?? activeProject?.doneCount ?? 0,
      delayedTasks: projectStats?.delayedTasks ?? activeProject?.delayCount ?? 0,
      overdueTasks: projectStats?.overdueTasks ?? activeProject?.delayCount ?? 0,
      completionRate: projectStats?.completionRate ?? activeProject?.progress ?? 0,
      riskTasks: activeProject?.riskCount ?? 0,
    }),
    [activeProject, projectStats],
  )
  const activeProjectKanbanColumns = useMemo(() => {
    const riskTasks = activeProjectList
      .filter((task) => task.status !== '已完成' && task.status !== '延期')
      .filter((task) => task.dueCategory === 'today' || ['2', '3'].includes(task.riskLevel ?? '0'))
      .map((task) => ({
        ...task,
        assignee: task.owner.slice(0, 1),
      }))

    const riskColumn: BoardColumn = {
      key: 'risk',
      title: '风险',
      dotColor: '#f6c54f',
      count: riskTasks.length,
      tasks: riskTasks,
    }

    const todoColumn = activeProjectBoard.find((column) => column.key === 'todo')
    const doingColumn = activeProjectBoard.find((column) => column.key === 'doing')
    const doneColumn = activeProjectBoard.find((column) => column.key === 'done')
    const delayColumn = activeProjectBoard.find((column) => column.key === 'delay')

    return [todoColumn, doingColumn, riskColumn, doneColumn, delayColumn].filter((column): column is BoardColumn => Boolean(column))
  }, [activeProjectBoard, activeProjectList])
  const completionChartOption = useMemo<EChartsOption>(
    () => ({
      animation: false,
      backgroundColor: 'transparent',
      title: {
        text: `${Math.round(resolvedProjectStats.completionRate)}%`,
        subtext: '任务完成度',
        left: 'center',
        top: '36%',
        textStyle: { color: '#1f2740', fontSize: 28, fontWeight: 700 },
        subtextStyle: { color: '#6f7c98', fontSize: 12 },
      },
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['68%', '84%'],
          center: ['50%', '50%'],
          silent: true,
          label: { show: false },
          data: [
            { value: resolvedProjectStats.completedTasks, name: '已完成', itemStyle: { color: '#20d6a7' } },
            {
              value: Math.max(resolvedProjectStats.totalTasks - resolvedProjectStats.completedTasks, 0),
              name: '未完成',
              itemStyle: { color: 'rgba(103, 117, 164, 0.16)' },
            },
          ],
        },
      ],
    }),
    [resolvedProjectStats],
  )
  const statusChartOption = useMemo<EChartsOption>(
    () => ({
      animation: false,
      backgroundColor: 'transparent',
      grid: { top: 18, right: 18, bottom: 8, left: 56 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(118, 129, 170, 0.18)' } },
        axisLabel: { color: '#7180a2' },
      },
      yAxis: {
        type: 'category',
        data: ['已完成', '风险', '延期'],
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: '#334160' },
      },
      series: [
        {
          type: 'bar',
          barWidth: 16,
          data: [
            { value: resolvedProjectStats.completedTasks, itemStyle: { color: '#20d6a7', borderRadius: 999 } },
            { value: resolvedProjectStats.riskTasks, itemStyle: { color: '#f6c54f', borderRadius: 999 } },
            { value: resolvedProjectStats.delayedTasks, itemStyle: { color: '#ff7b88', borderRadius: 999 } },
          ],
          label: {
            show: true,
            position: 'right',
            color: '#2b3551',
            fontWeight: 600,
          },
        },
      ],
    }),
    [resolvedProjectStats],
  )
  const projectFilterLabel = projectFilter === 'risk' ? '有风险' : projectFilter === 'delay' ? '有延期' : '全部项目'
  const filterMenu = useMemo<MenuProps>(
    () => ({
      selectable: true,
      selectedKeys: [projectFilter],
      items: [
        { key: 'all', label: '全部项目' },
        { key: 'risk', label: '有风险' },
        { key: 'delay', label: '有延期' },
      ],
      onClick: ({ key }) => setProjectFilter(key),
    }),
    [projectFilter],
  )

  const projectHeaderToolbar = useMemo(
    () => (
      <div className="toolbar-row toolbar-row-wrap project-page-toolbar">
        <Space wrap>
          {['全部项目', '进行中', '已归档'].map((tab) => (
            <Button
              key={tab}
              type={projectStatusTab === tab ? 'primary' : 'default'}
              className={projectStatusTab === tab ? '' : 'ghost-button'}
              onClick={() => setProjectStatusTab(tab)}
            >
              {tab}
            </Button>
          ))}
        </Space>
        <Space wrap>
          <Dropdown menu={filterMenu} trigger={['hover', 'click']}>
            <Button className="ghost-button" icon={<DownOutlined />}>
              {projectFilter === 'all' ? '筛选' : `筛选 · ${projectFilterLabel}`}
            </Button>
          </Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={openProjectModal}>
            新建项目
          </Button>
        </Space>
      </div>
    ),
    [filterMenu, openProjectModal, projectFilterLabel, projectStatusTab],
  )

  useEffect(() => {
    setHeaderToolbar(projectHeaderToolbar)
  }, [projectHeaderToolbar, setHeaderToolbar])

  useEffect(() => {
    return () => {
      setHeaderToolbar(null)
    }
  }, [setHeaderToolbar])

  if (loadingProjects && !projectCards.length) {
    return (
      <section className="page-stack">
        <Card className="glass-card">
          <Spin />
        </Card>
      </section>
    )
  }

  return (
    <section className="page-stack">
      <div className="project-card-scroll">
        <div className="project-card-grid">
          {visibleProjectCards.map((project) => {
            const accentColor = project.accentColor ?? pickStableColor(project.id, projectAccentColors)
            const cardAccentStyle = {
              '--project-card-accent': accentColor,
              '--project-card-accent-border': hexToRgba(accentColor, 0.5),
              '--project-card-accent-shadow': hexToRgba(accentColor, 0.22),
            } as CSSProperties
            const visibleMembers = project.members.slice(0, 3)
            const remainingMemberCount = Math.max(project.members.length - visibleMembers.length, 0)

            return (
              <button
                key={project.id}
                type="button"
                className={
                  project.id === resolvedActiveProjectId
                    ? 'project-summary-card project-summary-card-active'
                    : 'project-summary-card'
                }
                style={cardAccentStyle}
                onClick={() => setActiveProjectId(project.id)}
              >
              <div className="project-card-top">
                <div className="project-card-heading">
                  <div className="project-card-title">{project.name}</div>
                  <Tag
                    color={
                      project.status === '进行中'
                        ? 'processing'
                        : project.status === '未开始'
                          ? 'default'
                          : 'success'
                    }
                  >
                    {project.status}
                  </Tag>
                </div>
                <div className="project-card-subtitle">
                  负责人：{project.owner} · 截止：{project.dueAt}
                </div>
              </div>
              <div className="project-progress-label">
                <span>整体进度</span>
                <span>{project.progress}%</span>
              </div>
              <Progress
                className="project-card-progress"
                percent={project.progress}
                showInfo={false}
                strokeWidth={4}
                strokeColor={accentColor}
                trailColor="var(--pm-chart-trail)"
              />
              <div className="project-card-metrics">
                <span>{project.taskCount} 项任务</span>
                <span className="success-text">{project.doneCount} 完成</span>
                <span className="warning-text">{project.riskCount} 风险</span>
                <span className="danger-text">{project.delayCount} 延期</span>
              </div>
              <div className="avatar-stack">
                {visibleMembers.map((member) => (
                  <Avatar
                    key={`${project.id}-${member.userId ?? member.nickName}`}
                    size="small"
                    className="avatar-stack-item"
                    src={member.avatarUrl || undefined}
                    style={member.avatarUrl ? undefined : getAvatarStyle(getAvatarSeed(member.userId, member.nickName))}
                  >
                    {getAvatarLabel(member.nickName)}
                  </Avatar>
                ))}
                {remainingMemberCount > 0 ? (
                  <Avatar size="small" className="avatar-stack-item avatar-stack-count" style={getNeutralAvatarStyle()}>
                    +{remainingMemberCount}
                  </Avatar>
                ) : null}
              </div>
              </button>
            )
          })}
        </div>
      </div>

      {!projectCards.length ? (
        <Card className="glass-card">
          <Empty description="当前没有可展示的项目" />
        </Card>
      ) : !visibleProjectCards.length ? (
        <Card className="glass-card">
          <Empty description="当前筛选下没有可展示的项目" />
        </Card>
      ) : null}

      {activeProject ? (
        <Card
          className="glass-card"
          title={`${activeProject.name} · 任务视图`}
          extra={
            <Segmented
              value={projectView}
              onChange={(value) => setProjectView(value as ProjectView)}
              options={[
                { label: '列表', value: 'list' },
                { label: '看板', value: 'kanban' },
                { label: '甘特图', value: 'gantt' },
                { label: '统计', value: 'stats' },
              ]}
            />
          }
        >
          {projectView === 'kanban' ? (
            <div className="kanban-board project-kanban-board">
              {loadingBoard ? <Spin /> : null}
              {activeProjectKanbanColumns.map((column) => (
                <div key={column.key} className="kanban-column">
                  <div className="kanban-column-header">
                    <Space>
                      <span className="kanban-dot" style={{ background: column.dotColor }} />
                      <span>{column.title}</span>
                      <Tag bordered={false}>{column.count}</Tag>
                    </Space>
                  </div>
                  <div className="kanban-column-body">
                    {column.tasks.length ? (
                      column.tasks.map((task) => (
                        <button key={task.id} className="board-task-card" type="button" onClick={() => openTaskDetail(task.id)}>
                          <div className="board-task-title">{task.title}</div>
                          <Space wrap className="task-meta">
                            <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                            <Tag color={getStatusColor(task.status)}>{task.status}</Tag>
                          </Space>
                          <div className="board-task-footer">
                            <span>{task.owner}</span>
                            <Avatar size="small" style={getAvatarStyle(getAvatarSeed(task.ownerId, task.owner))}>
                              {task.assignee || getAvatarLabel(task.owner)}
                            </Avatar>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="empty-board-hint">{column.key === 'risk' ? '当前列暂无风险任务' : '当前列暂无任务'}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {projectView === 'list' ? (
            <div className="todo-list-card">
              {loadingList ? <Spin /> : null}
              <div className="todo-list-header todo-list-header-project">
                <span>任务名称</span>
                <span>状态</span>
                <span>优先级</span>
                <span>截止时间</span>
                <span>负责人</span>
              </div>
              {activeProjectList.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="todo-list-row todo-list-row-button todo-list-row-project"
                  onClick={() => openTaskDetail(task.id)}
                >
                  <div className="todo-cell-main">
                    <div className="todo-row-title">{task.title}</div>
                  </div>
                  <Tag color={getStatusColor(task.status)}>{task.status}</Tag>
                  <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                  <span>{task.dueText}</span>
                  <Space>
                    <Avatar size="small" style={getAvatarStyle(getAvatarSeed(task.ownerId, task.owner))}>
                      {getAvatarLabel(task.owner)}
                    </Avatar>
                    <span>{task.owner}</span>
                  </Space>
                </button>
              ))}
            </div>
          ) : null}

          {projectView === 'gantt' ? (
            <div className="gantt-grid">
              {loadingGantt ? <Spin /> : null}
              {activeGanttRows.map((row) => (
                <div key={row.label} className="gantt-row">
                  <div className="gantt-label">{row.label}</div>
                  <div className="gantt-track">
                    <div className="gantt-track-line" />
                    <div
                      className="gantt-bar"
                      style={{ marginLeft: `${row.start}%`, width: `${row.width}%`, background: row.color }}
                    >
                      <span className="gantt-bar-title">{row.label}</span>
                      <span className="gantt-bar-note">{row.note}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {projectView === 'stats' ? (
            <div className="project-stats-grid">
              <Card className="attachment-card project-stats-summary" bordered={false}>
                <div className="project-stats-kpis">
                  <div className="project-stats-kpi">
                    <span className="project-stats-kpi-label">任务总数</span>
                    <span className="project-stats-kpi-value">{resolvedProjectStats.totalTasks}</span>
                  </div>
                  <div className="project-stats-kpi">
                    <span className="project-stats-kpi-label">风险任务</span>
                    <span className="project-stats-kpi-value warning-text">{resolvedProjectStats.riskTasks}</span>
                  </div>
                  <div className="project-stats-kpi">
                    <span className="project-stats-kpi-label">延期任务</span>
                    <span className="project-stats-kpi-value danger-text">{resolvedProjectStats.delayedTasks}</span>
                  </div>
                </div>
              </Card>
              <Card className="attachment-card project-stats-panel" bordered={false}>
                <div className="project-stats-panel-title">完成度分析</div>
                <ProjectStatsChart option={completionChartOption} className="project-stats-chart project-stats-chart-donut" />
              </Card>
              <Card className="attachment-card project-stats-panel" bordered={false}>
                <div className="project-stats-panel-title">任务状态分布</div>
                <ProjectStatsChart option={statusChartOption} className="project-stats-chart project-stats-chart-bars" />
              </Card>
            </div>
          ) : null}
        </Card>
      ) : null}
    </section>
  )
}

export default ProjectsPage
