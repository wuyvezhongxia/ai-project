import { apiRequest } from '../../../lib/http/api-client'

export type ApiUserOption = {
  userId: string
  nickName: string
}

export type ApiTaskUser = {
  userId: string
  userName: string
  nickName: string
  deptId?: string
}

export type ApiTask = {
  id: string
  taskName: string
  taskDesc?: string
  projectId?: string
  project?: { id: string; projectName: string; status?: string } | null
  priority?: '0' | '1' | '2' | '3'
  status: '0' | '1' | '2' | '3' | '4'
  dueTime?: string
  startTime?: string
  progress: number
  assignee?: ApiTaskUser | null
  creator?: ApiTaskUser | null
  assigneeUserId?: string
  creatorUserId: string
  createBy?: string
  riskLevel?: string
  isFavorite?: boolean
  taskType?: string
  collaborators?: ApiTaskUser[]
  subtaskSummary?: {
    total: number
    completed: number
  }
  comments?: Array<{
    id: string
    content: string
    createTime: string
    user?: ApiTaskUser | null
  }>
  activities?: Array<{
    id: string
    actionType: string
    actionContent?: string
    createTime: string
    user?: ApiTaskUser | null
  }>
  relations?: Array<{
    id: string
    relationType: string
    targetTitle: string
    targetUrl?: string
  }>
  attachments?: Array<{
    id: string
    fileName: string
    fileUrl: string
    fileSize?: number
    createTime: string
  }>
  subtasks?: Array<{
    id: string
    subtaskName: string
    status: '0' | '1'
    createTime?: string
  }>
}

export type ApiProject = {
  id: string
  projectName: string
  owner?: ApiTaskUser | null
  ownerUserId: string
  endTime?: string
  progress: number
  status: '0' | '1' | '2' | '3'
  taskCount: number
  completedTaskCount: number
  membersCount?: number
}

export type CreateProjectPayload = {
  projectCode?: string
  projectName: string
  projectDesc?: string
  ownerUserId: string
  priority?: '0' | '1' | '2' | '3'
  startTime?: string
  endTime?: string
  visibility?: '0' | '1' | '2'
  memberUserIds: string[]
  tagIds: string[]
}

export type UpdateTaskPayload = Partial<{
  projectId: string
  taskName: string
  taskDesc: string
  assigneeUserId: string
  taskType: 'task' | 'bug' | 'todo'
  priority: '0' | '1' | '2' | '3'
  progress: number
  startTime: string
  dueTime: string
  collaboratorUserIds: string[]
  status: '0' | '1' | '2' | '3' | '4'
}>

export type ApiProjectGanttItem = {
  taskId: string
  taskName: string
  startTime?: string
  dueTime?: string
  progress: number
  status: string
}

export type ApiWorkloadItem = {
  userId: string
  nickName: string
  taskCount: number
  urgentCount: number
  loadPercent: number
}

export type ApiDashboard = {
  today: ApiTask[]
  owned: ApiTask[]
  created: ApiTask[]
  favorite: ApiTask[]
  risk: ApiTask[]
  summary: {
    total: number
    owned: number
    today: number
    risk: number
  }
}

export const workspaceApi = {
  getAuthContext: () =>
    apiRequest<{
      userId: string
      tenantId: string
      deptId?: string
      userName?: string
      nickName?: string
      roleIds: string[]
    }>('/api/auth/context'),

  getDashboard: () => apiRequest<ApiDashboard>('/api/tasks/dashboard'),
  getMustDoToday: () => apiRequest<ApiTask[]>('/api/tasks/must-do-today'),
  getRiskTasks: () => apiRequest<ApiTask[]>('/api/tasks/risk'),
  getWorkload: (range: 'week' | 'month' = 'week') => apiRequest<ApiWorkloadItem[]>(`/api/workload/team?range=${range}`),

  getProjects: (params?: URLSearchParams) =>
    apiRequest<ApiProject[]>(`/api/projects${params?.toString() ? `?${params.toString()}` : ''}`),
  getProjectTasks: (projectId: string, view: 'list' | 'kanban') =>
    apiRequest<ApiTask[] | Record<string, ApiTask[]>>(`/api/projects/${projectId}/tasks?view=${view}`),
  getProjectGantt: (projectId: string) => apiRequest<ApiProjectGanttItem[]>(`/api/projects/${projectId}/gantt`),
  getProjectStatistics: (projectId: string) =>
    apiRequest<{
      totalTasks: number
      completedTasks: number
      delayedTasks: number
      overdueTasks: number
      completionRate: number
    }>(`/api/projects/${projectId}/statistics`),
  getProjectOptions: () => apiRequest<Array<{ id: string; projectName: string; status?: string }>>('/api/projects/options'),

  getTodoTasks: (params: URLSearchParams) => apiRequest<ApiTask[]>(`/api/tasks/todo?${params.toString()}`),
  getTodoTasksKanban: (params: URLSearchParams) => apiRequest<ApiTask[] | Record<string, ApiTask[]>>(`/api/tasks/todo?${params.toString()}`),
  deleteTask: (taskId: string) => apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' }),

  getTaskDetail: (taskId: string) => apiRequest<ApiTask>(`/api/tasks/${taskId}`),
  updateTask: (taskId: string, payload: UpdateTaskPayload) =>
    apiRequest<ApiTask>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateTaskStatus: (taskId: string, status: string) =>
    apiRequest(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  createTask: (payload: Record<string, unknown>) =>
    apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createProject: (payload: CreateProjectPayload) =>
    apiRequest<ApiProject>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getUserOptions: () => apiRequest<ApiUserOption[]>('/api/org/users/options'),
}
