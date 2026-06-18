import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Plus, Satellite, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PROTECTED_SIDEBAR_IDS } from '../../../hooks/useSidebarConfig'
import { emitSidebarNavigated } from '../../../lib/analytics'
import { moveFocusByKey } from '../../../lib/a11y/rovingFocus'
import { cn } from '../../../lib/cn'
import { prefetchDashboard } from '../../../lib/prefetchDashboard'
import { Tooltip } from '../../ui/Tooltip'
import { useSidebarDragDrop } from './useSidebarDragDrop'
import { useSidebarRename } from './useSidebarRename'
import {
  COLLAPSED_BADGE_BASE_CLASS,
  PRIMARY_SECTION_INDEX,
  getNavItemBadge,
  isGroundControlItem,
  renderIcon,
} from './utils'
import type { NavSection, SidebarNavItem } from './types'

interface SidebarNavProps {
  navSections: NavSection[]
  isCollapsed: boolean
  canDrag: boolean
  showAddMore?: boolean
  onAddMore?: () => void
  onEditingChange?: (itemId: string | null) => void
  primaryNav: SidebarNavItem[]
  secondaryNav: SidebarNavItem[]
  removeItem: (id: string) => void
  reorderItems: (items: SidebarNavItem[], section: 'primary' | 'secondary') => void
  updateItem: (id: string, updates: { name: string }) => void
}

export function SidebarNav({
  navSections,
  isCollapsed,
  canDrag,
  showAddMore,
  onAddMore,
  onEditingChange,
  primaryNav,
  secondaryNav,
  removeItem,
  reorderItems,
  updateItem,
}: SidebarNavProps) {
  const { t } = useTranslation()
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const {
    editingItemId,
    editingName,
    setEditingItemId,
    setEditingName,
    handleDoubleClick,
    handleSaveRename,
  } = useSidebarRename({ onUpdateItem: updateItem, onEditingChange })
  const {
    draggedItem,
    dragOverItem,
    dragSection,
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useSidebarDragDrop({
    primaryNav,
    secondaryNav,
    onReorderItems: reorderItems,
  })

  const toggleSection = (id: string) => {
    setCollapsedSections(previous => ({ ...previous, [id]: !previous[id] }))
  }

  const renderNavItem = (item: SidebarNavItem, sectionId: string) => {
    const isEditing = editingItemId === item.id
    const navItemBadge = getNavItemBadge(item)
    const showTooltip = isCollapsed && !isEditing
    const tooltipBadgeText = navItemBadge.tooltipLabel ? ` (${navItemBadge.tooltipLabel})` : ''
    const tooltipContent = showTooltip ? `${item.label}${tooltipBadgeText} — ${t('help.sidebarNavItem')}` : ''
    const navItemTitle = [
      navItemBadge.tooltipLabel ? `${item.label} (${navItemBadge.tooltipLabel})` : item.label,
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
          onDragStart={event => handleDragStart(event, item.id, sectionId)}
          onDragEnd={handleDragEnd}
          onDragEnter={event => handleDragEnter(event, item.id)}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={event => handleDrop(event, item.id, sectionId)}
          className={cn(
            'group relative transition-opacity duration-150 w-full',
            dragOverItem === item.id && dragSection === sectionId && 'before:absolute before:inset-x-0 before:-top-0.5 before:h-0.5 before:bg-purple-500 before:rounded-full',
            draggedItem === item.id && 'opacity-50',
          )}
        >
          {isEditing ? (
            <div
              className={cn(
                'flex items-center gap-3 rounded-lg text-sm font-medium',
                'bg-purple-500/20 text-purple-400',
                isCollapsed ? 'justify-center p-3' : 'px-3 py-2',
              )}
            >
              {renderIcon(item.icon, isCollapsed ? 'w-6 h-6' : 'w-5 h-5')}
              {!isCollapsed && (
                <input
                  type="text"
                  value={editingName}
                  onChange={event => setEditingName(event.target.value)}
                  onBlur={() => handleSaveRename(item.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') handleSaveRename(item.id)
                    if (event.key === 'Escape') {
                      setEditingItemId(null)
                      setEditingName('')
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
                onDoubleClick={event => handleDoubleClick(item, event)}
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
                {!isCollapsed && (() => {
                  const isGC = isGroundControlItem(item.href)
                  return (
                    <span className="flex-1 min-w-0 flex items-center gap-1">
                      <span className="truncate">{item.label}</span>
                      {isGC && <Satellite className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-label="Ground Control dashboard" />}
                      {navItemBadge.count != null && (
                        <span
                          className="text-[10px] text-muted-foreground/40 tabular-nums ml-0.5 shrink-0"
                          title={t('sidebar.cardCount', { count: navItemBadge.count })}
                        >
                          {navItemBadge.count}
                        </span>
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
                      onClick={event => {
                        event.preventDefault()
                        event.stopPropagation()
                        removeItem(item.id)
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
                    onMouseDown={event => event.stopPropagation()}
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
            onKeyDown={event => {
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
      {navSections.map((section, index) => (
        <Fragment key={section.id}>
          {renderSection(section, index)}
          {index === PRIMARY_SECTION_INDEX && showAddMore && !isCollapsed && (
            <button
              data-testid="sidebar-customize"
              onClick={onAddMore}
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
