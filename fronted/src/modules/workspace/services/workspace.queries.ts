import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BoardColumn, GanttRow, ProjectCard, RiskTask, SelectOptionItem, TaskDetailView, WorkTask, WorkloadMember } from '../types'
import {
  mapGanttRows,
  mapProjectOptions,
  mapProjectTaskKanban,
  mapProjectToCard,
  mapRiskTaskToView,
  mapTaskDetailToView,
  mapTaskListToBoardColumns,
  mapTaskToView,
  mapUserOptions,
  mapWorkload,
} from '../adapters/workspace.adapters'
import type { ApiProject, ApiProjectGanttItem, ApiTask, ApiWorkloadItem } from './workspace.api'
import { workspaceApi } from './workspace.api'
import { getAvatarLabel } from '../utils/avatar'

export const workspaceQueryKeys = {
  auth: ['auth-context'] as const,
  dashboard: ['dashboard'] as const,
  mustDoToday: ['must-do-today'] as const,
  riskTasks: ['risk-tasks'] as const,
  workload: (range: 'week' | 'month') => ['workload', range] as const,
  projects: (status: string) => ['projects', status] as const,
  projectTasks: (projectId: string, view: 'list' | 'kanban') => ['project-tasks', projectId, view] as const,
  projectGantt: (projectId: string) => ['project-gantt', projectId] as const,
  projectStats: (projectId: string) => ['project-stats', projectId] as const,
  todoList: (params: string) => ['todo-list', params] as const,
  todoKanban: (params: string) => ['todo-kanban', params] as const,
  taskDetail: (taskId: string) => ['task-detail', taskId] as const,
  projectOptions: ['project-options'] as const,
  userOptions: ['user-options'] as const,
}

const invalidateTaskRelatedQueries = (queryClient: ReturnType<typeof useQueryClient>, taskId?: string) => {
  if (taskId) {
    void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.taskDetail(taskId) })
  }
  void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.dashboard })
  void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.mustDoToday })
  void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.riskTasks })
  void queryClient.invalidateQueries({ queryKey: ['todo-list'] })
  void queryClient.invalidateQueries({ queryKey: ['todo-kanban'] })
  void queryClient.invalidateQueries({ queryKey: ['projects'] })
  void queryClient.invalidateQueries({ queryKey: ['project-tasks'] })
}

export const useAuthContextQuery = () =>
  useQuery({
    queryKey: workspaceQueryKeys.auth,
    queryFn: workspaceApi.getAuthContext,
  })

export const useDashboardQuery = (enabled = true) =>
  useQuery({
    queryKey: workspaceQueryKeys.dashboard,
    queryFn: workspaceApi.getDashboard,
    enabled,
  })

export const useMustDoTodayQuery = () =>
  useQuery<ApiTask[], Error, WorkTask[]>({
    queryKey: workspaceQueryKeys.mustDoToday,
    queryFn: workspaceApi.getMustDoToday,
    select: (items) => items.map(mapTaskToView),
  })

export const useRiskTasksQuery = () =>
  useQuery<ApiTask[], Error, RiskTask[]>({
    queryKey: workspaceQueryKeys.riskTasks,
    queryFn: workspaceApi.getRiskTasks,
    select: (items) => items.map(mapRiskTaskToView),
  })

export const useWorkloadQuery = (range: 'week' | 'month' = 'week') =>
  useQuery<ApiWorkloadItem[], Error, WorkloadMember[]>({
    queryKey: workspaceQueryKeys.workload(range),
    queryFn: () => workspaceApi.getWorkload(range),
    select: (items) => mapWorkload(items),
  })

export const useProjectsQuery = (statusTab: string, enabled = true) =>
  useQuery<ApiProject[], Error, ProjectCard[]>({
    queryKey: workspaceQueryKeys.projects(statusTab),
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusTab === '进行中') params.set('status', '0')
      if (statusTab === '已归档') params.set('status', '2')
      return workspaceApi.getProjects(params)
    },
    enabled,
    select: (items) => items.map(mapProjectToCard),
  })

