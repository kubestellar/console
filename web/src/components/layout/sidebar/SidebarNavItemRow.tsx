import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { GripVertical, X, Satellite } from 'lucide-react'
import { iconRegistry } from '../../../lib/icons'
import { cn } from '../../../lib/cn'
import { ROUTES } from '../../../config/routes'
import { Tooltip } from '../../ui/Tooltip'
import { PROTECTED_SIDEBAR_IDS } from '../../../hooks/useSidebarConfig'
import { getSidebarCardCount } from '../sidebarCardCount'
import { DASHBOARD_CONFIGS } from '../../../config/dashboards/index'
import { emitSidebarNavigated } from '../../../lib/analytics'
import { prefetchDashboard } from '../../../lib/prefetchDashboard'
import { STORAGE_KEY_GROUND_CONTROL_DASHBOARDS } from '../../../lib/constants/storage'
import { safeGetJSON } from '../../../lib/utils/localStorage'
import type { SidebarNavItem } from '../SidebarShell'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COLLAPSED_BADGE_MAX_COUNT = 99
export const COLLAPSED_BADGE_BASE_CLASS = 'absolute -top-1 -right-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full border border-background px-0.5 text-xs font-bold leading-none shadow-sm'
export const COLLAPSED_BADGE_DEFAULT_COLOR_CLASS = 'bg-primary text-primary-foreground'

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

function isGroundControlItem(href: string): boolean {
  if (!href.startsWith(CUSTOM_DASHBOARD_PREFIX)) return false
  const dashboardId = href.slice(CUSTOM_DASHBOARD_PREFIX.length)
  const gcMapping = safeGetJSON<Record<string, unknown>>(STORAGE_KEY_GROUND_CONTROL_DASHBOARDS) ?? {}
  return dashboardId in gcMapping
}

function renderIcon(iconName: string, className?: string) {
  const IconComponent = iconRegistry[iconName] as import('react').ComponentType<{ className?: string }> | undefined
  return IconComponent ? <IconComponent className={className} /> : null
}

function getCompactBadgeLabel(badgeValue: string): string {
  const numericBadge = Number(badgeValue)
  if (!Number.isFinite(numericBadge)) return badgeValue
  return numericBadge > COLLAPSED_BADGE_MAX_COUNT ? `${COLLAPSED_BADGE_MAX_COUNT}+` : String(numericBadge)
}

function getNavItemBadge(item: SidebarNavItem) {
  const dashboardId = HREF_TO_DASHBOARD_ID[item.href]
  const count = dashboardId ? getSidebarCardCount(DASHBOARD_CONFIGS[dashboardId]) : null
  const rawBadge = item.badge ?? (count != null ? String(count) : null)
  const trimmedBadge = rawBadge?.trim()

  if (!trimmedBadge) {
    return { count, compactLabel: null, tooltipLabel: null, colorClassName: item.badgeColor ?? COLLAPSED_BADGE_DEFAULT_COLOR_CLASS }
  }

  const numericBadge = Number(trimmedBadge)
  const hasNumericBadge = Number.isFinite(numericBadge)

  if (hasNumericBadge && numericBadge <= 0) {
    return { count, compactLabel: null, tooltipLabel: null, colorClassName: item.badgeColor ?? COLLAPSED_BADGE_DEFAULT_COLOR_CLASS }
  }

  return {
    count,
    compactLabel: getCompactBadgeLabel(trimmedBadge),
    tooltipLabel: trimmedBadge,
    colorClassName: item.badgeColor ?? COLLAPSED_BADGE_DEFAULT_COLOR_CLASS,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SidebarNavItemRowProps {
  item: SidebarNavItem
  sectionId: string
  isCollapsed: boolean
  canDrag: boolean
  editingItemId: string | null
  editingName: string
  draggedItem: string | null
  dragOverItem: string | null
  dragSection: string | null
  onDragStart: (e: React.DragEvent, itemId: string, sectionId: string) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent, itemId: string) => void
  onDragLeave: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, targetId: string, sectionId: string) => void
  onDoubleClick: (item: SidebarNavItem, e: React.MouseEvent) => void
  onSaveRename: (itemId: string) => void
  onCancelRename: () => void
  onRenameChange: (value: string) => void
  onRemove: (itemId: string) => void
}

export function SidebarNavItemRow({
  item,
  sectionId,
  isCollapsed,
  canDrag,
  editingItemId,
  editingName,
  draggedItem,
  dragOverItem,
  dragSection,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onDoubleClick,
  onSaveRename,
  onCancelRename,
  onRenameChange,
  onRemove,
}: SidebarNavItemRowProps) {
  const { t } = useTranslation()
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
      content={tooltipContent}
      side="right"
      disabled={!showTooltip}
      wrapperClassName="block w-full"
    >
      <div
        draggable={canDrag && !isCollapsed && !isEditing}
        onDragStart={(e) => onDragStart(e, item.id, sectionId)}
        onDragEnd={onDragEnd}
        onDragEnter={(e) => onDragEnter(e, item.id)}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, item.id, sectionId)}
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
              // eslint-disable-next-line no-restricted-syntax -- inline rename needs bg-transparent + border-b styling that the shared <Input> wrapper (div-wrapped, rounded, filled bg) doesn't support
              <input
                type="text"
                value={editingName}
                onChange={(e) => onRenameChange(e.target.value)}
                onBlur={() => onSaveRename(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveRename(item.id)
                  if (e.key === 'Escape') onCancelRename()
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
              onDoubleClick={(e) => onDoubleClick(item, e)}
              onMouseEnter={() => prefetchDashboard(item.href)}
              className={({ isActive }) => cn(
                'relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-200',
                isActive
                  ? 'bg-purple-500/15 text-purple-400 border-l-[3px] border-purple-500 shadow-purple-inset'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-l-[3px] border-transparent',
                isCollapsed ? 'justify-center p-3' : 'px-3 py-2'
              )}
              title={(navItemTitle || []).join(' — ')}
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
                    {isGC && (
                      <Satellite className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-label="Ground Control dashboard" />
                    )}
                    {navItemBadge.count != null && (
                      <span
                        className="text-xs text-muted-foreground/40 tabular-nums ml-0.5 shrink-0"
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
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(item.id) }}
                    className="min-h-11 min-w-11 p-1 rounded hover:bg-red-500/20 hover:text-red-400 text-muted-foreground/50 transition-colors"
                    title={t('sidebar.removeFromSidebar')}
                    aria-label={t('sidebar.removeFromSidebar')}
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
                <span
                  className="min-h-11 min-w-11 p-1 rounded hover:bg-secondary text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors"
                  aria-hidden="true"
                  onMouseDown={(e) => e.stopPropagation()}
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
