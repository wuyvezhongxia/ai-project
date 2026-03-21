import { create } from 'zustand'

type WorkspaceState = {
  taskModalOpen: boolean
  detailOpen: boolean
  selectedTaskId: string
  openTaskModal: () => void
  closeTaskModal: () => void
  openTaskDetail: (taskId: string) => void
  closeTaskDetail: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  taskModalOpen: false,
  detailOpen: true,
  selectedTaskId: '',
  openTaskModal: () => set({ taskModalOpen: true }),
  closeTaskModal: () => set({ taskModalOpen: false }),
  openTaskDetail: (taskId) => set({ selectedTaskId: taskId, detailOpen: true }),
  closeTaskDetail: () => set({ detailOpen: false }),
}))
