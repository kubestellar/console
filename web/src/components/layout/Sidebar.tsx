import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
// NOTE: Wildcard import is required for dynamic icon resolution
// Sidebar items are configured with icon names as strings (from sidebar config)
// The renderIcon() function resolves these names dynamically via Icons[iconName]
import * as Icons from 'lucide-react'
import { Plus, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, WifiOff, GripVertical, X, User } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SnoozedCards } from './SnoozedCards'
import { useSidebarConfig, SidebarItem, PROTECTED_SIDEBAR_IDS } from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useClusters } from '../../hooks/useMCP'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'
import type { SnoozedSwap } from '../../hooks/useSnoozedCards'
import type { SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import type { SnoozedMission } from '../../hooks/useSnoozedMissions'
import { useActiveUsers } from '../../hooks/useActiveUsers'
import { ROUTES } from '../../config/routes'

export function Sidebar() {
  const { config, toggleCollapsed, reorderItems, updateItem, removeItem, closeMobileSidebar } = useSidebarConfig()
  const { isMobile } = useMobile()
  const { deduplicatedClusters } = useClusters()
  const dashboardContext = useDashboardContextOptional()
  const { viewerCount, hasError: viewersError } = useActiveUsers()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  // Close mobile sidebar on route change
  useEffect(() => {
    if (isMobile) {
      closeMobileSidebar()
    }
  }, [location.pathname, isMobile, closeMobileSidebar])

  // On mobile, always show expanded view; on desktop, respect collapsed state
  const isCollapsed = !isMobile && config.collapsed

  // Inline rename state for custom sidebar items
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)
  const [dragSection, setDragSection] = useState<'primary' | 'secondary' | null>(null)
  const dragCounter = useRef(0)

  // Cluster status counts (using deduplicated clusters to avoid double-counting same server with different contexts)
  const healthyClusters = deduplicatedClusters.filter((c) => c.healthy === true && c.reachable !== false).length
  const unhealthyClusters = deduplicatedClusters.filter((c) => c.healthy === false && c.reachable !== false).length
  const unreachableClusters = deduplicatedClusters.filter((c) => c.reachable === false).length

  // Handle Add Card click - work with current dashboard
  const handleAddCardClick = () => {
    // List of dashboards that have card systems
    const cardDashboards = ['/', '/workloads', '/security', '/gitops', '/storage', '/compute', '/network', '/events', '/clusters']
    const currentPath = location.pathname
    const isCustomDashboard = currentPath.startsWith('/custom-dashboard/')

    if (cardDashboards.includes(currentPath) || isCustomDashboard) {
      // Current page has cards - use query param to trigger modal
      if (currentPath === ROUTES.HOME) {
        dashboardContext?.openAddCardModal()
      } else {
        // Navigate to same page with addCard param to trigger modal
        navigate(`${currentPath}?addCard=true`)
      }
    } else {
      // On a non-card page, navigate to main dashboard
      dashboardContext?.setPendingOpenAddCardModal(true)
      navigate(ROUTES.HOME)
    }
  }

  // Inline rename handlers - only for user-created custom dashboards (not built-in or template items)
  const handleDoubleClick = (item: SidebarItem, e: React.MouseEvent) => {
    if (!item.isCustom || !item.href.startsWith('/custom-dashboard/')) return
    e.preventDefault()
    e.stopPropagation()
    setEditingItemId(item.id)
    setEditingName(item.name)
  }

  const handleSaveRename = (itemId: string) => {
    const trimmed = editingName.trim()
    if (trimmed) {
      updateItem(itemId, { name: trimmed })
    }
    setEditingItemId(null)
    setEditingName('')
  }

  // Navigate to clusters page with status filter
  const handleClusterStatusClick = (status: 'healthy' | 'unhealthy' | 'unreachable') => {
    navigate(`${ROUTES.CLUSTERS}?status=${status}`)
  }

  // Handle snoozed card swap restore - navigate to dashboard
  const handleApplySwap = (_swap: SnoozedSwap) => {
    // Navigate to main dashboard where the swap can be applied
    navigate(ROUTES.HOME)
  }

  // Handle snoozed recommendation restore - navigate to dashboard
  const handleApplyRecommendation = (_rec: SnoozedRecommendation) => {
    // Navigate to main dashboard to apply the recommendation
    navigate(ROUTES.HOME)
  }

  // Handle snoozed mission restore - navigate to dashboard
  const handleApplyMission = (_mission: SnoozedMission) => {
    // Navigate to main dashboard where missions are displayed
    navigate(ROUTES.HOME)
  }

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, itemId: string, section: 'primary' | 'secondary') => {
    setDraggedItem(itemId)
    setDragSection(section)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
    // Add some delay for visual feedback
    requestAnimationFrame(() => {
      const target = e.target as HTMLElement
      target.style.opacity = '0.5'
    })
  }

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement
    target.style.opacity = '1'
    setDraggedItem(null)
    setDragOverItem(null)
    setDragSection(null)
    dragCounter.current = 0
  }

  const handleDragEnter = (e: React.DragEvent, itemId: string) => {
    e.preventDefault()
    dragCounter.current++
    if (itemId !== draggedItem) {
      setDragOverItem(itemId)
    }
  }

  const handleDragLeave = () => {
    dragCounter.current--
    if (dragCounter.current === 0) {
      setDragOverItem(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetId: string, section: 'primary' | 'secondary') => {
    e.preventDefault()
    dragCounter.current = 0

    if (!draggedItem || draggedItem === targetId || section !== dragSection) {
      setDraggedItem(null)
      setDragOverItem(null)
      setDragSection(null)
      return
    }

    const items = section === 'primary' ? [...config.primaryNav] : [...config.secondaryNav]
    const draggedIndex = items.findIndex(item => item.id === draggedItem)
    const targetIndex = items.findIndex(item => item.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    // Remove dragged item and insert at target position
    const [removed] = items.splice(draggedIndex, 1)
    items.splice(targetIndex, 0, removed)

    // Update order numbers
    const reorderedItems = items.map((item, index) => ({ ...item, order: index }))
    reorderItems(reorderedItems, section)

    setDraggedItem(null)
    setDragOverItem(null)
    setDragSection(null)
  }

  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName]
    return IconComponent ? <IconComponent className={className} /> : null
  }

  const renderNavItem = (item: SidebarItem, section: 'primary' | 'secondary') => {
    const isEditing = editingItemId === item.id

    return (
      <div
        key={item.id}
        draggable={!isCollapsed && !isEditing}
        onDragStart={(e) => handleDragStart(e, item.id, section)}
        onDragEnd={handleDragEnd}
        onDragEnter={(e) => handleDragEnter(e, item.id)}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, item.id, section)}
        className={cn(
          'group relative transition-all duration-150',
          dragOverItem === item.id && dragSection === section && 'before:absolute before:inset-x-0 before:-top-0.5 before:h-0.5 before:bg-purple-500 before:rounded-full',
          draggedItem === item.id && 'opacity-50'
        )}
      >
        {isEditing ? (
          // Inline editing mode
          <div className={cn(
            'flex items-center gap-3 rounded-lg text-sm font-medium',
            'bg-purple-500/20 text-purple-400',
            isCollapsed ? 'justify-center p-3' : 'px-3 py-2'
          )}>
            {renderIcon(item.icon, isCollapsed ? 'w-6 h-6' : 'w-5 h-5')}
            {!isCollapsed && (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleSaveRename(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename(item.id)
                  if (e.key === 'Escape') { setEditingItemId(null); setEditingName('') }
                }}
                autoFocus
                className="flex-1 bg-transparent border-b border-purple-500 outline-none text-foreground text-sm min-w-0"
              />
            )}
            {!isCollapsed && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />}
          </div>
        ) : (
          // Normal navigation mode
          <NavLink
            to={item.href}
            onDoubleClick={(e) => handleDoubleClick(item, e)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
              isCollapsed ? 'justify-center p-3' : 'px-3 py-2'
            )}
            title={isCollapsed ? item.name : (item.isCustom && item.href.startsWith('/custom-dashboard/') ? t('sidebar.doubleClickRename') : undefined)}
          >
            {renderIcon(item.icon, isCollapsed ? 'w-6 h-6' : 'w-5 h-5')}
            {!isCollapsed && <span className="flex-1 truncate">{item.name}</span>}
            {!isCollapsed && (
              <span className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
                {!PROTECTED_SIDEBAR_IDS.includes(item.id) && (
                  <span
                    role="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeItem(item.id) }}
                    className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 text-muted-foreground/50 transition-colors"
                    title={t('sidebar.removeFromSidebar')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                )}
                <GripVertical
                  className="w-4 h-4 text-muted-foreground/50 cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </span>
            )}
          </NavLink>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && config.isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      <aside data-testid="sidebar" data-tour="sidebar" className={cn(
        'fixed left-0 top-16 bottom-0 glass border-r border-border/50 overflow-y-auto scroll-enhanced transition-all duration-300 z-40',
        // Desktop: respect collapsed state
        !isMobile && (config.collapsed ? 'w-20 p-3' : 'w-64 p-4'),
        // Mobile: always w-64 when open, slide off-screen when closed
        isMobile && 'w-64 p-4',
        isMobile && !config.isMobileOpen && '-translate-x-full',
        isMobile && config.isMobileOpen && 'translate-x-0'
      )}>
        {/* Collapse toggle - hidden on mobile */}
        <button
          data-testid="sidebar-collapse-toggle"
          onClick={toggleCollapsed}
          className="absolute -right-3 top-6 p-1 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground z-10 hidden md:block"
        >
          {config.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Primary navigation */}
        <nav data-testid="sidebar-primary-nav" className="space-y-1">
          {config.primaryNav.map(item => renderNavItem(item, 'primary'))}
        </nav>

        {/* Divider */}
        <div className="my-6 border-t border-border/50" />

        {/* Secondary navigation */}
        <nav className="space-y-1">
          {config.secondaryNav.map(item => renderNavItem(item, 'secondary'))}
        </nav>

        {/* Snoozed card swaps */}
        {!isCollapsed && (
          <div data-tour="snoozed">
            <SnoozedCards
              onApplySwap={handleApplySwap}
              onApplyRecommendation={handleApplyRecommendation}
              onApplyMission={handleApplyMission}
            />
          </div>
        )}

        {/* Add card button */}
        {!isCollapsed && (
          <div className="mt-6">
            <button
              data-testid="sidebar-add-card"
              onClick={handleAddCardClick}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-purple-500/50 hover:bg-purple-500/10 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">{t('buttons.addCard')}</span>
            </button>
          </div>
        )}

        {/* Cluster status summary */}
        {config.showClusterStatus && !isCollapsed && (
          <div data-testid="sidebar-cluster-status" className="mt-6 p-4 rounded-lg bg-secondary/30">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t('labels.clusterStatus')}
            </h4>
            <div className="space-y-2">
              <button
                onClick={() => handleClusterStatusClick('healthy')}
                className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  {t('labels.healthy')}
                </span>
                <span className="text-sm font-medium text-green-400">{healthyClusters}</span>
              </button>
              <button
                onClick={() => handleClusterStatusClick('unhealthy')}
                className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  {t('labels.unhealthy')}
                </span>
                <span className="text-sm font-medium text-red-400">{unhealthyClusters}</span>
              </button>
              <button
                onClick={() => handleClusterStatusClick('unreachable')}
                className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <WifiOff className="w-3.5 h-3.5 text-yellow-400" />
                  {t('labels.offline')}
                </span>
                <span className="text-sm font-medium text-yellow-400">{unreachableClusters}</span>
              </button>
            </div>
          </div>
        )}

        {/* Viewer count */}
        {!isCollapsed && (
          <div className="mt-4 flex items-center justify-end">
            <div
              className="flex items-center gap-1 px-2 text-muted-foreground/60"
              title={t('sidebar.activeViewers', { count: viewerCount })}
            >
              <User className={cn('w-3 h-3', viewersError && 'text-red-400')} />
              <span className="text-[10px] tabular-nums">
                {viewersError ? '!' : viewerCount}
              </span>
            </div>
          </div>
        )}
      </aside>

    </>
  )
}
