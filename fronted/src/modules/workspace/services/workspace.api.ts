/**
 * 工作台域：项目、任务、待办、仪表盘、负载、AI 等 HTTP 封装。
 * 统一经 `apiRequest` 访问 `/api/*`，响应体为 `{ code, message, data }`，本文件只描述 `data` 形状。
 *
 * 任务/项目 `status`（与后端一致）：`'0'` 待开始 | `'1'` 进行中 | `'2'` 已完成 | `'3'` 延期
 * 任务 `priority`：`'0'`~`'3'` 对应 P3~P0（展示文案见适配层）
 */
import { apiRequest } from '../../../lib/http/api-client'

/** 选人/指派下拉：用户简要信息 */
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

/** 任务列表/详情中的任务结构（后端 task 视图） */
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

/** 项目卡片/列表 */
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

/** 工作台首页聚合：今日/我负责/我创建/收藏/风险等分栏 */
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
  /** GET 当前登录上下文（用户、租户、角色） */
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

  /** GET 工作台仪表盘各分区任务 */
  getDashboard: () => apiRequest<ApiDashboard>('/api/tasks/dashboard'),
  /** GET 今日必办 */
  getMustDoToday: () => apiRequest<ApiTask[]>('/api/tasks/must-do-today'),
  /** GET 风险/临期等任务列表 */
  getRiskTasks: () => apiRequest<ApiTask[]>('/api/tasks/risk'),
  /** GET 团队负载统计，`range`: week | month */
  getWorkload: (range: 'week' | 'month' = 'week') => apiRequest<ApiWorkloadItem[]>(`/api/workload/team?range=${range}`),

  /** GET 项目列表，query 与后端列表筛选一致 */
  getProjects: (params?: URLSearchParams) =>
    apiRequest<ApiProject[]>(`/api/projects${params?.toString() ? `?${params.toString()}` : ''}`),
  /** GET 某项目下任务；`kanban` 时 data 为按列分组的对象 */
  getProjectTasks: (projectId: string, view: 'list' | 'kanban') =>
    apiRequest<ApiTask[] | Record<string, ApiTask[]>>(`/api/projects/${projectId}/tasks?view=${view}`),
  /** GET 项目甘特数据源 */
  getProjectGantt: (projectId: string) => apiRequest<ApiProjectGanttItem[]>(`/api/projects/${projectId}/gantt`),
  /** GET 项目维度统计（完成率、延期等） */
  getProjectStatistics: (projectId: string) =>
    apiRequest<{
      totalTasks: number
      completedTasks: number
      delayedTasks: number
      overdueTasks: number
      completionRate: number
    }>(`/api/projects/${projectId}/statistics`),
  /** GET 轻量项目下拉（id + 名称） */
  getProjectOptions: () => apiRequest<Array<{ id: string; projectName: string; status?: string }>>('/api/projects/options'),

  /** GET 个人待办列表（query 含 scope、view 等） */
  getTodoTasks: (params: URLSearchParams) => apiRequest<ApiTask[]>(`/api/tasks/todo?${params.toString()}`),
  /** GET 个人待办看板（返回形状同项目 tasks kanban） */
  getTodoTasksKanban: (params: URLSearchParams) => apiRequest<ApiTask[] | Record<string, ApiTask[]>>(`/api/tasks/todo?${params.toString()}`),
  /** DELETE 软删任务 */
  deleteTask: (taskId: string) => apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' }),

  /** GET 任务详情（含子任务、评论、动态等，以后端为准） */
  getTaskDetail: (taskId: string) => apiRequest<ApiTask>(`/api/tasks/${taskId}`),
  /** PATCH 更新任务字段（部分更新） */
  updateTask: (taskId: string, payload: UpdateTaskPayload) =>
    apiRequest<ApiTask>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  /** PATCH 仅改任务状态（专用接口） */
  updateTaskStatus: (taskId: string, status: string) =>
    apiRequest(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  /** POST 任务评论 */
  createTaskComment: (taskId: string, payload: CreateTaskCommentPayload) =>
    apiRequest(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  /** POST 在某任务下新增子任务 */
  createSubtask: (taskId: string, payload: CreateSubtaskPayload) =>
    apiRequest<ApiSubtask>(`/api/tasks/${taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  /** PATCH 更新子任务 */
  updateSubtask: (subtaskId: string, payload: UpdateSubtaskPayload) =>
    apiRequest<ApiSubtask>(`/api/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  /** DELETE 子任务 */
  deleteSubtask: (subtaskId: string) => apiRequest(`/api/subtasks/${subtaskId}`, { method: 'DELETE' }),
  /** POST 新建任务（body 与后端创建 schema 一致） */
  createTask: (payload: Record<string, unknown>) =>
    apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  /** POST 新建项目 */
  createProject: (payload: CreateProjectPayload) =>
    apiRequest<ApiProject>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  /** DELETE 项目（逻辑删除，以后端为准） */
  deleteProject: (projectId: string) =>
    apiRequest(`/api/projects/${projectId}`, {
      method: 'DELETE',
    }),

  /** GET 组织成员下拉（用于指派、项目成员等） */
  getUserOptions: () => apiRequest<ApiUserOption[]>('/api/org/users/options'),

  // —— AI（非流式；流式对话见 `modules/ai/dispatchAiRequest.ts`）——
  /** POST AI 对话（同步 JSON，非 SSE） */
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

  /** POST 周报生成 */
  aiWeeklyReport: (payload: { bizId: string; inputText: string }) =>
    apiRequest<{
      success: boolean;
      output: string;
      recordId: string;
    }>('/api/ai/weekly-report', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** POST 项目分析（接口路径仍为 task-breakdown） */
  aiTaskBreakdown: (payload: { bizId: string; inputText: string }) =>
    apiRequest<{
      success: boolean;
      output: string;
      recordId: string;
    }>('/api/ai/task-breakdown', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** POST 批量改状态预览（路径为 delay-analysis；bizId=项目；不落库，实际写入走对话确认流） */
  aiBatchAdjustPreview: (payload: { bizId: string; inputText: string }) =>
    apiRequest<{
      success: boolean;
      output: string;
      recordId: string;
    }>('/api/ai/delay-analysis', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** POST 单任务洞察 */
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

  /** GET AI 对话/技能历史记录 */
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
