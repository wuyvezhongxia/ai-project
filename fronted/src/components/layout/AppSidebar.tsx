import { AimOutlined, AppstoreOutlined, FolderOpenOutlined, PlusOutlined } from '@ant-design/icons'
import { Avatar, Button } from 'antd'
import type { ComponentType } from 'react'
import type { PageKey } from '../../modules/workspace/types'
import { navGroups } from '../../modules/workspace/data/mock'
import { useAuthContextQuery, useSidebarNavCounts } from '../../modules/workspace/services/workspace.queries'
import { getAvatarLabel, getAvatarSeed, getAvatarStyle } from '../../modules/workspace/utils/avatar'
import { NavLink } from 'react-router-dom'

const routeMap: Record<PageKey, string> = {
  dashboard: '/',
  projects: '/projects',
  todos: '/todos',
}

const navIcons: Record<PageKey, ComponentType> = {
  dashboard: AppstoreOutlined,
  projects: FolderOpenOutlined,
  todos: AimOutlined,
}

type AppSidebarProps = {
  actionLabel: string
  onActionClick: () => void
}

function AppSidebar({ actionLabel, onActionClick }: AppSidebarProps) {
  const { data: authContext } = useAuthContextQuery()
  const { projectBadge, todoBadge, todoBadgeDanger } = useSidebarNavCounts()

  const badgeFor = (key: PageKey) => {
    if (key === 'projects') return projectBadge
    if (key === 'todos') return todoBadge
    return undefined
  }

  const badgeDangerFor = (key: PageKey) => key === 'todos' && todoBadgeDanger

  return (
    <aside className="app-sidebar">
      <div className="sidebar-user">
        <Avatar
          size={44}
          src={authContext?.avatarUrl || undefined}
          style={authContext?.avatarUrl ? undefined : getAvatarStyle(getAvatarSeed(authContext?.userId, authContext?.nickName, authContext?.userName))}
        >
          {getAvatarLabel(authContext?.nickName?.trim() || authContext?.userName?.trim() || '用')}
        </Avatar>
        <div className="sidebar-user-meta">
          <div className="sidebar-user-name">
            {authContext?.nickName?.trim() || authContext?.userName?.trim() || '—'}
          </div>
          <div className="sidebar-user-role">
            {authContext?.roleNames?.length ? authContext.roleNames.join(' · ') : '—'}
          </div>
        </div>
      </div>

      <nav className="nav-menu" aria-label="主导航">
        {navGroups.map((group) => (
          <div key={group.title} className="nav-section">
            <div className="nav-section-title">{group.title}</div>
            <div className="nav-section-items">
              {group.items.map((item) => {
                const Icon = navIcons[item.key]
                const badge = badgeFor(item.key)
                return (
                  <NavLink
                    key={item.key}
                    to={routeMap[item.key]}
                    end={item.key === 'dashboard'}
                    className={({ isActive }) => (isActive ? 'nav-item nav-item-active' : 'nav-item')}
                  >
                    <span className="nav-item-icon" aria-hidden>
                      <Icon />
                    </span>
                    <span className="nav-item-label">{item.label}</span>
                    {badge ? (
                      <span className={badgeDangerFor(item.key) ? 'nav-count nav-count-danger' : 'nav-count'}>{badge}</span>
                    ) : null}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <Button type="primary" className="sidebar-primary-action" icon={<PlusOutlined />} onClick={onActionClick}>
        {actionLabel}
      </Button>
    </aside>
  )
}

export default AppSidebar
