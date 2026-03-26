import { Outlet, useLocation } from 'react-router-dom'
import AppSidebar from './AppSidebar'
import PageHeader from './PageHeader'
import ProjectCreateModal from '../../modules/projects/components/ProjectCreateModal'
import TaskCreateModal from '../../modules/workspace/components/TaskCreateModal'
import TaskDetailDrawer from '../../modules/workspace/components/TaskDetailDrawer'
import { pageMeta } from '../../modules/workspace/data/mock'
import { sidebarTodoListParams, useDashboardQuery, useProjectsQuery, useTodoListQuery } from '../../modules/workspace/services/workspace.queries'
import { useWorkspaceStore } from '../../modules/workspace/store/workspace-store'

const getPageKeyFromPath = (pathname: string) => {
  if (pathname.startsWith('/projects')) return 'projects'
  if (pathname.startsWith('/todos')) return 'todos'
  return 'dashboard'
}

function AppLayout() {
  const location = useLocation()
  const isDashboardPage = location.pathname === '/' || location.pathname.startsWith('/dashboard')
  const isTodosPage = location.pathname.startsWith('/todos')
  const isProjectsPage = location.pathname.startsWith('/projects')
  const openTaskModal = useWorkspaceStore((state) => state.openTaskModal)
  const currentPage = pageMeta[getPageKeyFromPath(location.pathname)]
  const handlePrimaryAction = openTaskModal
  const { data: dashboard } = useDashboardQuery(isDashboardPage)
  const { data: todoHeaderTasks = [] } = useTodoListQuery(sidebarTodoListParams, isTodosPage)
  const { data: activeProjects = [] } = useProjectsQuery('进行中', isProjectsPage)
  const todoOverdueCount = todoHeaderTasks.filter((task) => task.dueCategory === 'overdue').length
  const activeProjectTaskCount = activeProjects.reduce((sum, project) => sum + project.taskCount, 0)
  const todayLabel = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())
  const dynamicSubtitle = isDashboardPage
    ? `${todayLabel} · 今日任务 ${dashboard?.summary?.today ?? 0} 项 · 风险任务 ${dashboard?.summary?.risk ?? 0} 项`
    : isTodosPage
      ? `我的 ${todoHeaderTasks.length} 个待办 · ${todoOverdueCount} 个超期项`
      : isProjectsPage
        ? `${activeProjects.length} 个进行中项目 · ${activeProjectTaskCount} 个任务`
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
