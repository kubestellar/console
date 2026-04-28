import { useLocation, useNavigate } from 'react-router-dom'
import { SidebarShell } from './SidebarShell'
import type { NavSection, SidebarNavItem } from './SidebarShell'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import type { SidebarItem } from '../../hooks/useSidebarConfig'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'
import { ROUTES } from '../../config/routes'

/** Convert a SidebarItem from useSidebarConfig into SidebarShell's NavItem format */
function toNavItem(item: SidebarItem): SidebarNavItem {
  return {
    id: item.id,
    label: item.name,
    href: item.href,
    icon: item.icon,
    isCustom: item.isCustom,
  }
}

export function Sidebar() {
  const { config } = useSidebarConfig()
  const dashboardContext = useDashboardContextOptional()
  const navigate = useNavigate()
  const location = useLocation()

  const navSections: NavSection[] = [
    { id: 'primary', items: config.primaryNav.map(toNavItem) },
    { id: 'secondary', items: config.secondaryNav.map(toNavItem) },
  ]

  // Handle Add Card click - work with current dashboard
  const handleAddCardClick = () => {
    const cardDashboards = ['/', '/workloads', '/security', '/gitops', '/storage', '/compute', '/network', '/events', '/clusters']
    const currentPath = location.pathname
    const isCustomDashboard = currentPath.startsWith('/custom-dashboard/')

    if (cardDashboards.includes(currentPath) || isCustomDashboard) {
      if (currentPath === ROUTES.HOME) {
        dashboardContext?.openAddCardModal()
      } else {
        navigate(`${currentPath}?addCard=true`)
      }
    } else {
      dashboardContext?.setPendingOpenAddCardModal(true)
      navigate(ROUTES.HOME)
    }
  }

  return (
    <SidebarShell
      navSections={navSections}
      features={{
        missions: true,
        addCard: true,
        addMore: true,
        clusterStatus: config.showClusterStatus,
        activeUsers: true,
        versionCheck: true,
        dragReorder: true,
        resize: true,
        collapsePin: true,
        snoozedCards: true,
      }}
      onAddMore={() => dashboardContext?.openAddCardModal('dashboards')}
      onAddCard={handleAddCardClick}
    />
  )
}