export const useProjectTasksQuery = (projectId: string, view: 'list' | 'kanban') =>
  useQuery<ApiTask[] | Record<string, ApiTask[]>, Error, BoardColumn[] | WorkTask[]>({
    queryKey: workspaceQueryKeys.projectTasks(projectId, view),
    queryFn: () => workspaceApi.getProjectTasks(projectId, view),
    enabled: Boolean(projectId),
    select: (data) =>
      view === 'kanban'
        ? mapProjectTaskKanban(data as Record<string, ApiTask[]>)
        : (data as ApiTask[]).map(mapTaskToView),
  })

export const useProjectGanttQuery = (projectId: string) =>
  useQuery<ApiProjectGanttItem[], Error, GanttRow[]>({
    queryKey: workspaceQueryKeys.projectGantt(projectId),
    queryFn: () => workspaceApi.getProjectGantt(projectId),
    enabled: Boolean(projectId),
    select: (items) => mapGanttRows(items),
  })

export const useProjectStatisticsQuery = (projectId: string) =>
  useQuery({
    queryKey: workspaceQueryKeys.projectStats(projectId),
    queryFn: () => workspaceApi.getProjectStatistics(projectId),
    enabled: Boolean(projectId),
  })

export const useTodoListQuery = (params: URLSearchParams, enabled = true) =>
  useQuery<ApiTask[], Error, WorkTask[]>({
    queryKey: workspaceQueryKeys.todoList(params.toString()),
    queryFn: () => workspaceApi.getTodoTasks(params),
    enabled,
    select: (items) => items.map(mapTaskToView),
  })

/** 与待办页默认「全部 + 列表」一致，用于侧栏徽标（仅统计接口返回列表长度，不新增字段） */
export const sidebarTodoListParams = (() => {
  const p = new URLSearchParams()
  p.set('scope', 'all')
  p.set('view', 'list')
  return p
})()

export const useTodoKanbanQuery = (params: URLSearchParams) =>
  useQuery<ApiTask[] | Record<string, ApiTask[]>, Error, BoardColumn[]>({
    queryKey: workspaceQueryKeys.todoKanban(params.toString()),
    queryFn: () => workspaceApi.getTodoTasksKanban(params),
    select: (data) => {
      if (Array.isArray(data)) {
        return mapTaskListToBoardColumns(data)
      }
      const grouped = data
      return [
        { key: 'todo-board', title: '待开始', dotColor: '#8a92ff', count: grouped.notStarted?.length ?? 0, tasks: (grouped.notStarted ?? []).map((task) => ({ ...mapTaskToView(task), assignee: getAvatarLabel(task.assignee?.nickName) })) },
        { key: 'doing-board', title: '进行中', dotColor: '#5b79ff', count: grouped.inProgress?.length ?? 0, tasks: (grouped.inProgress ?? []).map((task) => ({ ...mapTaskToView(task), assignee: getAvatarLabel(task.assignee?.nickName) })) },
        { key: 'done-board', title: '已完成', dotColor: '#22d7a8', count: grouped.completed?.length ?? 0, tasks: (grouped.completed ?? []).map((task) => ({ ...mapTaskToView(task), assignee: getAvatarLabel(task.assignee?.nickName) })) },
        { key: 'delay-board', title: '延期', dotColor: '#ff7b88', count: grouped.delayed?.length ?? 0, tasks: (grouped.delayed ?? []).map((task) => ({ ...mapTaskToView(task), assignee: getAvatarLabel(task.assignee?.nickName) })) },
      ]
    },
  })

/**
 * 侧栏数字：项目管理 = 进行中项目列表条数；待办中心 = 默认待办列表条数。
 * 接口未返回或条数为 0 则不展示徽标；待办存在已超期项时用警示色。
 */
export const useSidebarNavCounts = () => {
  const projectsQuery = useProjectsQuery('进行中')
  const todosQuery = useTodoListQuery(sidebarTodoListParams)

  const projectCount = projectsQuery.data?.length ?? 0
  const todoTasks = todosQuery.data ?? []
  const todoCount = todoTasks.length
  const overdueCount = todoTasks.filter((t) => t.dueCategory === 'overdue').length

  return {
    projectBadge: projectsQuery.isSuccess && projectCount > 0 ? String(projectCount) : undefined,
    todoBadge: todosQuery.isSuccess && todoCount > 0 ? String(todoCount) : undefined,
    todoBadgeDanger: todosQuery.isSuccess && overdueCount > 0,
  }
}

