import dayjs from 'dayjs'
import type {
  ActivityView,
  AttachmentView,
  GanttRow,
  ProjectCard,
  RelationView,
  RiskTask,
  SelectOptionItem,
  Subtask,
  TaskCommentView,
  TaskDetailView,
  WorkTask,
  WorkloadMember,
} from '../types'
import type { ApiProject, ApiTask } from '../services/workspace.api'

const projectStatusMap: Record<string, ProjectCard['status']> = {
  '0': '进行中',
  '1': '已归档',
  '2': '已归档',
  '3': '已归档',
}

const statusMap: Record<ApiTask['status'], WorkTask['status']> = {
  '0': '待开始',
  '1': '进行中',
  '2': '已完成',
  '3': '延期',
}

const priorityMap: Record<string, WorkTask['priority']> = {
  '3': 'P0',
  '2': 'P1',
  '1': 'P2',
  '0': 'P3',
}

const workloadColors = ['#f6c54f', '#ff7c8b', '#1ed6a6', '#6f7cff', '#9b7bff']

const formatDueText = (date?: string) => {
  if (!date) return '未设置'
  const value = dayjs(date)
  if (!value.isValid()) return date
  if (value.isSame(dayjs(), 'day')) return `今天 ${value.format('HH:mm')}`
  if (value.isBefore(dayjs(), 'day')) return `已超期 ${dayjs().diff(value, 'day')} 天`
  return value.format('MM/DD HH:mm')
}

const getDueCategory = (date?: string): WorkTask['dueCategory'] => {
  if (!date) return 'week'
  const value = dayjs(date)
  if (value.isBefore(dayjs(), 'day')) return 'overdue'
  if (value.isSame(dayjs(), 'day')) return 'today'
  return 'week'
}

const resolveDueText = (task: ApiTask) => {
  if (task.status === '2') return '——'
  return task.dueText ?? formatDueText(task.dueTime)
}

const resolveDueCategory = (task: ApiTask): WorkTask['dueCategory'] => {
  if (task.status === '2') return 'completed'
  return task.dueCategory ?? getDueCategory(task.dueTime)
}

