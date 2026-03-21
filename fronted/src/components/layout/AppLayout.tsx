import { Outlet, useLocation } from 'react-router-dom'
import AppSidebar from './AppSidebar'
import PageHeader from './PageHeader'
import TaskCreateModal from '../../modules/workspace/components/TaskCreateModal'
import TaskDetailDrawer from '../../modules/workspace/components/TaskDetailDrawer'
import { pageMeta } from '../../modules/workspace/data/mock'
import { useWorkspaceStore } from '../../modules/workspace/store/workspace-store'

const getPageKeyFromPath = (pathname: string) => {
  if (pathname.startsWith('/projects')) return 'projects'
  if (pathname.startsWith('/todos')) return 'todos'
  return 'dashboard'
}

function AppLayout() {
  const location = useLocation()
  const openTaskModal = useWorkspaceStore((state) => state.openTaskModal)
  const currentPage = pageMeta[getPageKeyFromPath(location.pathname)]

  return (
    <div className="app-shell">
      <AppSidebar />

      <main className="dashboard-shell">
        <PageHeader
          title={currentPage.title}
          subtitle={currentPage.subtitle}
          actionLabel={currentPage.actionLabel}
          onActionClick={openTaskModal}
        />
        <Outlet />
      </main>

      <TaskCreateModal />
      <TaskDetailDrawer />
    </div>
  )
}

export default AppLayout
