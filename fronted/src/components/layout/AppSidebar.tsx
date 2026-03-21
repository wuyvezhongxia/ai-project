import { Avatar } from 'antd'
import { NavLink } from 'react-router-dom'
import { navItems } from '../../modules/workspace/data/mock'
import { useAuthContextQuery } from '../../modules/workspace/services/workspace.queries'

const routeMap = {
  dashboard: '/',
  projects: '/projects',
  todos: '/todos',
} as const

function AppSidebar() {
  const { data: authContext } = useAuthContextQuery()

  return (
    <aside className="app-sidebar">
      <div className="sidebar-top">
        <div className="brand-block">
          <div className="brand-avatar">策</div>
          <div>
            <div className="brand-title">软小筑</div>
            <div className="brand-subtitle">work space hub</div>
          </div>
        </div>

        <nav className="nav-menu">
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              to={routeMap[item.key]}
              end={item.key === 'dashboard'}
              className={({ isActive }) =>
                isActive ? 'nav-item nav-item-active' : 'nav-item'
              }
            >
              <span className="nav-dot" />
              <span>{item.label}</span>
              {item.count ? (
                <span className={item.danger ? 'nav-count nav-count-danger' : 'nav-count'}>
                  {item.count}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="sidebar-user">
        <Avatar size={36}>{authContext?.nickName?.slice(0, 1) ?? '张'}</Avatar>
        <div>
          <div className="sidebar-user-name">{authContext?.nickName ?? '张小明'}</div>
          <div className="sidebar-user-role">产品经理 · Admin</div>
        </div>
      </div>
    </aside>
  )
}

export default AppSidebar
