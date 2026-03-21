import {
  CalendarOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CopyOutlined,
  EllipsisOutlined,
  FileTextOutlined,
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
  Flex,
  List,
  Progress,
  Select,
  Space,
  Tabs,
  Tag,
} from 'antd'
import { detailSubtasks } from '../data/mock'
import { useWorkspaceStore } from '../store/workspace-store'
import { getAllTasks, getPriorityColor, getStatusColor } from '../utils/task-ui'

function TaskDetailDrawer() {
  const detailOpen = useWorkspaceStore((state) => state.detailOpen)
  const closeTaskDetail = useWorkspaceStore((state) => state.closeTaskDetail)
  const selectedTaskId = useWorkspaceStore((state) => state.selectedTaskId)
  const todoTasks = useWorkspaceStore((state) => state.todoTasks)

  const selectedTask = getAllTasks(todoTasks).find((task) => task.id === selectedTaskId)

  if (!selectedTask) {
    return null
  }

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
                      <p>本次产品需求评审文档需涵盖以下核心内容：</p>
                      <ol>
                        <li>用户场景梳理，整理目标用户的核心使用场景，共 5 个主要场景。</li>
                        <li>功能边界定义，明确 V2.3 版本的功能范围，不做范围外需求。</li>
                        <li>交互流程图，覆盖主流程与异常流程，需与 UI 同步评审。</li>
                        <li>验收标准，每个功能点需有明确的验收标准和测试用例。</li>
                      </ol>
                      <p className="muted-text">点击此处可直接编辑描述内容</p>
                    </div>
                  </section>

                  <section className="detail-section">
                    <Flex justify="space-between" align="center">
                      <div className="section-title">子任务进度</div>
                      <div className="progress-summary">2 / 3 · 66%</div>
                    </Flex>
                    <Progress
                      percent={66}
                      showInfo={false}
                      strokeColor="#20d6a7"
                      trailColor="rgba(255,255,255,0.08)"
                    />
                    <List
                      dataSource={detailSubtasks}
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
                            <span className="muted-text">{item.owner}</span>
                            {item.status ? <Tag color="processing">{item.status}</Tag> : null}
                          </Space>
                        </List.Item>
                      )}
                    />
                    <Button icon={<PlusOutlined />}>添加子任务</Button>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">附件</div>
                    <div className="attachment-grid">
                      <Card className="attachment-card" bordered={false}>
                        <Space direction="vertical" size={4}>
                          <Space>
                            <FileTextOutlined />
                            <span>PRD_V2.3_草稿.docx</span>
                          </Space>
                          <span className="muted-text">2.4 MB · 昨天上传</span>
                        </Space>
                      </Card>
                      <Card className="attachment-card" bordered={false}>
                        <Space direction="vertical" size={4}>
                          <Space>
                            <CopyOutlined />
                            <span>交互流程图_v1.png</span>
                          </Space>
                          <span className="muted-text">1.1 MB · 今天上传</span>
                        </Space>
                      </Card>
                    </div>
                    <Button icon={<PlusOutlined />}>上传附件</Button>
                  </section>
                </div>

                <div className="detail-side">
                  <section className="detail-section">
                    <div className="section-title">基本属性</div>
                    <div className="side-panel">
                      <div className="info-row">
                        <span>任务类型</span>
                        <span>任务</span>
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
                          defaultValue={selectedTask.status}
                          options={[
                            { label: '待开始', value: '待开始' },
                            { label: '进行中', value: '进行中' },
                            { label: '待审核', value: '待审核' },
                            { label: '已完成', value: '已完成' },
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
                          <Avatar size="small">张</Avatar>
                          <span>张小明</span>
                        </Space>
                      </div>
                      <div className="info-row">
                        <span>协作人</span>
                        <Space>
                          <Avatar size="small">李</Avatar>
                          <span className="link-text">添加</span>
                        </Space>
                      </div>
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">时间信息</div>
                    <div className="side-panel">
                      <div className="info-row">
                        <span>开始时间</span>
                        <span>2026-03-01</span>
                      </div>
                      <div className="info-row">
                        <span>计划截止</span>
                        <span className="danger-text">2026-03-04</span>
                      </div>
                      <div className="info-row">
                        <span>预计工时</span>
                        <span>3 天</span>
                      </div>
                      <div className="timeline-card">
                        <div className="timeline-header">
                          <span>时间进度</span>
                          <span className="danger-text">今天到期</span>
                        </div>
                        <Progress percent={95} showInfo={false} strokeColor="#ff7b88" />
                        <div className="timeline-scale">
                          <span>03-01</span>
                          <span>03-04</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">AI 智能洞察</div>
                    <Alert
                      type="warning"
                      showIcon
                      message="风险提示"
                      description="该任务今日到期，子任务完成率 66%，根据历史数据，张小明平均提前完成，风险较低。"
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
                <Tag bordered={false}>4</Tag>
              </Space>
            ),
            children: <div className="tab-placeholder">评论模块后续可接入 `GET /tasks/:id/comments`。</div>,
          },
          {
            key: 'logs',
            label: '操作日志',
            children: <div className="tab-placeholder">操作日志模块后续可接入 `GET /tasks/:id/activities`。</div>,
          },
          {
            key: 'relations',
            label: '关联内容',
            children: <div className="tab-placeholder">关联内容模块后续可接入 `GET /tasks/:id/relations`。</div>,
          },
          {
            key: 'subtasks',
            label: (
              <Space size={6}>
                子任务
                <Tag bordered={false}>3</Tag>
              </Space>
            ),
            children: <div className="tab-placeholder">子任务列表已在详情页主视图中展示。</div>,
          },
          {
            key: 'attachments',
            label: '附件',
            children: <div className="tab-placeholder">附件模块后续可接入 `GET /tasks/:id/attachments`。</div>,
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
