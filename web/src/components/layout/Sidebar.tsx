import { useState, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import * as Icons from 'lucide-react'
import { Plus, Pencil, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, WifiOff, GripVertical } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SnoozedCards } from './SnoozedCards'
import { SidebarCustomizer } from './SidebarCustomizer'
import { useSidebarConfig, SidebarItem } from '../../hooks/useSidebarConfig'
import { useClusters } from '../../hooks/useMCP'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'
import type { SnoozedSwap } from '../../hooks/useSnoozedCards'
import type { SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import type { SnoozedMission } from '../../hooks/useSnoozedMissions'

export function Sidebar() {
  const { config, toggleCollapsed, reorderItems, updateItem } = useSidebarConfig()
  const { deduplicatedClusters } = useClusters()
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false)
  const dashboardContext = useDashboardContextOptional()
  const navigate = useNavigate()
  const location = useLocation()

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
      if (currentPath === '/') {
        dashboardContext?.openAddCardModal()
      } else {
        // Navigate to same page with addCard param to trigger modal
        navigate(`${currentPath}?addCard=true`)
      }
    } else {
      // On a non-card page, navigate to main dashboard
      dashboardContext?.setPendingOpenAddCardModal(true)
      navigate('/')
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
    navigate(`/clusters?status=${status}`)
  }

  // Handle snoozed card swap restore - navigate to dashboard
  const handleApplySwap = (_swap: SnoozedSwap) => {
    // Navigate to main dashboard where the swap can be applied
    navigate('/')
  }

  // Handle snoozed recommendation restore - navigate to dashboard
  const handleApplyRecommendation = (_rec: SnoozedRecommendation) => {
    // Navigate to main dashboard to apply the recommendation
    navigate('/')
  }

  // Handle snoozed mission restore - navigate to dashboard
  const handleApplyMission = (_mission: SnoozedMission) => {
    // Navigate to main dashboard where missions are displayed
    navigate('/')
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
        draggable={!config.collapsed && !isEditing}
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
            config.collapsed ? 'justify-center p-3' : 'px-3 py-2 pl-2'
          )}>
            {!config.collapsed && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />}
            {renderIcon(item.icon, config.collapsed ? 'w-6 h-6' : 'w-5 h-5')}
            {!config.collapsed && (
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
              config.collapsed ? 'justify-center p-3' : 'px-3 py-2',
              !config.collapsed && 'pl-2'
            )}
            title={config.collapsed ? item.name : (item.isCustom && item.href.startsWith('/custom-dashboard/') ? 'Double-click to rename' : undefined)}
          >
            {!config.collapsed && (
              <GripVertical
                className="w-3.5 h-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing flex-shrink-0"
                onMouseDown={(e) => e.stopPropagation()}
              />
            )}
            {renderIcon(item.icon, config.collapsed ? 'w-6 h-6' : 'w-5 h-5')}
            {!config.collapsed && item.name}
          </NavLink>
        )}
      </div>
    )
  }

  return (
    <>
      <aside data-tour="sidebar" className={cn(
        'fixed left-0 top-16 bottom-0 glass border-r border-border/50 overflow-y-auto transition-all duration-300',
        config.collapsed ? 'w-20 p-3' : 'w-64 p-4'
      )}>
        {/* Collapse toggle */}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-6 p-1 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground z-10"
        >
          {config.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Primary navigation */}
        <nav className="space-y-1">
          {config.primaryNav.map(item => renderNavItem(item, 'primary'))}
        </nav>

        {/* Divider */}
        <div className="my-6 border-t border-border/50" />

        {/* Secondary navigation */}
        <nav className="space-y-1">
          {config.secondaryNav.map(item => renderNavItem(item, 'secondary'))}
        </nav>

        {/* Snoozed card swaps */}
        {!config.collapsed && (
          <div data-tour="snoozed">
            <SnoozedCards
              onApplySwap={handleApplySwap}
              onApplyRecommendation={handleApplyRecommendation}
              onApplyMission={handleApplyMission}
            />
          </div>
        )}

        {/* Add card button */}
        {!config.collapsed && (
          <div className="mt-6">
            <button
              onClick={handleAddCardClick}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-purple-500/50 hover:bg-purple-500/10 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add Card</span>
            </button>
          </div>
        )}

        {/* Cluster status summary */}
        {config.showClusterStatus && !config.collapsed && (
          <div className="mt-6 p-4 rounded-lg bg-secondary/30">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Cluster Status
            </h4>
            <div className="space-y-2">
              <button
                onClick={() => handleClusterStatusClick('healthy')}
                className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  Healthy
                </span>
                <span className="text-sm font-medium text-green-400">{healthyClusters}</span>
              </button>
              <button
                onClick={() => handleClusterStatusClick('unhealthy')}
                className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                  Unhealthy
                </span>
                <span className="text-sm font-medium text-orange-400">{unhealthyClusters}</span>
              </button>
              <button
                onClick={() => handleClusterStatusClick('unreachable')}
                className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <WifiOff className="w-3.5 h-3.5 text-yellow-400" />
                  Offline
                </span>
                <span className="text-sm font-medium text-yellow-400">{unreachableClusters}</span>
              </button>
            </div>
          </div>
        )}

        {/* Customize button */}
        <div className="mt-4">
          <button
            onClick={() => setIsCustomizerOpen(true)}
            className={cn(
              'flex items-center gap-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors',
              config.collapsed ? 'justify-center w-full p-3' : 'px-3 py-2 text-xs'
            )}
            title={config.collapsed ? 'Customize sidebar' : undefined}
          >
            <Pencil className={config.collapsed ? 'w-5 h-5' : 'w-3 h-3'} />
            {!config.collapsed && 'Customize'}
          </button>
        </div>
      </aside>

      {/* Sidebar Customizer Modal */}
      <SidebarCustomizer
        isOpen={isCustomizerOpen}
        onClose={() => setIsCustomizerOpen(false)}
      />
    </>
  )
}
