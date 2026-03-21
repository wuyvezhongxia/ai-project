import { apiRequest } from '../../../lib/http/api-client'

export type ApiUserOption = {
  userId: number
  nickName: string
}

export type ApiTaskUser = {
  userId: number
  userName: string
  nickName: string
  deptId?: number
}

export type ApiTask = {
  id: number
  taskName: string
  taskDesc?: string
  projectId?: number
  project?: { id: number; projectName: string; status?: string } | null
  priority?: '0' | '1' | '2' | '3'
  status: '0' | '1' | '2' | '3' | '4'
  dueTime?: string
  startTime?: string
  progress: number
  assignee?: ApiTaskUser | null
  assigneeUserId?: number
  creatorUserId: number
  createBy?: number
  riskLevel?: string
  isFavorite?: boolean
  taskType?: string
  collaborators?: ApiTaskUser[]
  subtaskSummary?: {
    total: number
    completed: number
  }
  comments?: Array<{
    id: number
    content: string
    createTime: string
    user?: ApiTaskUser | null
  }>
  activities?: Array<{
    id: number
    actionType: string
    actionContent?: string
    createTime: string
    user?: ApiTaskUser | null
  }>
  relations?: Array<{
    id: number
    relationType: string
    targetTitle: string
    targetUrl?: string
  }>
  attachments?: Array<{
    id: number
    fileName: string
    fileUrl: string
    fileSize?: number
    createTime: string
  }>
  subtasks?: Array<{
    id: number
    subtaskName: string
    status: '0' | '1'
    createTime?: string
  }>
}

export type ApiProject = {
  id: number
  projectName: string
  owner?: ApiTaskUser | null
  ownerUserId: number
  endTime?: string
  progress: number
  status: '0' | '1' | '2' | '3'
  taskCount: number
  completedTaskCount: number
  membersCount?: number
}

export type ApiProjectGanttItem = {
  taskId: number
  taskName: string
  startTime?: string
  dueTime?: string
  progress: number
  status: string
}

export type ApiWorkloadItem = {
  userId: number
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
      userId: number
      tenantId: string
      deptId?: number
      userName?: string
      nickName?: string
      roleIds: number[]
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
  getProjectOptions: () => apiRequest<Array<{ id: number; projectName: string; status?: string }>>('/api/projects/options'),

  getTodoTasks: (params: URLSearchParams) => apiRequest<ApiTask[]>(`/api/tasks/todo?${params.toString()}`),
  getTodoTasksKanban: (params: URLSearchParams) => apiRequest<ApiTask[] | Record<string, ApiTask[]>>(`/api/tasks/todo?${params.toString()}`),
  deleteTask: (taskId: string) => apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' }),

  getTaskDetail: (taskId: string) => apiRequest<ApiTask>(`/api/tasks/${taskId}`),
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

  getUserOptions: () => apiRequest<ApiUserOption[]>('/api/org/users/options'),
}
