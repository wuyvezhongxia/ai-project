import { useMemo, useState } from 'react'
import { Avatar, Button, Card, Empty, Progress, Segmented, Space, Spin, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { BoardColumn, ProjectView, WorkTask } from '../../workspace/types'
import { useWorkspaceStore } from '../../workspace/store/workspace-store'
import { getPriorityColor, getStatusColor } from '../../workspace/utils/task-ui'
import {
  useProjectGanttQuery,
  useProjectsQuery,
  useProjectStatisticsQuery,
  useProjectTasksQuery,
} from '../../workspace/services/workspace.queries'

function ProjectsPage() {
  const openTaskModal = useWorkspaceStore((state) => state.openTaskModal)
  const openTaskDetail = useWorkspaceStore((state) => state.openTaskDetail)
  const [projectStatusTab, setProjectStatusTab] = useState('全部项目')
  const [projectView, setProjectView] = useState<ProjectView>('kanban')
  const { data: projectCards = [], isLoading: loadingProjects } = useProjectsQuery(projectStatusTab)
  const [activeProjectId, setActiveProjectId] = useState('')
  const resolvedActiveProjectId = projectCards.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : (projectCards[0]?.id ?? '')

  const activeProject = useMemo(() => {
    if (!projectCards.length) return null
    return projectCards.find((project) => project.id === resolvedActiveProjectId) ?? projectCards[0]
  }, [projectCards, resolvedActiveProjectId])

  const { data: activeProjectBoardData = [], isLoading: loadingBoard } = useProjectTasksQuery(activeProject?.id ?? '', 'kanban')
  const { data: activeProjectListData = [], isLoading: loadingList } = useProjectTasksQuery(activeProject?.id ?? '', 'list')
  const { data: activeGanttRows = [], isLoading: loadingGantt } = useProjectGanttQuery(activeProject?.id ?? '')
  const { data: projectStats } = useProjectStatisticsQuery(activeProject?.id ?? '')
  const activeProjectBoard = activeProjectBoardData as BoardColumn[]
  const activeProjectList = activeProjectListData as WorkTask[]

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
      <Card className="glass-card">
        <div className="toolbar-row toolbar-row-wrap">
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
            <Button className="ghost-button">日筛选</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openTaskModal}>
              新建任务
            </Button>
          </Space>
        </div>
      </Card>

      <div className="project-card-grid">
        {projectCards.map((project) => (
          <button
            key={project.id}
            type="button"
            className={
              project.id === resolvedActiveProjectId
                ? 'project-summary-card project-summary-card-active'
                : 'project-summary-card'
            }
            onClick={() => setActiveProjectId(project.id)}
          >
            <div className="project-card-top">
              <div>
                <div className="project-card-title">{project.name}</div>
                <div className="project-card-subtitle">
                  负责人：{project.owner} · 截止：{project.dueAt}
                </div>
              </div>
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
            <div className="project-progress-label">
              <span>整体进度</span>
              <span>{project.progress}%</span>
            </div>
            <Progress
              percent={project.progress}
              showInfo={false}
              strokeColor="#6a83ff"
              trailColor="rgba(255,255,255,0.08)"
            />
            <div className="project-card-metrics">
              <span>{project.taskCount} 项任务</span>
              <span className="success-text">{project.doneCount} 完成</span>
              <span className="warning-text">{project.riskCount} 风险</span>
              <span className="danger-text">{project.delayCount} 延期</span>
            </div>
            <div className="avatar-stack">
              {project.members.map((member) => (
                <Avatar key={member} size="small" className="avatar-stack-item">
                  {member}
                </Avatar>
              ))}
            </div>
          </button>
        ))}
      </div>

      {!projectCards.length ? (
        <Card className="glass-card">
          <Empty description="当前没有可展示的项目" />
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
            <div className="kanban-board">
              {loadingBoard ? <Spin /> : null}
              {activeProjectBoard.map((column) => (
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
                            <Avatar size="small">{task.assignee}</Avatar>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="empty-board-hint">当前列暂无任务</div>
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
                    <div className="muted-text">{task.project}</div>
                  </div>
                  <Tag color={getStatusColor(task.status)}>{task.status}</Tag>
                  <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                  <span>{task.dueText}</span>
                  <Space>
                    <Avatar size="small">{task.owner.slice(0, 1)}</Avatar>
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
                    <div
                      className="gantt-bar"
                      style={{ marginLeft: `${row.start}%`, width: `${row.width}%`, background: row.color }}
                    >
                      {row.note}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {projectView === 'stats' ? (
            <div className="project-stats-grid">
              <Card className="attachment-card" bordered={false}>
                <div className="stat-card-title">任务完成度</div>
                <div className="stat-card-value">{Math.round(projectStats?.completionRate ?? activeProject.progress)}%</div>
              </Card>
              <Card className="attachment-card" bordered={false}>
                <div className="stat-card-title">风险任务</div>
                <div className="stat-card-value">{projectStats?.delayedTasks ?? activeProject.riskCount}</div>
              </Card>
              <Card className="attachment-card" bordered={false}>
                <div className="stat-card-title">延期任务</div>
                <div className="stat-card-value">{projectStats?.overdueTasks ?? activeProject.delayCount}</div>
              </Card>
            </div>
          ) : null}
        </Card>
      ) : null}
    </section>
  )
}

export default ProjectsPage
