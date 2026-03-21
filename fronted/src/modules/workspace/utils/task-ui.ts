import {
  detailSubtasks,
  initialTodoTasks,
  mustDoTasks,
  projectBoardMap,
} from '../data/mock'
import type { BoardTask, Subtask, WorkTask } from '../types'

export const toBoardTask = (task: WorkTask): BoardTask => ({
  ...task,
  assignee: task.owner.slice(0, 1),
})

export const getStatusColor = (status: WorkTask['status'] | string) => {
  if (status === '已完成') return 'success'
  if (status === '待审核') return 'warning'
  if (status === '延期') return 'error'
  if (status === '待开始') return 'default'
  return 'processing'
}

export const getPriorityColor = (priority: WorkTask['priority']) => {
  if (priority === 'P0') return 'error'
  if (priority === 'P1') return 'warning'
  if (priority === 'P2') return 'processing'
  return 'default'
}

export const getAllTasks = (todoTasks: WorkTask[]) => {
  const projectTasks = Object.values(projectBoardMap)
    .flat()
    .flatMap((column) => column.tasks.map(({ assignee, ...task }) => ({ ...task, owner: task.owner || assignee })))

  return [...mustDoTasks, ...initialTodoTasks, ...todoTasks, ...projectTasks].filter(
    (task, index, list) => list.findIndex((item) => item.id === task.id) === index,
  )
}

export const getSelectedTaskSubtasks = (): Subtask[] => detailSubtasks
