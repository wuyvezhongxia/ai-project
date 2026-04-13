import {
  CaretDownFilled,
  CaretUpFilled,
  CheckSquareOutlined,
  ClockCircleOutlined,
  PushpinOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Card, Checkbox, List, Progress, Space, Tag } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { statCards } from '../../workspace/data/mock'
import { useAiAssistantStore } from '../../ai/ai-assistant.store'
import { useWorkspaceStore } from '../../workspace/store/workspace-store'
import { getPriorityColor, getStatusColor } from '../../workspace/utils/task-ui'
import { getAvatarLabel, getAvatarSeed, getAvatarStyle } from '../../workspace/utils/avatar'
import { workspaceApi } from '../../workspace/services/workspace.api'
import {
  useDashboardQuery,
  useMustDoTodayQuery,
  useRiskTasksQuery,
  useUpdateTaskStatusMutation,
  useWorkloadQuery,
} from '../../workspace/services/workspace.queries'

const getRiskTagColor = (risk: string) => {
  if (risk.startsWith('已延期') || risk === '严重风险') return 'error'
  if (risk === '风险预警') return 'warning'
  return 'gold'
}

const getTrendMeta = (text: string) => {
  const match = text.match(/^(.*?)([+-]\d+%)$/)
  if (!match) return null

  const [, label, delta] = match
  const direction = delta.startsWith('+') ? 'up' : 'down'

  return {
    label: label.trim(),
    delta,
    direction,
  } as const
}