export const useTaskDetailQuery = (taskId: string) =>
  useQuery<ApiTask, Error, TaskDetailView>({
    queryKey: workspaceQueryKeys.taskDetail(taskId),
    queryFn: () => workspaceApi.getTaskDetail(taskId),
    enabled: Boolean(taskId),
    select: (task) => mapTaskDetailToView(task),
  })

export const useProjectOptionsQuery = (enabled = true) =>
  useQuery<Array<{ id: string; projectName: string; status?: string }>, Error, SelectOptionItem[]>({
    queryKey: workspaceQueryKeys.projectOptions,
    queryFn: workspaceApi.getProjectOptions,
    enabled,
    select: (items) => mapProjectOptions(items),
  })

export const useUserOptionsQuery = () =>
  useQuery<Array<{ userId: string; nickName: string }>, Error, SelectOptionItem[]>({
    queryKey: workspaceQueryKeys.userOptions,
    queryFn: workspaceApi.getUserOptions,
    select: (items) => mapUserOptions(items),
  })

export const useCreateTaskMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: workspaceApi.createTask,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.dashboard })
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.mustDoToday })
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.riskTasks })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['project-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['project-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['todo-list'] })
      void queryClient.invalidateQueries({ queryKey: ['todo-kanban'] })
    },
  })
}

export const useCreateProjectMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: workspaceApi.createProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.projectOptions })
      void queryClient.invalidateQueries({ queryKey: ['project-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['project-gantt'] })
      void queryClient.invalidateQueries({ queryKey: ['project-stats'] })
    },
  })
}

export const useUpdateTaskMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: string; payload: Parameters<typeof workspaceApi.updateTask>[1] }) =>
      workspaceApi.updateTask(taskId, payload),
    onSuccess: (_data, variables) => {
      invalidateTaskRelatedQueries(queryClient, variables.taskId)
      void queryClient.invalidateQueries({ queryKey: ['project-gantt'] })
      void queryClient.invalidateQueries({ queryKey: ['project-stats'] })
    },
  })
}

export const useCreateTaskCommentMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: string
      payload: Parameters<typeof workspaceApi.createTaskComment>[1]
    }) => workspaceApi.createTaskComment(taskId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.taskDetail(variables.taskId) })
      void queryClient.invalidateQueries({ queryKey: ['todo-list'] })
      void queryClient.invalidateQueries({ queryKey: ['todo-kanban'] })
      void queryClient.invalidateQueries({ queryKey: ['project-tasks'] })
    },
  })
}

export const useCreateSubtaskMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: string
      payload: Parameters<typeof workspaceApi.createSubtask>[1]
    }) => workspaceApi.createSubtask(taskId, payload),
    onSuccess: (_data, variables) => {
      invalidateTaskRelatedQueries(queryClient, variables.taskId)
    },
  })
}

export const useUpdateSubtaskMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: {
      taskId: string
      subtaskId: string
      payload: Parameters<typeof workspaceApi.updateSubtask>[1]
    }) => workspaceApi.updateSubtask(variables.subtaskId, variables.payload),
    onSuccess: (_data, variables) => {
      invalidateTaskRelatedQueries(queryClient, variables.taskId)
    },
  })
}

export const useDeleteSubtaskMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: { taskId: string; subtaskId: string }) => workspaceApi.deleteSubtask(variables.subtaskId),
    onSuccess: (_data, variables) => {
      invalidateTaskRelatedQueries(queryClient, variables.taskId)
    },
  })
}

export const useDeleteTaskMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskId: string) => workspaceApi.deleteTask(taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['todo-list'] })
      void queryClient.invalidateQueries({ queryKey: ['todo-kanban'] })
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.dashboard })
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.mustDoToday })
    },
  })
}

export const useUpdateTaskStatusMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) => workspaceApi.updateTaskStatus(taskId, status),
    onSuccess: (_data, variables) => {
      invalidateTaskRelatedQueries(queryClient, variables.taskId)
      void queryClient.invalidateQueries({ queryKey: ['project-stats'] })
    },
  })
}

export const useAiChatMutation = () =>
  useMutation({
    mutationFn: workspaceApi.aiChat,
  })