const bytesToText = (value?: number) => {
  if (!value) return '未知大小'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export const mapTaskToView = (task: ApiTask): WorkTask => ({
  id: String(task.id),
  title: task.taskName,
  project: task.project?.projectName ?? '未归属项目',
  priority: priorityMap[task.priority ?? '0'] ?? 'P3',
  status: statusMap[task.status],
  dueText: resolveDueText(task),
  owner: task.assignee?.nickName ?? '未分配',
  completed: task.status === '2',
  favorite: task.isFavorite,
  dueCategory: resolveDueCategory(task),
  projectId: task.projectId,
  ownerId: task.assigneeUserId,
  startAt: task.startTime,
  dueAt: task.dueTime,
  progress: task.progress,
  riskLevel: task.riskLevel,
  taskType: task.taskType,
  description: task.taskDesc,
  collaborators: task.collaborators?.map((user) => ({
    userId: user.userId,
    nickName: user.nickName,
  })),
})

export const mapTaskDetailToView = (task: ApiTask): TaskDetailView => {
  const base = mapTaskToView(task)
  const excludedCollaboratorIds = new Set(
    [task.assigneeUserId, task.creatorUserId].filter((value): value is string => Boolean(value)),
  )

  const subtasks: Subtask[] =
    task.subtasks?.map((item) => ({
      id: String(item.id),
      title: item.subtaskName,
      done: item.status === '1',
      owner: base.owner,
      status: item.status === '1' ? '已完成' : '进行中',
    })) ?? []

  const comments: TaskCommentView[] =
    task.comments?.map((item) => ({
      id: String(item.id),
      content: item.content,
      userName: item.user?.nickName ?? '未知用户',
      createTime: dayjs(item.createTime).format('MM/DD HH:mm'),
    })) ?? []

  const activities: ActivityView[] =
    task.activities?.map((item) => ({
      id: String(item.id),
      actionType: item.actionType,
      actionContent: item.actionContent ?? item.actionType,
      userName: item.user?.nickName ?? '系统',
      createTime: dayjs(item.createTime).format('MM/DD HH:mm'),
    })) ?? []

  const relations: RelationView[] =
    task.relations?.map((item) => ({
      id: String(item.id),
      relationType: item.relationType,
      targetTitle: item.targetTitle,
      targetUrl: item.targetUrl,
    })) ?? []

  const attachments: AttachmentView[] =
    task.attachments?.map((item) => ({
      id: String(item.id),
      fileName: item.fileName,
      fileUrl: item.fileUrl,
      fileSizeText: bytesToText(item.fileSize),
      metaText: `${bytesToText(item.fileSize)} · ${dayjs(item.createTime).format('MM/DD HH:mm')}`,
    })) ?? []

  return {
    ...base,
    creatorId: task.creatorUserId,
    creatorName: task.creator?.nickName ?? comments[0]?.userName ?? '未知用户',
    collaborators: base.collaborators?.filter((user) => !excludedCollaboratorIds.has(user.userId)) ?? [],
    attachments,
    comments,
    activities,
    relations,
    subtasks,
  }
}

export const mapRiskTaskToView = (task: ApiTask): RiskTask => ({
  id: String(task.id),
  title: task.taskName,
  project: task.project?.projectName ?? '未归属项目',
  priority: priorityMap[task.priority ?? '0'] ?? 'P3',
  risk: task.riskLevel === '3' ? '严重风险' : '风险提醒',
  dueText: formatDueText(task.dueTime),
})

export const mapProjectToCard = (project: ApiProject): ProjectCard => ({
  id: String(project.id),
  name: project.projectName,
  owner: project.owner?.nickName ?? '未分配',
  dueAt: project.endTime ? dayjs(project.endTime).format('YYYY.MM.DD') : '未设置',
  progress: Number(project.progress ?? 0),
  status: projectStatusMap[project.status] ?? '进行中',
  taskCount: project.taskCount ?? 0,
  doneCount: project.completedTaskCount ?? 0,
  riskCount: 0,
  delayCount: 0,
  members: Array.from({ length: Math.min(project.membersCount ?? 1, 3) }, (_, index) =>
    index === 0 ? (project.owner?.nickName?.slice(0, 1) ?? '项') : String(index + 1),
  ),
})

export const mapProjectTaskKanban = (input: Record<string, ApiTask[]>) => [
  { key: 'todo', title: '待开始', dotColor: '#8a92ff', tasks: input.notStarted ?? [] },
  { key: 'doing', title: '进行中', dotColor: '#5b79ff', tasks: input.inProgress ?? [] },
  { key: 'done', title: '已完成', dotColor: '#22d7a8', tasks: input.completed ?? [] },
  { key: 'delay', title: '延期', dotColor: '#ff7b88', tasks: input.delayed ?? [] },
].map((column) => ({
  key: column.key,
  title: column.title,
  dotColor: column.dotColor,
  count: column.tasks.length,
  tasks: column.tasks.map((task) => ({
    ...mapTaskToView(task),
    assignee: task.assignee?.nickName?.slice(0, 1) ?? '未',
  })),
}))

export const mapTaskListToBoardColumns = (tasks: ApiTask[]) => {
  const groups: Array<{ key: string; title: string; dotColor: string; matches: ApiTask['status'][] }> = [
    { key: 'todo-board', title: '待开始', dotColor: '#8a92ff', matches: ['0'] },
    { key: 'doing-board', title: '进行中', dotColor: '#5b79ff', matches: ['1'] },
    { key: 'done-board', title: '已完成', dotColor: '#22d7a8', matches: ['3'] },
    { key: 'delay-board', title: '延期', dotColor: '#ff7b88', matches: ['3'] },
  ]

  return groups.map((group) => {
    const matched = tasks.filter((task) => group.matches.includes(task.status))
    return {
      key: group.key,
      title: group.title,
      dotColor: group.dotColor,
      count: matched.length,
      tasks: matched.map((task) => ({
        ...mapTaskToView(task),
        assignee: task.assignee?.nickName?.slice(0, 1) ?? '未',
      })),
    }
  })
}

export const mapGanttRows = (
  items: Array<{ taskId: string; taskName: string; startTime?: string; dueTime?: string; progress: number; status: string }>,
): GanttRow[] => {
  const startCandidates = items.map((item) => dayjs(item.startTime ?? item.dueTime ?? dayjs().toISOString()))
  const endCandidates = items.map((item) => dayjs(item.dueTime ?? item.startTime ?? dayjs().toISOString()))
  const minStart = startCandidates.reduce((min, value) => (value.isBefore(min) ? value : min), startCandidates[0] ?? dayjs())
  const maxEnd = endCandidates.reduce((max, value) => (value.isAfter(max) ? value : max), endCandidates[0] ?? dayjs().add(7, 'day'))
  const totalDays = Math.max(maxEnd.diff(minStart, 'day') + 1, 1)

  return items.map((item) => {
    const start = dayjs(item.startTime ?? item.dueTime ?? dayjs().toISOString())
    const end = dayjs(item.dueTime ?? item.startTime ?? dayjs().toISOString())
    const offsetDays = Math.max(start.diff(minStart, 'day'), 0)
    const widthDays = Math.max(end.diff(start, 'day') + 1, 1)

    return {
      label: item.taskName,
      start: Number(((offsetDays / totalDays) * 100).toFixed(2)),
      width: Number(((widthDays / totalDays) * 100).toFixed(2)),
      color: item.status === '3' ? '#ff7a87' : item.status === '2' ? '#22d7a8' : '#5a7cff',
      note: `${Math.round(item.progress)}%`,
    }
  })
}

export const mapWorkload = (
  items: Array<{ userId: string; nickName: string; taskCount: number; urgentCount: number; loadPercent: number }>,
): WorkloadMember[] =>
  items.map((item, index) => ({
    userId: item.userId,
    name: item.nickName,
    value: item.loadPercent,
    color: workloadColors[index % workloadColors.length],
    urgentCount: item.urgentCount,
  }))

export const mapProjectOptions = (
  items: Array<{ id: string; projectName: string }>,
): SelectOptionItem[] => items.map((item) => ({ label: item.projectName, value: item.id }))

export const mapUserOptions = (
  items: Array<{ userId: string; nickName: string }>,
): SelectOptionItem[] => items.map((item) => ({ label: item.nickName, value: item.userId }))
