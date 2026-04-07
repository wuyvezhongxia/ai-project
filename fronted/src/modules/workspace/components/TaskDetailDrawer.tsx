import { CalendarOutlined, EditOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  Mentions,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd'
import { useWorkspaceStore } from '../store/workspace-store'
import { getAvatarLabel, getAvatarSeed, getAvatarStyle } from '../utils/avatar'
import { buildMemberMentionOptions } from '../utils/member-mentions'
import {
  useProjectOptionsQuery,
  useCreateSubtaskMutation,
  useCreateTaskCommentMutation,
  useTaskDetailQuery,
  useUpdateTaskStatusMutation,
  useUpdateSubtaskMutation,
  useUpdateTaskMutation,
  useUserOptionsQuery,
} from '../services/workspace.queries'
import { ApiClientError } from '../../../lib/http/api-client'
import type { ApiTaskInsight, UpdateSubtaskPayload } from '../services/workspace.api'
import { workspaceApi } from '../services/workspace.api'
import type { Subtask } from '../types'

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

const subtaskTableStatusOptions = [
  { label: '待处理', value: '0' as const },
  { label: '已完成', value: '1' as const },
  { label: '已取消', value: '2' as const },
]

const subtaskTablePriorityOptions = [
  { label: '低', value: '0' as const },
  { label: '中', value: '1' as const },
  { label: '高', value: '2' as const },
  { label: '紧急', value: '3' as const },
]

type MentionCandidate = {
  id: string
  name: string
  hint: string
}

type UserSelectOption = {
  value: string
  plainLabel: string
  label: ReactNode
}

/** 抽屉 + 横向滚动表格内，弹层挂到 body，避免被 overflow / transform 截断或点不到 */
const subtaskControlPopupContainer = () => document.body

const subtaskSelectPopupStyles: { popup: { root: CSSProperties } } = {
  popup: { root: { zIndex: 1100 } },
}

const parseInsightFromOutput = (output: string): ApiTaskInsight | null => {
  const fenced = output.match(/```json\s*([\s\S]*?)```/i)
  const jsonText = fenced?.[1] ?? (() => {
    const start = output.indexOf('{')
    const end = output.lastIndexOf('}')
    return start >= 0 && end > start ? output.slice(start, end + 1) : ''
  })()

  if (!jsonText.trim()) return null
  try {
    const parsed: Record<string, unknown> = JSON.parse(jsonText)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      risks: Array.isArray(parsed.risks)
        ? parsed.risks.filter((item: unknown): item is string => typeof item === 'string')
        : [],
      blockers: Array.isArray(parsed.blockers)
        ? parsed.blockers.filter((item: unknown): item is string => typeof item === 'string')
        : [],
      nextActions: Array.isArray(parsed.nextActions)
        ? parsed.nextActions
            .filter((item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object')
            .map((item: Record<string, unknown>) => {
              const action = typeof item.action === 'string' ? item.action : ''
              const owner = typeof item.owner === 'string' ? item.owner : undefined
              const due = typeof item.due === 'string' ? item.due : undefined
              const rawPriority = item.priority
              const priority: 'high' | 'medium' | 'low' | undefined =
                rawPriority === 'high' || rawPriority === 'medium' || rawPriority === 'low' ? rawPriority : undefined

              return {
                action,
                ...(owner ? { owner } : {}),
                ...(due ? { due } : {}),
                ...(priority ? { priority } : {}),
              }
            })
            .filter((item) => Boolean(item.action))
        : [],
      todayChecklist: Array.isArray(parsed.todayChecklist)
        ? parsed.todayChecklist.filter((item: unknown): item is string => typeof item === 'string')
        : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
    }
  } catch {
    return null
  }
}

function TaskDetailDrawer() {
  const detailOpen = useWorkspaceStore((state) => state.detailOpen)
  const closeTaskDetail = useWorkspaceStore((state) => state.closeTaskDetail)
  const selectedTaskId = useWorkspaceStore((state) => state.selectedTaskId)
  const { data: selectedTask, isLoading, isError, error } = useTaskDetailQuery(selectedTaskId)
  const { data: projectOptions = [] } = useProjectOptionsQuery()
  const { data: userOptions = [] } = useUserOptionsQuery()
  const updateTaskMutation = useUpdateTaskMutation()
  const updateTaskStatusMutation = useUpdateTaskStatusMutation()
  const createSubtaskMutation = useCreateSubtaskMutation()
  const updateSubtaskMutation = useUpdateSubtaskMutation()
  const createTaskCommentMutation = useCreateTaskCommentMutation()
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftComment, setDraftComment] = useState('')
  const [activeTabKey, setActiveTabKey] = useState('detail')
  const [descriptionState, setDescriptionState] = useState<'idle' | 'editing' | 'saving' | 'saved' | 'error'>('idle')
  const [editingProject, setEditingProject] = useState(false)
  const [editingCollaborators, setEditingCollaborators] = useState(false)
  const collaboratorFieldRef = useRef<HTMLDivElement>(null)
  const [subtaskComposerOpen, setSubtaskComposerOpen] = useState(false)
  const [draftSubtaskTitle, setDraftSubtaskTitle] = useState('')
  const [activeSubtaskId, setActiveSubtaskId] = useState<string | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightContent, setInsightContent] = useState('')
  const [insightData, setInsightData] = useState<ApiTaskInsight | null>(null)
  const [insightError, setInsightError] = useState('')
  const [insightGeneratedAt, setInsightGeneratedAt] = useState('')
  const [insightRequested, setInsightRequested] = useState(false)

  useEffect(() => {
    setDraftTitle(selectedTask?.title ?? '')
    setDraftDescription(selectedTask?.description ?? '')
    setDraftComment('')
    setActiveTabKey('detail')
    setDescriptionState('idle')
    setEditingProject(false)
    setEditingCollaborators(false)
    setSubtaskComposerOpen(false)
    setDraftSubtaskTitle('')
    setActiveSubtaskId(null)
    setInsightLoading(false)
    setInsightContent('')
    setInsightData(null)
    setInsightError('')
    setInsightGeneratedAt('')
    setInsightRequested(false)
  }, [selectedTask?.description, selectedTask?.id, selectedTask?.title])

  useEffect(() => {
    if (descriptionState !== 'saved') return

    const timer = window.setTimeout(() => {
      setDescriptionState('idle')
    }, 1800)

    return () => window.clearTimeout(timer)
  }, [descriptionState])

  useEffect(() => {
    if (!editingCollaborators) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (collaboratorFieldRef.current?.contains(target)) return
      if (target.closest('.collaborator-select-dropdown')) return
      setEditingCollaborators(false)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [editingCollaborators])

  useEffect(() => {
    if (!detailOpen || isLoading || !selectedTaskId || !isError) return

    if (error instanceof ApiClientError && error.code === 404) {
      closeTaskDetail()
      message.info('任务已删除，已自动关闭详情面板')
      return
    }

    closeTaskDetail()
    message.error('任务详情加载失败，已关闭详情面板')
  }, [closeTaskDetail, detailOpen, error, isError, isLoading, selectedTaskId])

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
  const editableStatusValue =
    selectedTask.rawStatus === '2' ? '已完成' : selectedTask.rawStatus === '0' ? '待开始' : '进行中'
  const isCompletedTask = selectedTask.rawStatus === '2' || selectedTask.status === '已完成'
  const isOverdueTask = selectedTask.dueCategory === 'overdue'
  const isHighRiskTask = selectedTask.riskLevel === '3'
  const taskProgress = selectedTask.progress ?? 0
  const detailInsightAlert = isCompletedTask
    ? {
        type: 'success' as const,
        message: '完成状态',
        description: isOverdueTask
          ? `任务已完成（曾延期），当前进度 ${taskProgress}% ，截止信息：${selectedTask.dueText}。`
          : `任务已完成，当前进度 ${taskProgress}% ，截止信息：${selectedTask.dueText}。`,
      }
    : isHighRiskTask || isOverdueTask
      ? {
          type: 'error' as const,
          message: '高风险提示',
          description: `当前任务状态为 ${selectedTask.status}，进度 ${taskProgress}% ，截止信息：${selectedTask.dueText}。`,
        }
      : {
          type: 'warning' as const,
          message: '风险提示',
          description: `当前任务状态为 ${selectedTask.status}，进度 ${taskProgress}% ，截止信息：${selectedTask.dueText}。`,
        }
  const mentionCandidateMap = new Map<string, MentionCandidate>()

  const registerMentionCandidate = (candidate?: Partial<MentionCandidate>) => {
    if (!candidate?.id || !candidate.name || mentionCandidateMap.has(candidate.id)) return

    mentionCandidateMap.set(candidate.id, {
      id: candidate.id,
      name: candidate.name,
      hint: candidate.hint ?? '组织成员',
    })
  }

  registerMentionCandidate({
    id: selectedTask.ownerId,
    name: selectedTask.owner,
    hint: '负责人',
  })
  registerMentionCandidate({
    id: selectedTask.creatorId,
    name: selectedTask.creatorName,
    hint: '创建人',
  })
  selectedTask.collaborators?.forEach((user) => {
    registerMentionCandidate({
      id: user.userId,
      name: user.nickName,
      hint: '协作人',
    })
  })
  userOptions.forEach((user) => {
    registerMentionCandidate({
      id: user.value,
      name: user.label,
      hint: '组织成员',
    })
  })

  const mentionOptions = buildMemberMentionOptions(Array.from(mentionCandidateMap.values()))
  const userSelectOptions: UserSelectOption[] = userOptions.map((user) => ({
    value: user.value,
    plainLabel: user.label,
    label: (
      <div className="user-select-option">
        <Avatar size={24} style={getAvatarStyle(getAvatarSeed(user.value, user.label))}>
          {getAvatarLabel(user.label)}
        </Avatar>
        <span className="user-select-option-name">{user.label}</span>
      </div>
    ),
  }))
  const collaboratorOptions = userSelectOptions.filter((user) => !excludedCollaboratorIds.has(user.value))

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

  const handleStatusUpdate = async (statusLabel: (typeof statusOptions)[number]['value']) => {
    const nextStatus = statusValueMap[statusLabel]
    try {
      await updateTaskStatusMutation.mutateAsync({
        taskId: selectedTask.id,
        status: nextStatus,
      })
    } catch (err) {
      const detail =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : '未知错误'
      message.error(`状态更新失败：${detail}`)
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
      setActiveTabKey('comments')
      message.success('评论已发布')
    } catch {
      message.error('评论发布失败，请稍后重试')
    }
  }

  const handleSubtaskComposerCancel = () => {
    setSubtaskComposerOpen(false)
    setDraftSubtaskTitle('')
  }

  const handleSubtaskComposerSubmit = async () => {
    const nextTitle = draftSubtaskTitle.trim()

    if (!nextTitle) {
      message.warning('请输入子项标题')
      return
    }

    try {
      await createSubtaskMutation.mutateAsync({
        taskId: selectedTask.id,
        payload: { subtaskName: nextTitle },
      })
      setDraftSubtaskTitle('')
      setSubtaskComposerOpen(false)
      message.success('子项已创建')
    } catch {
      message.error('子项创建失败，请稍后重试')
    }
  }

  const patchSubtask = async (subtaskId: string, payload: UpdateSubtaskPayload) => {
    setActiveSubtaskId(subtaskId)

    try {
      await updateSubtaskMutation.mutateAsync({
        taskId: selectedTask.id,
        subtaskId,
        payload,
      })
      if (payload.status === '2') {
        message.success('子项已取消')
      }
    } catch (err) {
      const detail =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : '未知错误'
      message.error(`子项更新失败：${detail}`)
    } finally {
      setActiveSubtaskId((current) => (current === subtaskId ? null : current))
    }
  }

  const subtaskDateCell = (
    record: Subtask,
    payloadKey: 'plannedStartTime' | 'plannedDueTime',
    value: string | null | undefined,
  ) => {
    const busy = updateSubtaskMutation.isPending && activeSubtaskId === record.id
    const dayValue = value ? dayjs(value) : null
    return (
      <DatePicker
        showTime
        size="small"
        allowClear
        placeholder="--"
        className={`subtask-table-date${dayValue ? '' : ' subtask-table-date-empty'}`}
        disabled={busy}
        value={dayValue}
        getPopupContainer={subtaskControlPopupContainer}
        popupStyle={{ zIndex: 1100 }}
        onChange={(next) => void patchSubtask(record.id, { [payloadKey]: next ? next.toISOString() : null })}
      />
    )
  }

  const subtaskColumns: ColumnsType<Subtask> = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      fixed: 'left',
      ellipsis: { showTitle: false },
      render: (text, record) => <span className={record.done ? 'subtask-done' : ''}>{text}</span>,
    },
    {
      title: '状态',
      key: 'status',
      width: 112,
      fixed: 'left',
      render: (_, record) => {
        const busy = updateSubtaskMutation.isPending && activeSubtaskId === record.id
        return (
          <Select
            size="small"
            className="subtask-table-select"
            value={record.rawStatus}
            options={subtaskTableStatusOptions}
            disabled={busy}
            getPopupContainer={subtaskControlPopupContainer}
            styles={subtaskSelectPopupStyles}
            onChange={(v) => void patchSubtask(record.id, { status: v as '0' | '1' | '2' })}
          />
        )
      },
    },
    {
      title: '优先级',
      key: 'priority',
      width: 100,
      fixed: 'left',
      render: (_, record) => {
        const busy = updateSubtaskMutation.isPending && activeSubtaskId === record.id
        return (
          <Select
            size="small"
            className="subtask-table-select"
            value={record.priority}
            options={subtaskTablePriorityOptions}
            disabled={busy}
            getPopupContainer={subtaskControlPopupContainer}
            styles={subtaskSelectPopupStyles}
            onChange={(v) => void patchSubtask(record.id, { priority: v as Subtask['priority'] })}
          />
        )
      },
    },
    {
      title: '创建人',
      key: 'creator',
      width: 132,
      fixed: 'left',
      render: (_, record) => (
        <Space size={8}>
          <Avatar size={28} style={getAvatarStyle(getAvatarSeed(record.creatorId, record.creatorName))}>
            {getAvatarLabel(record.creatorName)}
          </Avatar>
          <span className="subtask-creator-name">{record.creatorName}</span>
        </Space>
      ),
    },
    {
      title: '计划开始时间',
      key: 'plannedStart',
      width: 168,
      render: (_, record) => subtaskDateCell(record, 'plannedStartTime', record.plannedStartAt ?? null),
    },
    {
      title: '计划完成时间',
      key: 'plannedDue',
      width: 168,
      render: (_, record) => subtaskDateCell(record, 'plannedDueTime', record.plannedDueAt ?? null),
    },
  ]

  const commentComposer = (
    <div className="comment-composer">
      <Mentions
        value={draftComment}
        className="comment-composer-input"
        autoSize={{ minRows: 1, maxRows: 4 }}
        prefix={['@']}
        placement="top"
        options={mentionOptions}
        notFoundContent="未找到匹配成员"
        popupClassName="comment-mentions-dropdown"
        placeholder="发表评论，支持 @ 成员..."
        filterOption={(input, option) => {
          const current = String(option?.value ?? '').toLowerCase()
          return current.includes(input.toLowerCase())
        }}
        onChange={(value) => setDraftComment(value)}
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
  )

  const generateTaskInsight = async () => {
    if (insightLoading) return
    setInsightLoading(true)
    setInsightError('')
    setInsightRequested(true)

    const subtaskSnapshot =
      selectedTask.subtasks.length > 0
        ? selectedTask.subtasks
            .slice(0, 12)
            .map((subtask, index) => `${index + 1}. ${subtask.title}（状态:${subtask.rawStatus}，优先级:${subtask.priority}）`)
            .join('\n')
        : '暂无子项'
    const commentSnapshot =
      selectedTask.comments.length > 0
        ? selectedTask.comments
            .slice(-3)
            .map((comment, index) => `${index + 1}. ${comment.userName}: ${comment.content}`)
            .join('\n')
        : '暂无评论'
    const inputText = [
      '请基于以下任务数据输出 AI 洞察，要求：',
      '1) 先给出总体结论',
      '2) 输出 3-5 条关键风险/阻塞点',
      '3) 输出下一步可执行建议（按优先级）',
      '4) 结尾给出一个负责人可直接执行的今日行动清单',
      '',
      `任务标题：${selectedTask.title}`,
      `任务描述：${selectedTask.description || '无'}`,
      `任务状态：${selectedTask.status}（raw:${selectedTask.rawStatus}）`,
      `优先级：${selectedTask.priority}`,
      `风险等级：${selectedTask.riskLevel}`,
      `进度：${selectedTask.progress ?? 0}%`,
      `截止信息：${selectedTask.dueText}`,
      `负责人：${selectedTask.owner}`,
      `所属项目：${selectedTask.project}`,
      '',
      '子项快照：',
      subtaskSnapshot,
      '',
      '最新评论：',
      commentSnapshot,
    ].join('\n')

    try {
      const response = await workspaceApi.aiTaskInsight({
        bizId: selectedTask.projectId || selectedTask.id,
        inputText,
      })
      const output = response.output?.trim() || '暂未生成有效洞察，请稍后重试。'
      setInsightContent(output)
      setInsightData(response.insight ?? parseInsightFromOutput(output))
      setInsightGeneratedAt(dayjs().format('YYYY-MM-DD HH:mm:ss'))
    } catch (err) {
      const detail =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : '未知错误'
      setInsightError(detail)
    } finally {
      setInsightLoading(false)
    }
  }

  const handleTabChange = (nextTabKey: string) => {
    setActiveTabKey(nextTabKey)
    if (nextTabKey === 'insight' && !insightRequested && !insightLoading) {
      void generateTaskInsight()
    }
  }

  const insightPanel = (
    <div className="task-insight-pane">
      <div className="task-insight-toolbar">
        <div className="task-insight-meta">
          {insightGeneratedAt ? `最近生成：${insightGeneratedAt}` : '基于当前任务实时数据生成洞察'}
        </div>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={insightLoading}
          onClick={() => void generateTaskInsight()}
        >
          {insightContent ? '重新生成' : '生成洞察'}
        </Button>
      </div>

      {insightLoading ? (
        <div className="task-insight-loading">
          <Spin size="small" />
          <span>正在生成 AI 洞察...</span>
        </div>
      ) : null}

      {!insightLoading && insightError ? (
        <Alert
          type="error"
          showIcon
          message="洞察生成失败"
          description={insightError}
          action={
            <Button size="small" type="link" onClick={() => void generateTaskInsight()}>
              重试
            </Button>
          }
        />
      ) : null}

      {!insightLoading && !insightError && insightContent ? (
        insightData ? (
          <div className="task-insight-structured">
            <section className="task-insight-card">
              <h4>总体结论</h4>
              <p>{insightData.summary || '暂无结论'}</p>
            </section>

            <section className="task-insight-card">
              <h4>关键风险</h4>
              {insightData.risks.length > 0 ? (
                <ul className="task-insight-list">
                  {insightData.risks.map((risk, index) => (
                    <li key={`risk-${index}`}>{risk}</li>
                  ))}
                </ul>
              ) : (
                <p className="task-insight-empty">暂无明显风险</p>
              )}
            </section>

            <section className="task-insight-card">
              <h4>阻塞点</h4>
              {insightData.blockers.length > 0 ? (
                <ul className="task-insight-list">
                  {insightData.blockers.map((blocker, index) => (
                    <li key={`blocker-${index}`}>{blocker}</li>
                  ))}
                </ul>
              ) : (
                <p className="task-insight-empty">暂无阻塞点</p>
              )}
            </section>

            <section className="task-insight-card">
              <h4>下一步行动</h4>
              {insightData.nextActions.length > 0 ? (
                <ul className="task-insight-action-list">
                  {insightData.nextActions.map((item, index) => (
                    <li key={`action-${index}`} className="task-insight-action-item">
                      <div className="task-insight-action-main">{item.action}</div>
                      <div className="task-insight-action-meta">
                        {item.priority ? <Tag>{item.priority === 'high' ? '高优' : item.priority === 'medium' ? '中优' : '低优'}</Tag> : null}
                        {item.owner ? <span>负责人：{item.owner}</span> : null}
                        {item.due ? <span>截止：{item.due}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="task-insight-empty">暂无行动建议</p>
              )}
            </section>

            <section className="task-insight-card">
              <h4>今日行动清单</h4>
              {insightData.todayChecklist.length > 0 ? (
                <ul className="task-insight-checklist">
                  {insightData.todayChecklist.map((item, index) => (
                    <li key={`check-${index}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="task-insight-empty">暂无今日清单</p>
              )}
              {typeof insightData.confidence === 'number' ? (
                <p className="task-insight-confidence">置信度：{Math.round(insightData.confidence * 100)}%</p>
              ) : null}
            </section>
          </div>
        ) : (
          <div className="task-insight-content">{insightContent}</div>
        )
      ) : null}

      {!insightLoading && !insightError && !insightContent ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无洞察内容，点击右上角「生成洞察」获取建议"
        />
      ) : null}
    </div>
  )

  return (
    <Drawer
      open={detailOpen}
      onClose={closeTaskDetail}
      width={920}
      placement="right"
      className="task-detail-drawer"
      closeIcon={null}
      title={
        <div className="drawer-header-shell">
          <div className="drawer-title-block">
            <div className="drawer-title-main">
              <Input
                value={draftTitle}
                size="large"
                variant="borderless"
                className="drawer-title-input"
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={() => void handleTitleCommit()}
                onPressEnter={() => void handleTitleCommit()}
              />
            </div>
            <Space wrap className="drawer-summary">
              <span>
                <CalendarOutlined /> 截止 {selectedTask.dueText}
              </span>
              {selectedTask.dueCategory === 'today' ? <Tag color="error">今天到期</Tag> : null}
              {selectedTask.dueCategory === 'overdue' ? <Tag color="warning">已延期</Tag> : null}
              <span className="drawer-owner-summary">
                <UserOutlined />
                <span>负责人</span>
                <span title={selectedTask.owner || undefined}>
                  <Avatar
                    size="small"
                    style={getAvatarStyle(getAvatarSeed(selectedTask.ownerId, selectedTask.owner))}
                  >
                    {getAvatarLabel(selectedTask.owner)}
                  </Avatar>
                </span>
              </span>
            </Space>
          </div>
          <Button type="primary" className="drawer-close-button" onClick={closeTaskDetail}>
            关闭
          </Button>
        </div>
      }
    >
      <div className="drawer-content-shell">
        <div className="drawer-tabs-shell">
          <Tabs
            activeKey={activeTabKey}
            onChange={handleTabChange}
            items={[
          {
            key: 'detail',
            label: '详情',
            children: (
              <div className="detail-layout">
                <div className="detail-main">
                  <section className="detail-section">
                    <div className="section-title">任务描述</div>
                    <div className="rich-card detail-description-card">
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

                  <section className="detail-section subtask-section">
                    <Flex justify="space-between" align="center" className="detail-section-heading">
                      <div className="section-title">子任务进度</div>
                      {selectedTask.subtasks.length > 0 ? (
                        <div className="progress-summary">
                          {completedSubtasks} / {selectedTask.subtasks.length} · {subtaskPercent}%
                        </div>
                      ) : null}
                    </Flex>
                    {selectedTask.subtasks.length > 0 ? (
                      <Progress
                        percent={subtaskPercent}
                        showInfo={false}
                        strokeColor="#1677ff"
                        trailColor="#f0f0f0"
                        className="subtask-progress"
                      />
                    ) : null}
                    <div className="rich-card subtask-card">
                      <div className="subtask-table-wrap">
                        <Table<Subtask>
                          className="subtask-table"
                          size="small"
                          rowKey="id"
                          pagination={false}
                          dataSource={selectedTask.subtasks}
                          columns={subtaskColumns}
                          scroll={{ x: 984 }}
                          rowClassName={(_, index) => (index % 2 === 1 ? 'subtask-row-alt' : '')}
                          locale={{ emptyText: <div className="subtask-empty">暂无子项</div> }}
                        />
                      </div>
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
                              onPressEnter={() => void handleSubtaskComposerSubmit()}
                            />
                            <Space size={12} className="subtask-creator-actions">
                              <Button type="text" disabled={createSubtaskMutation.isPending} onClick={handleSubtaskComposerCancel}>
                                取消
                              </Button>
                              <Button
                                type="text"
                                className="subtask-creator-submit"
                                disabled={!draftSubtaskTitle.trim()}
                                loading={createSubtaskMutation.isPending}
                                onClick={() => void handleSubtaskComposerSubmit()}
                              >
                                新建
                              </Button>
                            </Space>
                          </div>
                          <div className="subtask-creator-meta">
                            <span>归属项目：{selectedTask.project}</span>
                            <span>优先级：{selectedTask.priority}</span>
                            <span>负责人：{selectedTask.owner || '未分配'}</span>
                          </div>
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
                          loading={updateTaskStatusMutation.isPending}
                          onChange={(value) => void handleStatusUpdate(value)}
                          options={statusOptions}
                        />
                      </div>
                      <div className="info-row">
                        <span>负责人</span>
                        <Select
                          size="small"
                          className="info-row-select"
                          value={selectedTask.ownerId}
                          options={userSelectOptions}
                          optionFilterProp="plainLabel"
                          placeholder="选择负责人"
                          popupClassName="user-select-dropdown"
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
                        <div ref={collaboratorFieldRef} className="info-row-content collaborator-field">
                          <div className="collaborator-inline-row">
                            <div className="collaborator-avatar-stack">
                              {selectedTask.collaborators?.map((user, index) => (
                                <span key={user.userId} title={user.nickName}>
                                  <Avatar
                                    size="small"
                                    className="collaborator-avatar-item"
                                    style={{
                                      ...getAvatarStyle(getAvatarSeed(user.userId, user.nickName)),
                                      zIndex: index + 1,
                                    }}
                                  >
                                    {getAvatarLabel(user.nickName)}
                                  </Avatar>
                                </span>
                              ))}
                            </div>
                            <Button
                              type="text"
                              size="small"
                              className="drawer-mini-action collaborator-add-btn"
                              icon={<PlusOutlined />}
                              onClick={() => setEditingCollaborators((value) => !value)}
                            />
                          </div>
                          {editingCollaborators ? (
                            <Select
                              mode="multiple"
                              size="small"
                              className="collaborator-select"
                              value={collaboratorIds}
                              options={collaboratorOptions}
                              optionFilterProp="plainLabel"
                              placeholder="选择协作人"
                              popupClassName="user-select-dropdown collaborator-select-dropdown"
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
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">AI 智能洞察</div>
                    <Alert
                      type={detailInsightAlert.type}
                      showIcon
                      message={detailInsightAlert.message}
                      description={detailInsightAlert.description}
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
            children: <div className="comments-tab-pane">{commentsContent}</div>,
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
                      description={item.actionContent}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <div className="tab-placeholder">暂无操作日志</div>
            ),
          },
          {
            key: 'insight',
            label: 'AI 洞察',
            children: insightPanel,
          },
            ]}
          />
        </div>
        <div className="drawer-bottom-composer">{commentComposer}</div>
      </div>
    </Drawer>
  )
}

export default TaskDetailDrawer
