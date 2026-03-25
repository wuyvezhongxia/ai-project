import { Outlet, useLocation } from 'react-router-dom'
import AppSidebar from './AppSidebar'
import PageHeader from './PageHeader'
import ProjectCreateModal from '../../modules/projects/components/ProjectCreateModal'
import TaskCreateModal from '../../modules/workspace/components/TaskCreateModal'
import TaskDetailDrawer from '../../modules/workspace/components/TaskDetailDrawer'
import { pageMeta } from '../../modules/workspace/data/mock'
import { sidebarTodoListParams, useTodoListQuery } from '../../modules/workspace/services/workspace.queries'
import { useWorkspaceStore } from '../../modules/workspace/store/workspace-store'

const getPageKeyFromPath = (pathname: string) => {
  if (pathname.startsWith('/projects')) return 'projects'
  if (pathname.startsWith('/todos')) return 'todos'
  return 'dashboard'
}

function AppLayout() {
  const location = useLocation()
  const isTodosPage = location.pathname.startsWith('/todos')
  const openTaskModal = useWorkspaceStore((state) => state.openTaskModal)
  const currentPage = pageMeta[getPageKeyFromPath(location.pathname)]
  const handlePrimaryAction = openTaskModal
  const { data: todoHeaderTasks = [] } = useTodoListQuery(sidebarTodoListParams, isTodosPage)
  const todoOverdueCount = todoHeaderTasks.filter((task) => task.dueCategory === 'overdue').length
  const dynamicSubtitle = isTodosPage
    ? `我的 ${todoHeaderTasks.length} 个待办 · ${todoOverdueCount} 个超期项`
    : currentPage.subtitle

  return (
    <div className="app-shell">
      <AppSidebar />

      <main className="dashboard-shell">
        <PageHeader
          title={currentPage.title}
          subtitle={dynamicSubtitle}
          actionLabel={currentPage.actionLabel}
          onActionClick={handlePrimaryAction}
        />
        <Outlet />
      </main>

      <ProjectCreateModal />
      <TaskCreateModal />
      <TaskDetailDrawer />
    </div>
  )
}

export default AppLayout
