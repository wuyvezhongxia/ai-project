import {
  CalendarOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CopyOutlined,
  EllipsisOutlined,
  FileTextOutlined,
  LinkOutlined,
  PlusOutlined,
  StarOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Avatar,
  Button,
  Card,
  Drawer,
  Empty,
  Flex,
  List,
  Progress,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
} from 'antd'
import { useWorkspaceStore } from '../store/workspace-store'
import { getPriorityColor, getStatusColor } from '../utils/task-ui'
import { useTaskDetailQuery, useUpdateTaskStatusMutation } from '../services/workspace.queries'

function TaskDetailDrawer() {
  const detailOpen = useWorkspaceStore((state) => state.detailOpen)
  const closeTaskDetail = useWorkspaceStore((state) => state.closeTaskDetail)
  const selectedTaskId = useWorkspaceStore((state) => state.selectedTaskId)
  const { data: selectedTask, isLoading } = useTaskDetailQuery(selectedTaskId)
  const updateStatusMutation = useUpdateTaskStatusMutation()

  if (!selectedTask) {
    return (
      <Drawer open={detailOpen} onClose={closeTaskDetail} width={920} placement="right" className="task-detail-drawer">
        {isLoading ? <Spin /> : <Empty description="请选择任务查看详情" />}
      </Drawer>
    )
  }

  const completedSubtasks = selectedTask.subtasks.filter((item) => item.done).length
  const subtaskPercent = selectedTask.subtasks.length
    ? Math.round((completedSubtasks / selectedTask.subtasks.length) * 100)
    : 0

  return (
    <Drawer
      open={detailOpen}
      onClose={closeTaskDetail}
      width={920}
      placement="right"
      className="task-detail-drawer"
      closeIcon={null}
      title={
        <div className="drawer-title-block">
          <Space className="drawer-path" size={8}>
            <span>{selectedTask.id}</span>
            <span>•</span>
            <span>{selectedTask.project}</span>
          </Space>
          <Space wrap>
            <Tag color={getPriorityColor(selectedTask.priority)}>{selectedTask.priority} 优先</Tag>
            <Tag color={getStatusColor(selectedTask.status)}>{selectedTask.status}</Tag>
          </Space>
          <div className="drawer-main-title">{selectedTask.title}</div>
          <Space wrap className="drawer-summary">
            <span>
              <CalendarOutlined /> 截止 {selectedTask.dueText}
            </span>
            <Tag color="error">今天到期</Tag>
            <span>
              <UserOutlined /> 负责人 {selectedTask.owner}
            </span>
          </Space>
        </div>
      }
      extra={
        <Space>
          <Button className="ghost-button" icon={<EllipsisOutlined />} />
          <Button className="ghost-button" icon={<StarOutlined />} />
          <Button type="primary" onClick={closeTaskDetail}>
            关闭
          </Button>
        </Space>
      }
    >
      <Tabs
        defaultActiveKey="detail"
        items={[
          {
            key: 'detail',
            label: '详情',
            children: (
              <div className="detail-layout">
                <div className="detail-main">
                  <section className="detail-section">
                    <div className="section-title">任务描述</div>
                    <div className="rich-card">
                      <p>{selectedTask.description || '当前任务暂无详细描述。'}</p>
                      <p className="muted-text">后续可继续接入描述编辑能力。</p>
                    </div>
                  </section>

                  <section className="detail-section">
                    <Flex justify="space-between" align="center">
                      <div className="section-title">子任务进度</div>
                      <div className="progress-summary">
                        {completedSubtasks} / {selectedTask.subtasks.length} · {subtaskPercent}%
                      </div>
                    </Flex>
                    <Progress
                      percent={subtaskPercent}
                      showInfo={false}
                      strokeColor="#20d6a7"
                      trailColor="rgba(255,255,255,0.08)"
                    />
                    <List
                      dataSource={selectedTask.subtasks}
                      locale={{ emptyText: '暂无子任务' }}
                      renderItem={(item) => (
                        <List.Item className="subtask-row">
                          <Space>
                            {item.done ? (
                              <CheckCircleFilled className="success-icon" />
                            ) : (
                              <ClockCircleOutlined className="pending-icon" />
                            )}
                            <span className={item.done ? 'subtask-done' : ''}>{item.title}</span>
                          </Space>
                          <Space>
                            <span className="muted-text">{item.owner || '未分配'}</span>
                            {item.status ? <Tag color="processing">{item.status}</Tag> : null}
                          </Space>
                        </List.Item>
                      )}
                    />
                    <Button icon={<PlusOutlined />} disabled>
                      添加子任务
                    </Button>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">附件</div>
                    <div className="attachment-grid">
                      {selectedTask.attachments.length ? (
                        selectedTask.attachments.map((item) => (
                          <Card key={item.id} className="attachment-card" bordered={false}>
                            <Space direction="vertical" size={4}>
                              <Space>
                                <FileTextOutlined />
                                <a href={item.fileUrl} target="_blank" rel="noreferrer">
                                  {item.fileName}
                                </a>
                              </Space>
                              <span className="muted-text">{item.metaText}</span>
                            </Space>
                          </Card>
                        ))
                      ) : (
                        <Empty description="暂无附件" />
                      )}
                    </div>
                    <Button icon={<PlusOutlined />} disabled>
                      上传附件
                    </Button>
                  </section>
                </div>

                <div className="detail-side">
                  <section className="detail-section">
                    <div className="section-title">基本属性</div>
                    <div className="side-panel">
                      <div className="info-row">
                        <span>任务类型</span>
                        <span>{selectedTask.taskType ?? 'task'}</span>
                      </div>
                      <div className="info-row">
                        <span>所属项目</span>
                        <span className="link-text">{selectedTask.project}</span>
                      </div>
                      <div className="info-row">
                        <span>优先级</span>
                        <Tag color={getPriorityColor(selectedTask.priority)}>{selectedTask.priority}</Tag>
                      </div>
                      <div className="info-row">
                        <span>当前状态</span>
                        <Select
                          size="small"
                          value={selectedTask.status}
                          onChange={(value) =>
                            updateStatusMutation.mutate({
                              taskId: selectedTask.id,
                              status:
                                value === '待开始'
                                  ? '0'
                                  : value === '进行中'
                                    ? '1'
                                    : value === '待审核'
                                      ? '2'
                                      : value === '已完成'
                                        ? '3'
                                        : '4',
                            })
                          }
                          options={[
                            { label: '待开始', value: '待开始' },
                            { label: '进行中', value: '进行中' },
                            { label: '待审核', value: '待审核' },
                            { label: '已完成', value: '已完成' },
                            { label: '延期', value: '延期' },
                          ]}
                        />
                      </div>
                      <div className="info-row">
                        <span>负责人</span>
                        <Space>
                          <Avatar size="small">{selectedTask.owner.slice(0, 1)}</Avatar>
                          <span>{selectedTask.owner}</span>
                        </Space>
                      </div>
                      <div className="info-row">
                        <span>创建人</span>
                        <Space>
                          <Avatar size="small">{selectedTask.creatorName.slice(0, 1)}</Avatar>
                          <span>{selectedTask.creatorName}</span>
                        </Space>
                      </div>
                      <div className="info-row">
                        <span>协作人</span>
                        {selectedTask.collaborators?.length ? (
                          <Space wrap>
                            {selectedTask.collaborators.map((user) => (
                              <Tag key={user.userId}>{user.nickName}</Tag>
                            ))}
                          </Space>
                        ) : (
                          <span className="muted-text">暂无</span>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">时间信息</div>
                    <div className="side-panel">
                      <div className="info-row">
                        <span>开始时间</span>
                        <span>{selectedTask.startAt || '未设置'}</span>
                      </div>
                      <div className="info-row">
                        <span>计划截止</span>
                        <span className={selectedTask.status === '延期' ? 'danger-text' : ''}>
                          {selectedTask.dueAt || '未设置'}
                        </span>
                      </div>
                      <div className="info-row">
                        <span>任务进度</span>
                        <span>{selectedTask.progress ?? 0}%</span>
                      </div>
                      <div className="timeline-card">
                        <div className="timeline-header">
                          <span>时间进度</span>
                          <span className={selectedTask.dueCategory === 'overdue' ? 'danger-text' : ''}>
                            {selectedTask.dueText}
                          </span>
                        </div>
                        <Progress percent={selectedTask.progress ?? 0} showInfo={false} strokeColor="#ff7b88" />
                        <div className="timeline-scale">
                          <span>{selectedTask.startAt || '--'}</span>
                          <span>{selectedTask.dueAt || '--'}</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">AI 智能洞察</div>
                    <Alert
                      type={selectedTask.riskLevel === '3' ? 'error' : 'warning'}
                      showIcon
                      message="风险提示"
                      description={`当前任务状态为 ${selectedTask.status}，进度 ${selectedTask.progress ?? 0}% ，截止信息：${selectedTask.dueText}。`}
                    />
                  </section>
                </div>
              </div>
            ),
          },
          {
            key: 'comments',
            label: (
              <Space size={6}>
                评论
                <Tag bordered={false}>{selectedTask.comments.length}</Tag>
              </Space>
            ),
            children: selectedTask.comments.length ? (
              <List
                dataSource={selectedTask.comments}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Avatar>{item.userName.slice(0, 1)}</Avatar>}
                      title={`${item.userName} · ${item.createTime}`}
                      description={item.content}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <div className="tab-placeholder">暂无评论</div>
            ),
          },
          {
            key: 'logs',
            label: '操作日志',
            children: selectedTask.activities.length ? (
              <List
                dataSource={selectedTask.activities}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Avatar>{item.userName.slice(0, 1)}</Avatar>}
                      title={`${item.userName} · ${item.createTime}`}
                      description={`${item.actionType} · ${item.actionContent}`}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <div className="tab-placeholder">暂无操作日志</div>
            ),
          },
          {
            key: 'relations',
            label: '关联内容',
            children: selectedTask.relations.length ? (
              <List
                dataSource={selectedTask.relations}
                renderItem={(item) => (
                  <List.Item>
                    <Space>
                      {item.relationType === 'url' ? <LinkOutlined /> : <CopyOutlined />}
                      <span>{item.relationType}</span>
                      <span>{item.targetTitle}</span>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <div className="tab-placeholder">暂无关联内容</div>
            ),
          },
          {
            key: 'subtasks',
            label: (
              <Space size={6}>
                子任务
                <Tag bordered={false}>{selectedTask.subtasks.length}</Tag>
              </Space>
            ),
            children: <div className="tab-placeholder">子任务列表已在详情页主视图中展示。</div>,
          },
          {
            key: 'attachments',
            label: '附件',
            children: selectedTask.attachments.length ? (
              <List
                dataSource={selectedTask.attachments}
                renderItem={(item) => (
                  <List.Item>
                    <Space>
                      <FileTextOutlined />
                      <a href={item.fileUrl} target="_blank" rel="noreferrer">
                        {item.fileName}
                      </a>
                      <span className="muted-text">{item.fileSizeText}</span>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <div className="tab-placeholder">暂无附件</div>
            ),
          },
          {
            key: 'insight',
            label: 'AI 洞察',
            children: <div className="tab-placeholder">AI 洞察后续可接入 `POST /ai/task-insight`。</div>,
          },
        ]}
      />
    </Drawer>
  )
}

export default TaskDetailDrawer
