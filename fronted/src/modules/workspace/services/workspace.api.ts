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
  avatarUrl?: string | null
}

export type ApiTask = {
  id: string
  taskName: string
  taskDesc?: string
  createTime?: string
  projectId?: string
  project?: { id: string; projectName: string; status?: string } | null
  priority?: '0' | '1' | '2' | '3'
  status: '0' | '1' | '2' | '3'
  dueTime?: string
  dueText?: string
  dueCategory?: 'today' | 'week' | 'overdue' | 'completed'
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
  subtasks?: ApiSubtask[]
}

export type ApiProject = {
  id: string
  projectName: string
  owner?: ApiTaskUser | null
  members?: ApiTaskUser[]
  ownerUserId: string
  endTime?: string
  progress: number
  status: '0' | '1' | '2' | '3'
  taskCount: number
  completedTaskCount: number
  riskTaskCount?: number
  delayedTaskCount?: number
  membersCount?: number
  accentColor?: string
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
  status: '0' | '1' | '2' | '3'
}>

export type ApiSubtask = {
  id: string
  subtaskName: string
  status: '0' | '1' | '2'
  sortNo?: number
  priority?: '0' | '1' | '2' | '3'
  plannedStartTime?: string | null
  plannedDueTime?: string | null
  finishTime?: string | null
  createTime?: string
  creator?: ApiTaskUser | null
}

export type CreateSubtaskPayload = {
  subtaskName: string
  status?: '0' | '1'
  sortNo?: number
  priority?: '0' | '1' | '2' | '3'
  plannedStartTime?: string
  plannedDueTime?: string
  finishTime?: string
}

export type UpdateSubtaskPayload = Partial<{
  subtaskName: string
  status: '0' | '1' | '2'
  sortNo: number
  priority: '0' | '1' | '2' | '3'
  plannedStartTime: string | null
  plannedDueTime: string | null
  finishTime: string | null
}>

export type CreateTaskCommentPayload = {
  content: string
  parentCommentId?: string
}

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
  /** 当前窗口内估算剩余人时（priority+progress 近似） */
  workloadHours?: number
  /** 同期产能人时（周=每人每周，月=周×WORKLOAD_MONTH_WEEKS） */
  capacityHours?: number
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

export type ApiTaskInsight = {
  summary: string
  risks: string[]
  blockers: string[]
  nextActions: Array<{
    action: string
    owner?: string
    due?: string
    priority?: 'high' | 'medium' | 'low'
  }>
  todayChecklist: string[]
  confidence?: number
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
      avatarUrl?: string | null
      roleNames?: string[]
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
  createTaskComment: (taskId: string, payload: CreateTaskCommentPayload) =>
    apiRequest(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createSubtask: (taskId: string, payload: CreateSubtaskPayload) =>
    apiRequest<ApiSubtask>(`/api/tasks/${taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSubtask: (subtaskId: string, payload: UpdateSubtaskPayload) =>
    apiRequest<ApiSubtask>(`/api/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSubtask: (subtaskId: string) => apiRequest(`/api/subtasks/${subtaskId}`, { method: 'DELETE' }),
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

  // AI接口
  aiChat: (payload: { bizId?: string; inputText: string }) =>
    apiRequest<{
      success: boolean;
      output: string;
      suggestions?: string[];
      metadata?: {
        model: string;
        tokensUsed: number;
        responseTime: number;
      };
      recordId: string;
    }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  aiWeeklyReport: (payload: { bizId: string; inputText: string }) =>
    apiRequest<{
      success: boolean;
      output: string;
      recordId: string;
    }>('/api/ai/weekly-report', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  aiTaskBreakdown: (payload: { bizId: string; inputText: string }) =>
    apiRequest<{
      success: boolean;
      output: string;
      recordId: string;
    }>('/api/ai/task-breakdown', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  aiRiskAnalysis: (payload: { bizId: string; inputText: string }) =>
    apiRequest<{
      success: boolean;
      output: string;
      recordId: string;
    }>('/api/ai/delay-analysis', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  aiTaskInsight: (payload: { bizId: string; inputText: string }) =>
    apiRequest<{
      success: boolean;
      output: string;
      insight?: ApiTaskInsight;
      recordId: string;
    }>('/api/ai/task-insight', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  aiProjectProgress: (payload: { bizId: string; inputText: string }) =>
    apiRequest<{
      success: boolean;
      output: string;
      recordId: string;
    }>('/api/ai/project-progress', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  aiHistory: (params?: { bizId?: string; limit?: number }) => {
    const query = new URLSearchParams()
    if (params?.bizId) query.set('bizId', params.bizId)
    if (params?.limit) query.set('limit', String(params.limit))
    const suffix = query.toString()

    return apiRequest<{
      records: Array<{
        id: string
        bizType: string
        bizId?: string
        inputText: string
        outputText?: string
        createTime: string
      }>
    }>(`/api/ai/history${suffix ? `?${suffix}` : ''}`)
  },
}