function DashboardPage() {
  const openAiAssistant = useAiAssistantStore((s) => s.setOpen)
  const aiAssistantOpen = useAiAssistantStore((s) => s.open)
  const aiMessages = useAiAssistantStore((s) => s.messages)
  const openTaskDetail = useWorkspaceStore((state) => state.openTaskDetail)
  const { data: dashboard } = useDashboardQuery()
  const { data: aiHistoryResp } = useQuery({
    queryKey: ['ai-history-preview'],
    queryFn: () => workspaceApi.aiHistory({ limit: 12 }),
    staleTime: 30_000,
  })
  const { data: mustDoTasks = [], isLoading: loadingMustDo } = useMustDoTodayQuery()
  const { data: riskTasks = [], isLoading: loadingRisk } = useRiskTasksQuery()
  const { data: memberLoads = [] } = useWorkloadQuery('week')
  const updateStatusMutation = useUpdateTaskStatusMutation()
  const statCardIcons = [<PushpinOutlined />, <CheckSquareOutlined />, <ClockCircleOutlined />, <ThunderboltOutlined />]
  const delayedTasks = riskTasks.filter((task) => task.risk.startsWith('已延期'))
  const delayedCount = delayedTasks.length
  const todayTasks = dashboard?.today ?? []
  const todayTotal = dashboard?.summary?.today ?? todayTasks.length ?? mustDoTasks.length
  const todayCompleted =
    todayTasks.length > 0 ? todayTasks.filter((task) => task.status === '2').length : mustDoTasks.filter((task) => task.completed).length
  const todayCompletionRate = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0
  const weeklyTotal = dashboard?.summary?.total ?? 0
  const weeklyCompleted = Math.max(weeklyTotal - (dashboard?.summary?.risk ?? 0), 0)
  const weeklyCompletionRate = weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : Number.parseInt(statCards[1].value, 10)
  const liveMessages = aiMessages
    .filter((message) => message.id !== 'welcome' && message.content.trim())
    .slice(-4)
    .map((message) => ({
      ...message,
      content: message.content.length > 110 ? `${message.content.slice(0, 110)}...` : message.content,
    }))
  const persistedMessages =
    aiHistoryResp?.records
      ?.flatMap((record) => {
        const items: Array<{ id: string; role: 'user' | 'assistant'; content: string }> = []
        if (record.inputText?.trim()) {
          items.push({ id: `d-u-${record.id}`, role: 'user', content: record.inputText })
        }
        if (record.outputText?.trim()) {
          items.push({ id: `d-a-${record.id}`, role: 'assistant', content: record.outputText })
        }
        return items
      })
      .slice(-4)
      .map((message) => ({
        ...message,
        content: message.content.length > 110 ? `${message.content.slice(0, 110)}...` : message.content,
      })) ?? []
  const recentAssistantMessages = liveMessages.length > 0 ? liveMessages : persistedMessages
  const previewSkills: Array<{ key: string; label: string; className: string }> = [
    { key: 'weekly', label: '生成周报', className: 'dashboard-ai-preview-skill--weekly' },
    { key: 'breakdown', label: '项目分析', className: 'dashboard-ai-preview-skill--breakdown' },
    { key: 'batchAdjust', label: '批量调整', className: 'dashboard-ai-preview-skill--risk' },
  ]

  const resolvedStatCards = [
    { ...statCards[0], value: String(todayTotal), suffix: `已完成 ${todayCompleted} / ${todayTotal} · ${todayCompletionRate}%` },
    { ...statCards[1], title: '本周完成率', value: `${weeklyCompletionRate}%`, suffix: `已完成 ${weeklyCompleted} / ${weeklyTotal} 项` },
    { ...statCards[2], value: String(delayedCount), suffix: delayedCount > 0 ? `已超期 ${delayedCount} 项` : '当前无延期任务' },
    { ...statCards[3], value: `${memberLoads[0]?.value ?? 0}%`, suffix: memberLoads[0] ? `需留意，${memberLoads[0].name}排期较满` : statCards[3].suffix },
  ]

  return (
    <>
      <section className="stat-grid">
        {resolvedStatCards.map((card, index) => (
          <Card key={card.title} className="glass-card stat-card" bordered={false}>
            {(() => {
              const trendMeta = getTrendMeta(card.suffix)

              return (
                <>
            <div className="stat-card-head">
              <div className={`stat-card-badge stat-card-badge-${index + 1}`}>
                <span className={`stat-card-icon stat-card-icon-${index + 1}`}>{statCardIcons[index]}</span>
                <span className="stat-card-title">{card.title}</span>
              </div>
              <span className="stat-card-ornament" />
            </div>
            <div className="stat-card-value" style={{ color: card.accent }}>
              {card.value}
            </div>
            <Progress
              percent={card.value.includes('%') ? Number.parseInt(card.value, 10) : Math.min(Number(card.value) * 10, 100)}
              showInfo={false}
              strokeColor={card.accent}
              trailColor="var(--pm-chart-trail)"
            />
            {trendMeta ? (
              <div className="stat-card-footer stat-card-footer-trend">
                <span>{trendMeta.label}</span>
                <span
                  className={
                    trendMeta.direction === 'up' ? 'stat-card-trend stat-card-trend-up' : 'stat-card-trend stat-card-trend-down'
                  }
                >
                  {trendMeta.direction === 'up' ? <CaretUpFilled /> : <CaretDownFilled />}
                  {trendMeta.delta}
                </span>
              </div>
            ) : (
              <div className="stat-card-footer">{card.suffix}</div>
            )}
                </>
              )
            })()}
          </Card>
        ))}
      </section>

      <section className="dashboard-grid">
        <div className="left-column">
          <Card
            className="glass-card"
            title="今日必须完成"
            extra={
              <Space>
                {/* <Tag className="section-chip" color="processing">
                  AI 推荐
                </Tag>
                <Button type="link" className="section-link-button">
                  查看全部
                </Button> */}
              </Space>
            }
          >
            <List
              className="task-panel-list"
              dataSource={mustDoTasks}
              loading={loadingMustDo}
              renderItem={(task) => {
                const checked = task.completed

                return (
                  <List.Item
                    className={checked ? 'task-list-item task-list-item-done task-list-item-clickable' : 'task-list-item task-list-item-clickable'}
                    onClick={() => openTaskDetail(task.id)}
                  >
                    <div className="task-row">
                      <div className="task-main">
                        <Checkbox
                          checked={checked}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() =>
                            updateStatusMutation.mutate({
                              taskId: task.id,
                              status: checked ? '1' : '2',
                            })
                          }
                        />
                        <button className="task-title-button" type="button" onClick={() => openTaskDetail(task.id)}>
                          <div className={checked ? 'task-title task-title-done' : 'task-title'}>{task.title}</div>
                          <div className="task-meta">
                            <span>{task.project}</span>
                            <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                            <Tag color={getStatusColor(task.status)}>{task.status}</Tag>
                          </div>
                        </button>
                      </div>
                      <div className="task-side">
                        <Avatar style={getAvatarStyle(getAvatarSeed(task.ownerId, task.owner))}>{getAvatarLabel(task.owner)}</Avatar>
                        <span className={checked ? 'task-deadline task-deadline-done' : 'task-deadline'}>
                          {checked ? '已完成' : task.dueText}
                        </span>
                      </div>
                    </div>
                  </List.Item>
                )
              }}
            />
          </Card>

          <Card
            className="glass-card"
            title="延期任务"
            // extra={
            //   <Tag className="section-chip" color="error">
            //     AI 提醒
            //   </Tag>
            // }
          >
            <List
              className="risk-panel-list"
              dataSource={riskTasks}
              loading={loadingRisk}
              locale={{ emptyText: '当前暂无延期或风险任务' }}
              renderItem={(task) => (
                <List.Item className="risk-list-item risk-list-item-clickable" onClick={() => openTaskDetail(task.id)}>
                  <div className="risk-dot" />
                  <div className="risk-content">
                    <div className="risk-title">{task.title}</div>
                    <div className="task-meta">
                      <span>{task.project}</span>
                      <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                      <Tag color={getRiskTagColor(task.risk)}>{task.risk}</Tag>
                    </div>
                  </div>
                  <div className="risk-side">
                    <div className="risk-owner">
                      <Avatar size="small" style={getAvatarStyle(getAvatarSeed(task.ownerId, task.owner))}>
                        {getAvatarLabel(task.owner)}
                      </Avatar>
                      <span className="risk-owner-name">{task.owner}</span>
                    </div>
                    <span className="risk-date">{task.dueText}</span>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </div>

        <div className="right-column">
          {!aiAssistantOpen ? (
            <Card
              className="glass-card dashboard-ai-entry"
              title="智能工作助手"
              onClick={() => openAiAssistant(true)}
              extra={
                <Button
                  type="link"
                  className="section-link-button"
                  onClick={(event) => {
                    event.stopPropagation()
                    openAiAssistant(true)
                  }}
                >
                  打开助手
                </Button>
              }
            >
              <div className="dashboard-ai-preview-shell">
                {recentAssistantMessages.length > 0 ? (
                  <div className="dashboard-ai-preview-thread" aria-label="最近对话预览">
                    {recentAssistantMessages.map((message) => (
                      <div
                        key={message.id}
                        className={message.role === 'user' ? 'dashboard-ai-preview-row dashboard-ai-preview-row-user' : 'dashboard-ai-preview-row'}
                      >
                        <span className="dashboard-ai-preview-role">{message.role === 'user' ? '我' : '助手'}</span>
                        <div
                          className={
                            message.role === 'user'
                              ? 'dashboard-ai-preview-bubble dashboard-ai-preview-bubble-user'
                              : 'dashboard-ai-preview-bubble'
                          }
                        >
                          {message.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="dashboard-ai-hint">
                    你好，我是智能工作助手。你还没有聊天记录，点击「打开助手」即可开始，我可以帮你做周报、项目分析和批量调整。
                  </p>
                )}

                <div className="dashboard-ai-preview-footer">
                  <div className="dashboard-ai-preview-skills">
                    {previewSkills.map((skill) => (
                      <button
                        key={skill.key}
                        type="button"
                        className={`dashboard-ai-preview-skill ${skill.className}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          openAiAssistant(true)
                        }}
                      >
                        {skill.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="dashboard-ai-preview-input"
                    onClick={(event) => {
                      event.stopPropagation()
                      openAiAssistant(true)
                    }}
                  >
                    基于工作数据提问，Shift + Enter 换行
                  </button>
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="glass-card" title="团队负载速览" extra={<Button type="link" className="section-link-button">详情</Button>}>
            <div className="workload-list">
              {memberLoads.map((member) => {
                const loadState =
                  member.value >= 85 ? '超载' : member.value >= 70 ? '偏满' : `${member.urgentCount} 项紧急`
                const loadStateClass =
                  member.value >= 85
                    ? 'workload-state workload-state-danger'
                    : member.value >= 70
                      ? 'workload-state workload-state-warning'
                      : 'workload-state'

                return (
                  <div key={member.name} className="workload-row">
                    <div className="workload-person">
                      <Avatar style={getAvatarStyle(getAvatarSeed(member.userId, member.name))}>{getAvatarLabel(member.name)}</Avatar>
                      <div className="workload-person-meta">
                        <span className="workload-name">{member.name}</span>
                        <span className={loadStateClass}>{loadState}</span>
                      </div>
                    </div>
                    <div className="workload-bar">
                      <div
                        className="workload-bar-inner"
                        style={{ width: `${member.value}%`, background: member.color }}
                      />
                    </div>
                    <span className="workload-value">{member.value}%</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </section>
    </>
  )
}

export default DashboardPage
