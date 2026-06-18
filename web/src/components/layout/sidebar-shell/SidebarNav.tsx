import { Fragment, type ComponentType, type DragEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { ChevronDown, ChevronRight, GripVertical, Plus, Satellite, X } from 'lucide-react'
import { iconRegistry } from '../../../lib/icons'
import { cn } from '../../../lib/cn'
import { Tooltip } from '../../ui/Tooltip'
import { PROTECTED_SIDEBAR_IDS } from '../../../hooks/useSidebarConfig'
import { emitSidebarNavigated } from '../../../lib/analytics'
import { prefetchDashboard } from '../../../lib/prefetchDashboard'
import { DASHBOARD_CONFIGS } from '../../../config/dashboards/index'
import { getSidebarCardCount } from '../sidebarCardCount'
import { moveFocusByKey } from '../../../lib/a11y/rovingFocus'
import {
  COLLAPSED_BADGE_BASE_CLASS,
  COLLAPSED_BADGE_DEFAULT_COLOR_CLASS,
  COLLAPSED_BADGE_MAX_COUNT,
  PRIMARY_SECTION_INDEX,
  getDashboardIdForHref,
  isGroundControlItem,
} from './constants'
import type { NavSection, SidebarFeatures, SidebarNavItem } from './types'

interface SidebarNavProps {
  navSections: NavSection[]
  features: SidebarFeatures
  isCollapsed: boolean
  isMobile: boolean
  editingItemId: string | null
  editingName: string
  collapsedSections: Record<string, boolean>
  draggedItem: string | null
  dragOverItem: string | null
  dragSection: string | null
  onEditingNameChange: (value: string) => void
  onEditingCancel: () => void
  onDoubleClick: (item: SidebarNavItem, event: MouseEvent) => void
  onSaveRename: (itemId: string) => void
  onToggleSection: (sectionId: string) => void
  onDragStart: (event: DragEvent, itemId: string, sectionId: string) => void
  onDragEnd: (event: DragEvent) => void
  onDragEnter: (event: DragEvent, itemId: string) => void
  onDragLeave: () => void
  onDragOver: (event: DragEvent) => void
  onDrop: (event: DragEvent, targetId: string, sectionId: string) => void
  onRemoveItem: (itemId: string) => void
  onAddMore?: () => void
  openDashboardCatalog?: () => void
}

function renderIcon(iconName: string, className?: string) {
  const IconComponent = iconRegistry[iconName] as ComponentType<{ className?: string }> | undefined
  return IconComponent ? <IconComponent className={className} /> : null
}

function getCompactBadgeLabel(badgeValue: string): string {
  const numericBadge = Number(badgeValue)
  if (!Number.isFinite(numericBadge)) {
    return badgeValue
  }
  return numericBadge > COLLAPSED_BADGE_MAX_COUNT ? `${COLLAPSED_BADGE_MAX_COUNT}+` : String(numericBadge)
}

function getNavItemBadge(item: SidebarNavItem) {
  const dashboardId = getDashboardIdForHref(item.href)
  const count = dashboardId ? getSidebarCardCount(DASHBOARD_CONFIGS[dashboardId]) : null
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
  if (Number.isFinite(numericBadge) && numericBadge <= 0) {
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

export function SidebarNav({
  navSections,
  features,
  isCollapsed,
  isMobile,
  editingItemId,
  editingName,
  collapsedSections,
  draggedItem,
  dragOverItem,
  dragSection,
  onEditingNameChange,
  onEditingCancel,
  onDoubleClick,
  onSaveRename,
  onToggleSection,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onRemoveItem,
  onAddMore,
  openDashboardCatalog,
}: SidebarNavProps) {
  const { t } = useTranslation()
  const canDrag = features.dragReorder !== false && !isMobile

  const renderNavItem = (item: SidebarNavItem, sectionId: string) => {
    const isEditing = editingItemId === item.id
    const navItemBadge = getNavItemBadge(item)
    const showTooltip = isCollapsed && !isEditing
    const tooltipBadgeText = navItemBadge.tooltipLabel ? ` (${navItemBadge.tooltipLabel})` : ''
    const tooltipContent = showTooltip ? `${item.label}${tooltipBadgeText} — ${t('help.sidebarNavItem')}` : ''
    const navItemTitle = [navItemBadge.tooltipLabel ? `${item.label} (${navItemBadge.tooltipLabel})` : item.label]

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
          onDragStart={(event) => onDragStart(event, item.id, sectionId)}
          onDragEnd={onDragEnd}
          onDragEnter={(event) => onDragEnter(event, item.id)}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={(event) => onDrop(event, item.id, sectionId)}
          className={cn(
            'group relative transition-opacity duration-150 w-full',
            dragOverItem === item.id && dragSection === sectionId && 'before:absolute before:inset-x-0 before:-top-0.5 before:h-0.5 before:bg-purple-500 before:rounded-full',
            draggedItem === item.id && 'opacity-50',
          )}
        >
          {isEditing ? (
            <div className={cn(
              'flex items-center gap-3 rounded-lg text-sm font-medium',
              'bg-purple-500/20 text-purple-400',
              isCollapsed ? 'justify-center p-3' : 'px-3 py-2',
            )}>
              {renderIcon(item.icon, isCollapsed ? 'w-6 h-6' : 'w-5 h-5')}
              {!isCollapsed && (
                <input
                  type="text"
                  value={editingName}
                  onChange={(event) => onEditingNameChange(event.target.value)}
                  onBlur={() => onSaveRename(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onSaveRename(item.id)
                    if (event.key === 'Escape') onEditingCancel()
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
                onDoubleClick={(event) => onDoubleClick(item, event)}
                onMouseEnter={() => prefetchDashboard(item.href)}
                className={({ isActive }) => cn(
                  'relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-200',
                  isActive
                    ? 'bg-purple-500/15 text-purple-400 border-l-[3px] border-purple-500 shadow-[inset_0_0_12px_rgba(168,85,247,0.08)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-l-[3px] border-transparent',
                  isCollapsed ? 'justify-center p-3' : 'px-3 py-2',
                )}
                title={navItemTitle.join(' — ')}
              >
                <span className="relative shrink-0">
                  {renderIcon(item.icon, isCollapsed ? 'w-6 h-6' : 'w-5 h-5')}
                  {isCollapsed && navItemBadge.compactLabel && (
                    <span className={cn(COLLAPSED_BADGE_BASE_CLASS, navItemBadge.colorClassName)} aria-hidden="true">
                      {navItemBadge.compactLabel}
                    </span>
                  )}
                </span>
                {!isCollapsed && (
                  <span className="flex-1 min-w-0 flex items-center gap-1">
                    <span className="truncate">{item.label}</span>
                    {isGroundControlItem(item.href) && (
                      <Satellite className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-label="Ground Control dashboard" />
                    )}
                    {navItemBadge.count != null && (
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums ml-0.5 shrink-0" title={t('sidebar.cardCount', { count: navItemBadge.count })}>
                        {navItemBadge.count}
                      </span>
                    )}
                  </span>
                )}
              </NavLink>
              {!isCollapsed && canDrag && (
                <span className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-xs rounded px-1 z-10">
                  {!PROTECTED_SIDEBAR_IDS.includes(item.id) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onRemoveItem(item.id)
                      }}
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
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>
                </span>
              )}
            </>
          )}
        </div>
      </Tooltip>
    )
  }

  return (
    <>
      {navSections.map((section, index) => {
        const isOpen = !collapsedSections[section.id]
        return (
          <Fragment key={section.id}>
            <div>
              {index > 0 && <div className="my-6 border-t border-border/50" />}
              {section.label && !isCollapsed && (
                <button
                  onClick={() => section.collapsible && onToggleSection(section.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors',
                    section.collapsible ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  <span className="flex-1 text-left">{section.label}</span>
                  {section.collapsible && (isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
                </button>
              )}
              {(isOpen || !section.collapsible) && (
                <nav
                  data-testid={`sidebar-${section.id}-nav`}
                  className="space-y-1"
                  onKeyDown={(event) => moveFocusByKey(event, { selector: 'a[data-testid="sidebar-item"]', orientation: 'vertical' })}
                >
                  {section.items.map(item => renderNavItem(item, section.id))}
                </nav>
              )}
            </div>
            {index === PRIMARY_SECTION_INDEX && features.addMore && !isCollapsed && (
              <button
                data-testid="sidebar-customize"
                onClick={() => onAddMore?.() ?? openDashboardCatalog?.()}
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
