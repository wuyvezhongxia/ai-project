import { Checkbox, Avatar, Button, Card, Flex, Input, List, Progress, Space, Tag } from 'antd'
import { aiMessages, memberLoads, mustDoTasks, riskTasks, statCards } from '../../workspace/data/mock'
import { useWorkspaceStore } from '../../workspace/store/workspace-store'
import { getPriorityColor, getStatusColor } from '../../workspace/utils/task-ui'

function DashboardPage() {
  const checkedTaskIds = useWorkspaceStore((state) => state.checkedTaskIds)
  const toggleTaskChecked = useWorkspaceStore((state) => state.toggleTaskChecked)
  const openTaskDetail = useWorkspaceStore((state) => state.openTaskDetail)

  return (
    <>
      <section className="stat-grid">
        {statCards.map((card) => (
          <Card key={card.title} className="glass-card stat-card" bordered={false}>
            <div className="stat-card-title">{card.title}</div>
            <div className="stat-card-value">{card.value}</div>
            <Progress
              percent={75}
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
              renderItem={(task) => {
                const checked = checkedTaskIds.includes(task.id)

                return (
                  <List.Item className="task-list-item">
                    <div className="task-row">
                      <Checkbox checked={checked} onChange={() => toggleTaskChecked(task.id)} />
                      <button className="task-title-button" type="button" onClick={() => openTaskDetail(task.id)}>
                        <div className={checked ? 'task-title task-title-done' : 'task-title'}>{task.title}</div>
                        <div className="task-meta">
                          <span>{task.project}</span>
                          <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                          <Tag color={getStatusColor(task.status)}>{task.status}</Tag>
                        </div>
                      </button>
                      <div className="task-side">
                        <Avatar>{task.owner.slice(0, 1)}</Avatar>
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
                    <Avatar>{member.name.slice(0, 1)}</Avatar>
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
