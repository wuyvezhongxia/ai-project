import { create } from 'zustand'
import { initialTodoTasks, mustDoTasks } from '../data/mock'
import type { WorkTask } from '../types'

type WorkspaceState = {
  taskModalOpen: boolean
  detailOpen: boolean
  selectedTaskId: string
  checkedTaskIds: string[]
  todoTasks: WorkTask[]
  openTaskModal: () => void
  closeTaskModal: () => void
  openTaskDetail: (taskId: string) => void
  closeTaskDetail: () => void
  toggleTaskChecked: (taskId: string) => void
  deleteTodoTask: (taskId: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  taskModalOpen: false,
  detailOpen: true,
  selectedTaskId: mustDoTasks[0]?.id ?? '',
  checkedTaskIds: mustDoTasks.filter((task) => task.completed).map((task) => task.id),
  todoTasks: initialTodoTasks,
  openTaskModal: () => set({ taskModalOpen: true }),
  closeTaskModal: () => set({ taskModalOpen: false }),
  openTaskDetail: (taskId) => set({ selectedTaskId: taskId, detailOpen: true }),
  closeTaskDetail: () => set({ detailOpen: false }),
  toggleTaskChecked: (taskId) =>
    set((state) => ({
      checkedTaskIds: state.checkedTaskIds.includes(taskId)
        ? state.checkedTaskIds.filter((id) => id !== taskId)
        : [...state.checkedTaskIds, taskId],
    })),
  deleteTodoTask: (taskId) =>
    set((state) => ({
      todoTasks: state.todoTasks.filter((task) => task.id !== taskId),
    })),
}))
