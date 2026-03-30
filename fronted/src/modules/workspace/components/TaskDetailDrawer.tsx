import {
  CalendarOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CopyOutlined,
  EditOutlined,
  EllipsisOutlined,
  LinkOutlined,
  PlusOutlined,
  StarOutlined,
  UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import {
  Alert,
  Avatar,
  Button,
  DatePicker,
  Drawer,
  Empty,
  Flex,
  Input,
  List,
  Progress,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  message,
} from 'antd'
import { useWorkspaceStore } from '../store/workspace-store'
import { getPriorityColor, getStatusColor } from '../utils/task-ui'
import { getAvatarLabel, getAvatarSeed, getAvatarStyle } from '../utils/avatar'
import {
  useProjectOptionsQuery,
  useAuthContextQuery,
  useCreateTaskCommentMutation,
  useTaskDetailQuery,
  useUpdateTaskMutation,
  useUserOptionsQuery,
} from '../services/workspace.queries'

const statusOptions = [
  { label: '待开始', value: '待开始' },
  { label: '进行中', value: '进行中' },
  { label: '已完成', value: '已完成' },
]

const priorityOptions = [
  { label: 'P0', value: 'P0' },
  { label: 'P1', value: 'P1' },
  { label: 'P2', value: 'P2' },
  { label: 'P3', value: 'P3' },
]

const statusValueMap: Record<(typeof statusOptions)[number]['value'], '0' | '1' | '2'> = {
  待开始: '0',
  进行中: '1',
  已完成: '2',
}

const priorityValueMap: Record<(typeof priorityOptions)[number]['value'], '0' | '1' | '2' | '3'> = {
  P0: '3',
  P1: '2',
  P2: '1',
  P3: '0',
}

function TaskDetailDrawer() {
  const detailOpen = useWorkspaceStore((state) => state.detailOpen)
  const closeTaskDetail = useWorkspaceStore((state) => state.closeTaskDetail)
  const selectedTaskId = useWorkspaceStore((state) => state.selectedTaskId)
  const { data: selectedTask, isLoading } = useTaskDetailQuery(selectedTaskId)
  const { data: authContext } = useAuthContextQuery()
  const { data: projectOptions = [] } = useProjectOptionsQuery()
  const { data: userOptions = [] } = useUserOptionsQuery()
  const updateTaskMutation = useUpdateTaskMutation()
  const createTaskCommentMutation = useCreateTaskCommentMutation()
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftComment, setDraftComment] = useState('')
  const [descriptionState, setDescriptionState] = useState<'idle' | 'editing' | 'saving' | 'saved' | 'error'>('idle')
  const [editingProject, setEditingProject] = useState(false)
  const [editingCollaborators, setEditingCollaborators] = useState(false)
  const [subtaskComposerOpen, setSubtaskComposerOpen] = useState(false)
  const [draftSubtaskTitle, setDraftSubtaskTitle] = useState('')

  useEffect(() => {
    setDraftTitle(selectedTask?.title ?? '')
    setDraftDescription(selectedTask?.description ?? '')
    setDraftComment('')
    setDescriptionState('idle')
    setEditingProject(false)
    setEditingCollaborators(false)
    setSubtaskComposerOpen(false)
    setDraftSubtaskTitle('')
  }, [selectedTask?.description, selectedTask?.id, selectedTask?.title])

  useEffect(() => {
    if (descriptionState !== 'saved') return

    const timer = window.setTimeout(() => {
      setDescriptionState('idle')
    }, 1800)

    return () => window.clearTimeout(timer)
  }, [descriptionState])

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
  const excludedCollaboratorIds = new Set(
    [selectedTask.ownerId, selectedTask.creatorId].filter((value): value is string => Boolean(value)),
  )
  const collaboratorIds = (selectedTask.collaborators?.map((user) => user.userId) ?? []).filter(
    (userId) => !excludedCollaboratorIds.has(userId),
  )
  const collaboratorOptions = userOptions.filter((user) => !excludedCollaboratorIds.has(user.value))
  const currentCommentUserName = authContext?.nickName ?? authContext?.userName ?? '我'
  const editableStatusValue =
    selectedTask.rawStatus === '2' ? '已完成' : selectedTask.rawStatus === '0' ? '待开始' : '进行中'
  const commentsContent = selectedTask.comments.length ? (
    <List
      dataSource={selectedTask.comments}
      renderItem={(item) => (
        <List.Item className="comment-row">
          <List.Item.Meta
            avatar={<Avatar style={getAvatarStyle(getAvatarSeed(item.userName))}>{getAvatarLabel(item.userName)}</Avatar>}
            title={
              <Space size={8} wrap>
                <span className="comment-user-name">{item.userName}</span>
                <span className="comment-time">{item.createTime}</span>
              </Space>
            }
            description={<div className="comment-content">{item.content}</div>}
          />
        </List.Item>
      )}
    />
  ) : (
    <div className="tab-placeholder">暂无评论</div>
  )

  const handleTaskUpdate = async (
    payload: Parameters<typeof updateTaskMutation.mutateAsync>[0]['payload'],
    afterSuccess?: () => void,
  ) => {
    try {
      await updateTaskMutation.mutateAsync({
        taskId: selectedTask.id,
        payload,
      })
      afterSuccess?.()
    } catch {
      message.error('任务更新失败，请稍后重试')
    }
  }

  const handleTitleCommit = async () => {
    const nextTitle = draftTitle.trim()

    if (!nextTitle) {
      setDraftTitle(selectedTask.title)
      return
    }

    if (nextTitle === selectedTask.title) return

    await handleTaskUpdate({ taskName: nextTitle })
  }

  const handleDescriptionCommit = async () => {
    if (draftDescription === (selectedTask.description ?? '')) return

    setDescriptionState('saving')

    try {
      await updateTaskMutation.mutateAsync({
        taskId: selectedTask.id,
        payload: { taskDesc: draftDescription },
      })
      setDescriptionState('saved')
    } catch {
      setDescriptionState('error')
      message.error('任务更新失败，请稍后重试')
    }
  }

  const handleCommentSubmit = async () => {
    const content = draftComment.trim()
    if (!content) {
      message.warning('请输入评论内容')
      return
    }

    try {
      await createTaskCommentMutation.mutateAsync({
        taskId: selectedTask.id,
        payload: { content },
      })
      setDraftComment('')
      message.success('评论已发布')
    } catch {
      message.error('评论发布失败，请稍后重试')
    }
  }

  const handleSubtaskComposerCancel = () => {
    setSubtaskComposerOpen(false)
    setDraftSubtaskTitle('')
  }

  const handleSubtaskComposerSubmit = () => {
    if (!draftSubtaskTitle.trim()) {
      message.warning('请输入子项标题')
      return
    }

    message.info('子项创建接口待接入，当前先保留交互样式')
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
          <Input
            value={draftTitle}
            size="large"
            variant="borderless"
            className="drawer-title-input"
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={() => void handleTitleCommit()}
            onPressEnter={() => void handleTitleCommit()}
          />
          <Space wrap className="drawer-summary">
            <span>
              <CalendarOutlined /> 截止 {selectedTask.dueText}
            </span>
            {selectedTask.dueCategory === 'today' ? <Tag color="error">今天到期</Tag> : null}
            {selectedTask.dueCategory === 'overdue' ? <Tag color="warning">已延期</Tag> : null}
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
                      <Input.TextArea
                        value={draftDescription}
                        autoSize={{ minRows: 4, maxRows: 10 }}
                        className="detail-description-input"
                        placeholder="输入任务描述、背景信息或补充说明..."
                        onChange={(event) => {
                          setDraftDescription(event.target.value)
                          setDescriptionState('editing')
                        }}
                        onBlur={() => void handleDescriptionCommit()}
                      />
                      <p className={`description-status description-status-${descriptionState}`}>
                        {descriptionState === 'editing' ? '编辑中，失去焦点后自动保存' : null}
                        {descriptionState === 'saving' ? '保存中...' : null}
                        {descriptionState === 'saved' ? '已保存' : null}
                        {descriptionState === 'error' ? '保存失败，请重试' : null}
                        {descriptionState === 'idle' ? '描述会在失去焦点时自动保存。' : null}
                      </p>
                    </div>
                  </section>

                  <section className="detail-section">
                    <Flex justify="space-between" align="center" className="detail-section-heading">
                      <div className="section-title">子任务进度</div>
                      <div className="progress-summary">
                        {completedSubtasks} / {selectedTask.subtasks.length} · {subtaskPercent}%
                      </div>
                    </Flex>
                    <div className="subtask-progress-card">
                      <Progress
                        percent={subtaskPercent}
                        showInfo={false}
                        strokeColor="#20d6a7"
                        trailColor="var(--pm-chart-trail)"
                      />
                    </div>
                    <div className="rich-card subtask-card">
                      <List
                        className="subtask-list"
                        dataSource={selectedTask.subtasks}
                        locale={{ emptyText: <div className="subtask-empty">暂无子项</div> }}
                        renderItem={(item) => (
                          <List.Item className="subtask-row">
                            <Space size={10}>
                              {item.done ? (
                                <CheckCircleFilled className="success-icon" />
                              ) : (
                                <ClockCircleOutlined className="pending-icon" />
                              )}
                              <span className={item.done ? 'subtask-done' : ''}>{item.title}</span>
                            </Space>
                            <Space size={10} className="subtask-row-meta">
                              <span className="muted-text">{item.owner || '未分配'}</span>
                              {item.status ? <Tag color="processing">{item.status}</Tag> : null}
                            </Space>
                          </List.Item>
                        )}
                      />
                      {subtaskComposerOpen ? (
                        <div className="subtask-creator">
                          <div className="subtask-creator-input-row">
                            <PlusOutlined className="subtask-creator-icon" />
                            <Input
                              value={draftSubtaskTitle}
                              variant="borderless"
                              className="subtask-creator-input"
                              placeholder="新建子项"
                              autoFocus
                              onChange={(event) => setDraftSubtaskTitle(event.target.value)}
                              onPressEnter={() => handleSubtaskComposerSubmit()}
                            />
                            <Space size={12} className="subtask-creator-actions">
                              <Button type="text" onClick={handleSubtaskComposerCancel}>
                                取消
                              </Button>
                              <Button
                                type="text"
                                className="subtask-creator-submit"
                                disabled={!draftSubtaskTitle.trim()}
                                onClick={handleSubtaskComposerSubmit}
                              >
                                新建
                              </Button>
                            </Space>
                          </div>
                          <Space wrap size={[8, 8]} className="subtask-creator-meta">
                            <Tag bordered={false}>归属项目：{selectedTask.project}</Tag>
                            <Tag bordered={false}>优先级：{selectedTask.priority}</Tag>
                            <Tag bordered={false}>负责人：{selectedTask.owner || '未分配'}</Tag>
                          </Space>
                        </div>
                      ) : (
                        <Button
                          type="text"
                          className="subtask-create-trigger"
                          icon={<PlusOutlined />}
                          onClick={() => setSubtaskComposerOpen(true)}
                        >
                          新建子项
                        </Button>
                      )}
                    </div>
                  </section>

                  <section className="detail-section">
                    <Flex justify="space-between" align="center">
                      <div className="section-title">最新评论</div>
                      <Tag bordered={false} className="section-count-tag">
                        {selectedTask.comments.length}
                      </Tag>
                    </Flex>
                    <div className="rich-card comment-panel">{commentsContent}</div>
                    <div className="comment-composer">
                      <Avatar className="comment-composer-avatar" style={getAvatarStyle(getAvatarSeed(currentCommentUserName))}>
                        {getAvatarLabel(currentCommentUserName)}
                      </Avatar>
                      <Input
                        value={draftComment}
                        className="comment-composer-input"
                        placeholder="发表评论，支持 @ 成员..."
                        onChange={(event) => setDraftComment(event.target.value)}
                        onPressEnter={(event) => {
                          if (event.shiftKey) return
                          event.preventDefault()
                          void handleCommentSubmit()
                        }}
                      />
                      <Button
                        type="primary"
                        className="comment-composer-submit"
                        loading={createTaskCommentMutation.isPending}
                        onClick={() => void handleCommentSubmit()}
                      >
                        发送
                      </Button>
                    </div>
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
                        <div className="info-row-content">
                          {editingProject ? (
                            <Select
                              size="small"
                              className="info-row-select"
                              value={selectedTask.projectId}
                              options={projectOptions}
                              placeholder="选择项目"
                              onChange={(value) =>
                                void handleTaskUpdate({ projectId: value }, () => {
                                  setEditingProject(false)
                                })
                              }
                            />
                          ) : (
                            <Space size={4}>
                              <span className="link-text">{selectedTask.project}</span>
                              <Button
                                type="text"
                                size="small"
                                className="drawer-mini-action"
                                icon={<EditOutlined />}
                                onClick={() => setEditingProject(true)}
                              />
                            </Space>
                          )}
                        </div>
                      </div>
                      <div className="info-row">
                        <span>优先级</span>
                        <Select
                          size="small"
                          className="info-row-select"
                          value={selectedTask.priority}
                          options={priorityOptions}
                          onChange={(value) => void handleTaskUpdate({ priority: priorityValueMap[value] })}
                        />
                      </div>
                      <div className="info-row">
                        <span>当前状态</span>
                        <Select
                          size="small"
                          className="info-row-select"
                          value={editableStatusValue}
                          onChange={(value) => void handleTaskUpdate({ status: statusValueMap[value] })}
                          options={statusOptions}
                        />
                      </div>
                      <div className="info-row">
                        <span>负责人</span>
                        <Select
                          size="small"
                          className="info-row-select"
                          value={selectedTask.ownerId}
                          options={userOptions}
                          placeholder="选择负责人"
                          onChange={(value) => void handleTaskUpdate({ assigneeUserId: value })}
                        />
                      </div>
                      <div className="info-row">
                        <span>创建人</span>
                        <Space>
                          <Avatar size="small" style={getAvatarStyle(getAvatarSeed(selectedTask.creatorId, selectedTask.creatorName))}>
                            {getAvatarLabel(selectedTask.creatorName)}
                          </Avatar>
                          <span>{selectedTask.creatorName}</span>
                        </Space>
                      </div>
                      <div className="info-row">
                        <span>协作人</span>
                        <div className="info-row-content collaborator-field">
                          {selectedTask.collaborators?.length ? (
                            <Space wrap>
                              {selectedTask.collaborators.map((user) => (
                                <Tag key={user.userId}>{user.nickName}</Tag>
                              ))}
                            </Space>
                          ) : (
                            <span className="muted-text">暂无</span>
                          )}
                          <Button
                            type="text"
                            size="small"
                            className="drawer-mini-action"
                            icon={<PlusOutlined />}
                            onClick={() => setEditingCollaborators((value) => !value)}
                          />
                          {editingCollaborators ? (
                            <Select
                              mode="multiple"
                              size="small"
                              className="collaborator-select"
                              value={collaboratorIds}
                              options={collaboratorOptions}
                              placeholder="选择协作人"
                              onChange={(value) =>
                                void handleTaskUpdate({
                                  collaboratorUserIds: (value as string[]).filter(
                                    (userId) => !excludedCollaboratorIds.has(userId),
                                  ),
                                })
                              }
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">时间信息</div>
                    <div className="side-panel">
                      <div className="info-row">
                        <span>开始时间</span>
                        <DatePicker
                          size="small"
                          showTime
                          allowClear={false}
                          className="info-row-picker"
                          value={selectedTask.startAt ? dayjs(selectedTask.startAt) : null}
                          onChange={(value) => {
                            if (!value) return
                            void handleTaskUpdate({ startTime: value.toISOString() })
                          }}
                        />
                      </div>
                      <div className="info-row">
                        <span>计划截止</span>
                        <DatePicker
                          size="small"
                          showTime
                          allowClear={false}
                          className="info-row-picker"
                          value={selectedTask.dueAt ? dayjs(selectedTask.dueAt) : null}
                          onChange={(value) => {
                            if (!value) return
                            void handleTaskUpdate({ dueTime: value.toISOString() })
                          }}
                        />
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
            children: commentsContent,
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
                      avatar={<Avatar style={getAvatarStyle(getAvatarSeed(item.userName))}>{getAvatarLabel(item.userName)}</Avatar>}
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
