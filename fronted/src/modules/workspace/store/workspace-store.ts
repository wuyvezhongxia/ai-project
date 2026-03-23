import { create } from 'zustand'

type WorkspaceState = {
  taskModalOpen: boolean
  projectModalOpen: boolean
  detailOpen: boolean
  selectedTaskId: string
  openTaskModal: () => void
  closeTaskModal: () => void
  openProjectModal: () => void
  closeProjectModal: () => void
  openTaskDetail: (taskId: string) => void
  closeTaskDetail: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  taskModalOpen: false,
  projectModalOpen: false,
  detailOpen: false,
  selectedTaskId: '',
  openTaskModal: () => set({ taskModalOpen: true }),
  closeTaskModal: () => set({ taskModalOpen: false }),
  openProjectModal: () => set({ projectModalOpen: true }),
  closeProjectModal: () => set({ projectModalOpen: false }),
  openTaskDetail: (taskId) => set({ selectedTaskId: taskId, detailOpen: true }),
  closeTaskDetail: () => set({ detailOpen: false, selectedTaskId: '' }),
}))
