export type PageKey = 'dashboard' | 'projects' | 'todos'

export type ProjectView = 'list' | 'kanban' | 'gantt' | 'stats'

export type TodoScope = 'all' | 'owned' | 'created' | 'collaborated'

export type TodoView = 'list' | 'kanban'

export type WorkTask = {
  id: string
  title: string
  project: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status: '待开始' | '进行中' | '已完成' | '延期'
  dueText: string
  owner: string
  completed?: boolean
  favorite?: boolean
  scope?: Exclude<TodoScope, 'all'>
  dueCategory?: 'today' | 'week' | 'overdue' | 'completed'
  projectId?: string
  ownerId?: string
  startAt?: string
  dueAt?: string
  progress?: number
  riskLevel?: string
  taskType?: string
  description?: string
  collaborators?: Array<{ userId: string; nickName: string }>
}

export type RiskTask = {
  id: string
  title: string
  project: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  risk: string
  dueText: string
}

export type Subtask = {
  id: string
  title: string
  done: boolean
  owner: string
  status?: string
}

export type TaskCommentView = {
  id: string
  content: string
  userName: string
  createTime: string
}

export type AttachmentView = {
  id: string
  fileName: string
  fileUrl: string
  fileSizeText: string
  metaText: string
}

export type ActivityView = {
  id: string
  actionType: string
  actionContent: string
  userName: string
  createTime: string
}

export type RelationView = {
  id: string
  relationType: string
  targetTitle: string
  targetUrl?: string
}

export type TaskDetailView = WorkTask & {
  creatorId?: string
  creatorName: string
  attachments: AttachmentView[]
  comments: TaskCommentView[]
  activities: ActivityView[]
  relations: RelationView[]
  subtasks: Subtask[]
}

export type ProjectCard = {
  id: string
  name: string
  owner: string
  dueAt: string
  progress: number
  status: '进行中' | '未开始' | '已归档'
  taskCount: number
  doneCount: number
  riskCount: number
  delayCount: number
  members: string[]
}

export type BoardTask = WorkTask & {
  assignee: string
}

export type BoardColumn = {
  key: string
  title: string
  dotColor: string
  count: number
  tasks: BoardTask[]
}

export type GanttRow = {
  label: string
  start: number
  width: number
  color: string
  note: string
}

export type WorkloadMember = {
  userId: string
  name: string
  value: number
  color: string
  urgentCount: number
}

export type SelectOptionItem = {
  label: string
  value: string
}
