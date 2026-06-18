/**
 * SidebarNavGroups — renders navigation sections and items inside SidebarShell.
 *
 * Encapsulates:
 *   - Nav section collapse/expand (via useSidebarSectionCollapse)
 *   - Drag-and-drop reorder
 *   - Inline rename for custom dashboards
 *   - "Add more dashboards" button
 *
 * Extracted from SidebarShell.tsx (issue #19012).
 */
import { useState, useRef, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import {
  Plus, ChevronRight, GripVertical, X, Satellite, ChevronDown,
} from 'lucide-react'
import { iconRegistry } from '../../lib/icons'
import { cn } from '../../lib/cn'
import { ROUTES } from '../../config/routes'
import { Tooltip } from '../ui/Tooltip'
import {
  useSidebarConfig,
  PROTECTED_SIDEBAR_IDS,
} from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'
import { DASHBOARD_CONFIGS } from '../../config/dashboards/index'
import { emitSidebarNavigated, emitDashboardRenamed } from '../../lib/analytics'
import { prefetchDashboard } from '../../lib/prefetchDashboard'
import { STORAGE_KEY_GROUND_CONTROL_DASHBOARDS } from '../../lib/constants/storage'
import { safeGetJSON } from '../../lib/utils/localStorage'
import { getSidebarCardCount } from './sidebarCardCount'
import { moveFocusByKey } from '../../lib/a11y/rovingFocus'
import { useSidebarSectionCollapse } from './useSidebarSectionCollapse'
import type { NavSection, SidebarNavItem, SidebarFeatures } from './SidebarShell'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Index of the primary (dashboard list) section — "Add more..." button renders after it */
const PRIMARY_SECTION_INDEX = 0

/** Map sidebar item href to dashboard config ID for card count display. */
const HREF_TO_DASHBOARD_ID: Record<string, string> = {
  [ROUTES.HOME]: 'main', [ROUTES.COMPUTE]: 'compute', [ROUTES.SECURITY]: 'security',
  [ROUTES.GITOPS]: 'gitops', [ROUTES.STORAGE]: 'storage', [ROUTES.NETWORK]: 'network',
  [ROUTES.EVENTS]: 'events', [ROUTES.ALERTS]: 'alerts', [ROUTES.WORKLOADS]: 'workloads', [ROUTES.OPERATORS]: 'operators',
  [ROUTES.CLUSTERS]: 'clusters', [ROUTES.COMPLIANCE]: 'compliance', [ROUTES.COST]: 'cost',
  [ROUTES.GPU_RESERVATIONS]: 'gpu', [ROUTES.NODES]: 'nodes', [ROUTES.DEPLOYMENTS]: 'deployments',
  [ROUTES.PODS]: 'pods', [ROUTES.SERVICES]: 'services', [ROUTES.HELM]: 'helm',
  [ROUTES.AI_ML]: 'ai-ml', [ROUTES.CI_CD]: 'ci-cd',
  [ROUTES.LOGS]: 'logs', [ROUTES.DATA_COMPLIANCE]: 'data-compliance', [ROUTES.ARCADE]: 'arcade',
  [ROUTES.DEPLOY]: 'deploy', [ROUTES.AI_AGENTS]: 'ai-agents',
  [ROUTES.LLM_D_BENCHMARKS]: 'llm-d-benchmarks', [ROUTES.CLUSTER_ADMIN]: 'cluster-admin',
  [ROUTES.INSIGHTS]: 'insights', [ROUTES.DRASI]: 'drasi',
  [ROUTES.MULTI_TENANCY]: 'multi-tenancy', [ROUTES.ACMM]: 'acmm',
}

const CUSTOM_DASHBOARD_PREFIX = ROUTES.CUSTOM_DASHBOARD.replace(':id', '')

const COLLAPSED_BADGE_MAX_COUNT = 99
const COLLAPSED_BADGE_BASE_CLASS = 'absolute -top-1 -right-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full border border-background px-0.5 text-[10px] font-bold leading-none shadow-sm'
const COLLAPSED_BADGE_DEFAULT_COLOR_CLASS = 'bg-primary text-primary-foreground'

function isGroundControlItem(href: string): boolean {
  if (!href.startsWith(CUSTOM_DASHBOARD_PREFIX)) return false
  const dashboardId = href.slice(CUSTOM_DASHBOARD_PREFIX.length)
  const gcMapping = safeGetJSON<Record<string, unknown>>(STORAGE_KEY_GROUND_CONTROL_DASHBOARDS) ?? {}
  return dashboardId in gcMapping
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SidebarNavGroupsProps {
  navSections: NavSection[]
  features: SidebarFeatures
  isCollapsed: boolean
  onAddMore?: () => void
  /**
   * Called whenever the inline-rename editing state changes.
   * The parent uses this to prevent closing the mobile sidebar while renaming.
   */
  onEditingChange?: (isEditing: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SidebarNavGroups({
  navSections,
  features,
  isCollapsed,
  onAddMore,
  onEditingChange,
}: SidebarNavGroupsProps) {
  const { config, reorderItems, updateItem, removeItem } = useSidebarConfig()
  const { isMobile } = useMobile()
  const dashboardContext = useDashboardContextOptional()
  const { t } = useTranslation()
  const { collapsedSections, toggleSection } = useSidebarSectionCollapse()

  // ---- Inline rename state ----
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // ---- Drag-and-drop state ----
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)
  const [dragSection, setDragSection] = useState<string | null>(null)
  const dragCounter = useRef(0)

  /* Disable drag-reorder on mobile — draggable elements intercept touch
   * events on Safari, preventing NavLink taps from registering. */
  const canDrag = features.dragReorder !== false && !isMobile

  // ---- Rendering helpers ----
  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = iconRegistry[iconName] as React.ComponentType<{ className?: string }> | undefined
    return IconComponent ? <IconComponent className={className} /> : null
  }

  const getCompactBadgeLabel = (badgeValue: string) => {
    const numericBadge = Number(badgeValue)

    if (!Number.isFinite(numericBadge)) {
      return badgeValue
    }

    return numericBadge > COLLAPSED_BADGE_MAX_COUNT
      ? `${COLLAPSED_BADGE_MAX_COUNT}+`
      : String(numericBadge)
  }

  const getNavItemBadge = (item: SidebarNavItem) => {
    const dashboardId = HREF_TO_DASHBOARD_ID[item.href]
    const count = dashboardId
      ? getSidebarCardCount(DASHBOARD_CONFIGS[dashboardId])
      : null
    const rawBadge = item.badge ?? (count != null ? String(count) : null)
    const trimmedBadge = rawBadge?.trim()

    if (!trimmedBadge) {
      return {
        count,
        compactLabel: null,
        tooltipLabel: null,
        colorClassName: item.badgeColor ?? COLLAPSED_BADGE_DEFAULT_COLOR_CLASS,
      }
    }

    const numericBadge = Number(trimmedBadge)
    const hasNumericBadge = Number.isFinite(numericBadge)

    if (hasNumericBadge && numericBadge <= 0) {
      return {
        count,
        compactLabel: null,
        tooltipLabel: null,
        colorClassName: item.badgeColor ?? COLLAPSED_BADGE_DEFAULT_COLOR_CLASS,
      }
    }

    return {
      count,
      compactLabel: getCompactBadgeLabel(trimmedBadge),
      tooltipLabel: trimmedBadge,
      colorClassName: item.badgeColor ?? COLLAPSED_BADGE_DEFAULT_COLOR_CLASS,
    }
  }

  // ---- Inline rename handlers ----
  const handleDoubleClick = (item: SidebarNavItem, e: React.MouseEvent) => {
    if (!item.isCustom || !item.href.startsWith('/custom-dashboard/')) return
    e.preventDefault()
    e.stopPropagation()
    setEditingItemId(item.id)
    setEditingName(item.label)
    onEditingChange?.(true)
  }

  const handleSaveRename = (itemId: string) => {
    const trimmed = editingName.trim()
    if (trimmed) {
      updateItem(itemId, { name: trimmed })
      emitDashboardRenamed()
    }
    setEditingItemId(null)
    setEditingName('')
    onEditingChange?.(false)
  }

  // ---- Drag handlers ----
  const handleDragStart = (e: React.DragEvent, itemId: string, sectionId: string) => {
    setDraggedItem(itemId)
    setDragSection(sectionId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
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

  const handleDrop = (e: React.DragEvent, targetId: string, sectionId: string) => {
    e.preventDefault()
    dragCounter.current = 0

    if (!draggedItem || draggedItem === targetId || sectionId !== dragSection) {
      setDraggedItem(null)
      setDragOverItem(null)
      setDragSection(null)
      return
    }

    // Map section IDs back to the sidebar config sections
    const section = sectionId as 'primary' | 'secondary'
    const items = section === 'primary' ? [...config.primaryNav] : [...config.secondaryNav]
    const draggedIndex = items.findIndex(item => item.id === draggedItem)
    const targetIndex = items.findIndex(item => item.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const [removed] = items.splice(draggedIndex, 1)
    items.splice(targetIndex, 0, removed)

    const reorderedItems = items.map((item, index) => ({ ...item, order: index }))
    reorderItems(reorderedItems, section)

    setDraggedItem(null)
    setDragOverItem(null)
    setDragSection(null)
  }

  // ---- Nav item renderer ----
  const renderNavItem = (item: SidebarNavItem, sectionId: string) => {
    const isEditing = editingItemId === item.id
    const navItemBadge = getNavItemBadge(item)
    const showTooltip = isCollapsed && !isEditing
    const tooltipBadgeText = navItemBadge.tooltipLabel
      ? ` (${navItemBadge.tooltipLabel})`
      : ''
    const tooltipContent = showTooltip
      ? `${item.label}${tooltipBadgeText} — ${t('help.sidebarNavItem')}`
      : ''
    const navItemTitle = [
      navItemBadge.tooltipLabel
        ? `${item.label} (${navItemBadge.tooltipLabel})`
        : item.label,
    ]

    if (item.isCustom && item.href.startsWith('/custom-dashboard/')) {
      navItemTitle.push(t('sidebar.doubleClickRename'))
    }

    return (
      <Tooltip
        key={item.id}
        content={tooltipContent}
        side="right"
        disabled={!showTooltip}
        wrapperClassName="block w-full"
      >
      <div
        draggable={canDrag && !isCollapsed && !isEditing}
        onDragStart={(e) => handleDragStart(e, item.id, sectionId)}
        onDragEnd={handleDragEnd}
        onDragEnter={(e) => handleDragEnter(e, item.id)}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, item.id, sectionId)}
        className={cn(
          'group relative transition-opacity duration-150 w-full',
          dragOverItem === item.id && dragSection === sectionId && 'before:absolute before:inset-x-0 before:-top-0.5 before:h-0.5 before:bg-purple-500 before:rounded-full',
          draggedItem === item.id && 'opacity-50'
        )}
      >
        {isEditing ? (
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
                  if (e.key === 'Escape') {
                    setEditingItemId(null)
                    setEditingName('')
                    onEditingChange?.(false)
                  }
                }}
                autoFocus
                className="w-[150px] md:w-full md:flex-1 shrink bg-transparent border-b border-purple-500 outline-hidden text-foreground text-sm min-w-0"
              />
            )}
            {!isCollapsed && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
          </div>
        ) : (
          <>
          <NavLink
            to={item.href}
            data-testid="sidebar-item"
            data-test-label={item.label}
            onClick={() => emitSidebarNavigated(item.href)}
            onDoubleClick={(e) => handleDoubleClick(item, e)}
            onMouseEnter={() => prefetchDashboard(item.href)}
            className={({ isActive }) => cn(
              'relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-200',
              isActive
                ? 'bg-purple-500/15 text-purple-400 border-l-[3px] border-purple-500 shadow-[inset_0_0_12px_rgba(168,85,247,0.08)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-l-[3px] border-transparent',
              isCollapsed ? 'justify-center p-3' : 'px-3 py-2'
            )}
            title={(navItemTitle || []).join(' — ')}
          >
            <span className="relative shrink-0">
              {renderIcon(item.icon, isCollapsed ? 'w-6 h-6' : 'w-5 h-5')}
              {isCollapsed && navItemBadge.compactLabel && (
                <span
                  className={cn(COLLAPSED_BADGE_BASE_CLASS, navItemBadge.colorClassName)}
                  aria-hidden="true"
                >
                  {navItemBadge.compactLabel}
                </span>
              )}
            </span>
            {!isCollapsed && (() => {
              const isGC = isGroundControlItem(item.href)
              return (
                <span className="flex-1 min-w-0 flex items-center gap-1">
                  <span className="truncate">{item.label}</span>
                  {isGC && (
                    <Satellite className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-label="Ground Control dashboard" />
                  )}
                  {navItemBadge.count != null && (
                    <span
                      className="text-[10px] text-muted-foreground/40 tabular-nums ml-0.5 shrink-0"
                      title={t('sidebar.cardCount', { count: navItemBadge.count })}
                    >{navItemBadge.count}</span>
                  )}
                </span>
              )
            })()}
          </NavLink>
            {!isCollapsed && canDrag && (
              <span className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-xs rounded px-1 z-10">
                {!PROTECTED_SIDEBAR_IDS.includes(item.id) && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeItem(item.id) }}
                    className="p-1 rounded hover:bg-red-500/20 hover:text-red-400 text-muted-foreground/50 transition-colors"
                    title={t('sidebar.removeFromSidebar')}
                    aria-label={t('sidebar.removeFromSidebar')}
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
                <span
                  className="p-1 rounded hover:bg-secondary text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors"
                  aria-hidden="true"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <GripVertical
                    className="w-4 h-4"
                  />
                </span>
              </span>
            )}
          </>
        )}
      </div>
      </Tooltip>
    )
  }

  // ---- Section renderer ----
  const renderSection = (section: NavSection, index: number) => {
    const isOpen = !collapsedSections[section.id]

    return (
      <div key={section.id}>
        {/* Divider between sections (except before the first) */}
        {index > 0 && <div className="my-6 border-t border-border/50" />}

        {/* Collapsible section header */}
        {section.label && !isCollapsed && (
          <button
            onClick={() => section.collapsible && toggleSection(section.id)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors',
              section.collapsible && 'cursor-pointer',
              !section.collapsible && 'cursor-default',
            )}
          >
            <span className="flex-1 text-left">{section.label}</span>
            {section.collapsible && (
              isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
            )}
          </button>
        )}

        {/* Section items */}
        {(isOpen || !section.collapsible) && (
          <nav
            data-testid={`sidebar-${section.id}-nav`}
            className="space-y-1"
            onKeyDown={(event) => {
              moveFocusByKey(event, { selector: 'a[data-testid="sidebar-item"]', orientation: 'vertical' })
            }}
          >
            {section.items.map(item => renderNavItem(item, section.id))}
          </nav>
        )}
      </div>
    )
  }

  // ---- Render ----
  return (
    <>
      {navSections.map((section, index) => (
        <Fragment key={section.id}>
          {renderSection(section, index)}

          {/* "Add more" button — placed after the primary dashboard list */}
          {index === PRIMARY_SECTION_INDEX && features.addMore && !isCollapsed && (
            <button
              data-testid="sidebar-customize"
              onClick={() => onAddMore?.() ?? dashboardContext?.openAddCardModal('dashboards')}
              className="w-full flex items-center gap-3 px-3 py-1.5 mt-1 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/30 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('sidebar.addMore', 'Add dashboard cards…')}</span>
            </button>
          )}
        </Fragment>
      ))}
    </>
  )
}
