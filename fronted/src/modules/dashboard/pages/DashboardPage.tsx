import { Checkbox, Avatar, Button, Card, Flex, Input, List, Progress, Space, Tag } from 'antd'
import { aiMessages, statCards } from '../../workspace/data/mock'
import { useWorkspaceStore } from '../../workspace/store/workspace-store'
import { getPriorityColor, getStatusColor } from '../../workspace/utils/task-ui'
import { getAvatarLabel, getAvatarSeed, getAvatarStyle } from '../../workspace/utils/avatar'
import {
  useDashboardQuery,
  useMustDoTodayQuery,
  useRiskTasksQuery,
  useUpdateTaskStatusMutation,
  useWorkloadQuery,
} from '../../workspace/services/workspace.queries'

function DashboardPage() {
  const openTaskDetail = useWorkspaceStore((state) => state.openTaskDetail)
  const { data: dashboard } = useDashboardQuery()
  const { data: mustDoTasks = [], isLoading: loadingMustDo } = useMustDoTodayQuery()
  const { data: riskTasks = [], isLoading: loadingRisk } = useRiskTasksQuery()
  const { data: memberLoads = [] } = useWorkloadQuery('week')
  const updateStatusMutation = useUpdateTaskStatusMutation()

  const resolvedStatCards = [
    { ...statCards[0], value: String(dashboard?.summary?.today ?? 0), suffix: `今日任务 ${dashboard?.summary?.today ?? 0} 项` },
    { ...statCards[1], value: `${dashboard?.summary?.total ? Math.round(((dashboard.summary.total - (dashboard.summary.risk ?? 0)) / dashboard.summary.total) * 100) : 0}%`, suffix: `总任务 ${dashboard?.summary?.total ?? 0} 项` },
    { ...statCards[2], value: String(dashboard?.summary?.risk ?? 0), suffix: '需重点跟进处理' },
    { ...statCards[3], value: `${memberLoads[0]?.value ?? 0}%`, suffix: memberLoads[0] ? `需留意，${memberLoads[0].name}排期较满` : statCards[3].suffix },
  ]

  return (
    <>
      <section className="stat-grid">
        {resolvedStatCards.map((card) => (
          <Card key={card.title} className="glass-card stat-card" bordered={false}>
            <div className="stat-card-title">{card.title}</div>
            <div className="stat-card-value">{card.value}</div>
            <Progress
              percent={card.value.includes('%') ? Number.parseInt(card.value, 10) : Math.min(Number(card.value) * 10, 100)}
              showInfo={false}
              strokeColor={card.accent}
              trailColor="rgba(255,255,255,0.06)"
            />
            <div className="stat-card-footer">{card.suffix}</div>
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
                <Tag color="processing">AI 推荐</Tag>
                <Button type="link">查看全部</Button>
              </Space>
            }
          >
            <List
              dataSource={mustDoTasks}
              loading={loadingMustDo}
              renderItem={(task) => {
                const checked = task.completed

                return (
                  <List.Item className="task-list-item">
                    <div className="task-row">
                      <Checkbox
                        checked={checked}
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
                      <div className="task-side">
                        <Avatar style={getAvatarStyle(getAvatarSeed(task.ownerId, task.owner))}>{getAvatarLabel(task.owner)}</Avatar>
                        <span>{task.dueText}</span>
                      </div>
                    </div>
                  </List.Item>
                )
              }}
            />
          </Card>

          <Card className="glass-card" title="延期风险任务" extra={<Tag color="error">AI 提醒</Tag>}>
            <List
              dataSource={riskTasks}
              loading={loadingRisk}
              renderItem={(task) => (
                <List.Item className="risk-list-item">
                  <div className="risk-dot" />
                  <div className="risk-content">
                    <div className="risk-title">{task.title}</div>
                    <div className="task-meta">
                      <span>{task.project}</span>
                      <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                      <Tag color="error">{task.risk}</Tag>
                    </div>
                  </div>
                  <span className="risk-date">{task.dueText}</span>
                </List.Item>
              )}
            />
          </Card>
        </div>

        <div className="right-column">
          <Card className="glass-card" title="智能工作助手" extra={<span className="muted-text">GPT-4o · 在线</span>}>
            <div className="assistant-panel">
              {aiMessages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === 'assistant'
                      ? 'assistant-bubble'
                      : 'assistant-bubble assistant-bubble-user'
                  }
                >
                  {message.content}
                </div>
              ))}
              <Input.Search placeholder="输入指令，如：生成本周工作总结..." enterButton="发送" />
              <Flex wrap="wrap" gap={8}>
                <Tag color="blue">生成周报</Tag>
                <Tag color="purple">重新拆解</Tag>
                <Tag color="cyan">延期分析</Tag>
                <Tag color="red">风险提醒</Tag>
              </Flex>
            </div>
          </Card>

          <Card className="glass-card" title="团队负载速览" extra={<Button type="link">详情</Button>}>
            <div className="workload-list">
              {memberLoads.map((member) => (
                <div key={member.name} className="workload-row">
                  <Space>
                    <Avatar style={getAvatarStyle(getAvatarSeed(member.userId, member.name))}>{getAvatarLabel(member.name)}</Avatar>
                    <span>{member.name}</span>
                  </Space>
                  <div className="workload-bar">
                    <div
                      className="workload-bar-inner"
                      style={{ width: `${member.value}%`, background: member.color }}
                    />
                  </div>
                  <span className="muted-text">{member.value}%</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </>
  )
}

export default DashboardPage
