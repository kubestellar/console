import { Fragment, useState } from 'react'
import type React from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, ChevronRight, GripVertical, Plus, Satellite, X } from 'lucide-react'
import { iconRegistry } from '../../lib/icons'
import { cn } from '../../lib/cn'
import { Tooltip } from '../ui/Tooltip'
import { PROTECTED_SIDEBAR_IDS, type SidebarItem } from '../../hooks/useSidebarConfig'
import { emitSidebarNavigated } from '../../lib/analytics'
import { prefetchDashboard } from '../../lib/prefetchDashboard'
import { DASHBOARD_CONFIGS } from '../../config/dashboards/index'
import { getSidebarCardCount } from './sidebarCardCount'
import { moveFocusByKey } from '../../lib/a11y/rovingFocus'
import {
  COLLAPSED_BADGE_BASE_CLASS,
  COLLAPSED_BADGE_DEFAULT_COLOR_CLASS,
  COLLAPSED_BADGE_MAX_COUNT,
  HREF_TO_DASHBOARD_ID,
  PRIMARY_SECTION_INDEX,
  isGroundControlItem,
} from './SidebarShell.constants'
import type { NavSection, SidebarFeatures, SidebarNavItem } from './SidebarShell.types'

interface SidebarShellNavProps {
  navSections: NavSection[]
  isCollapsed: boolean
  isMobile: boolean
  features: SidebarFeatures
  onAddMore?: () => void
  dashboardContext?: { openAddCardModal: (section?: string) => void } | null
  t: (...args: any[]) => string
  editingItemId: string | null
  editingName: string
  setEditingName: (name: string) => void
  setEditingItemId: (id: string | null) => void
  draggedItem: string | null
  dragOverItem: string | null
  dragSection: string | null
  setDraggedItem: (id: string | null) => void
  setDragOverItem: (id: string | null) => void
  setDragSection: (id: string | null) => void
  dragCounter: React.MutableRefObject<number>
  config: { primaryNav: SidebarItem[]; secondaryNav: SidebarItem[] }
  reorderItems: (items: SidebarItem[], section: 'primary' | 'secondary') => void
  updateItem: (itemId: string, updates: Partial<SidebarItem>) => void
  removeItem: (itemId: string) => void
  onRenameSaved: () => void
}

export function SidebarShellNav({
  navSections,
  isCollapsed,
  isMobile,
  features,
  onAddMore,
  dashboardContext,
  t,
  editingItemId,
  editingName,
  setEditingName,
  setEditingItemId,
  draggedItem,
  dragOverItem,
  dragSection,
  setDraggedItem,
  setDragOverItem,
  setDragSection,
  dragCounter,
  config,
  reorderItems,
  updateItem,
  removeItem,
  onRenameSaved,
}: SidebarShellNavProps) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const handleDoubleClick = (item: SidebarNavItem, e: React.MouseEvent) => {
    if (!item.isCustom || !item.href.startsWith('/custom-dashboard/')) return
    e.preventDefault()
    e.stopPropagation()
    setEditingItemId(item.id)
    setEditingName(item.label)
  }

  const handleSaveRename = (itemId: string) => {
    const trimmed = editingName.trim()
    if (trimmed) {
      updateItem(itemId, { name: trimmed })
      onRenameSaved()
    }
    setEditingItemId(null)
    setEditingName('')
  }

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

  const canDrag = features.dragReorder !== false && !isMobile

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
                  if (e.key === 'Escape') { setEditingItemId(null); setEditingName('') }
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

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const renderSection = (section: NavSection, index: number) => {
    const isOpen = !collapsedSections[section.id]

    return (
      <div key={section.id}>
        {index > 0 && <div className="my-6 border-t border-border/50" />}

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

  return (
    <>
      {navSections.map((section, index) => {
        return (
          <Fragment key={section.id}>
            {renderSection(section, index)}
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
        )
      })}
    </>
  )
}
