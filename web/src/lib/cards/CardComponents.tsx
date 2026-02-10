import { ReactNode, useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { LucideIcon, CheckCircle, AlertTriangle, Info, Search, Filter, ChevronDown, ChevronRight, Server, Stethoscope, Wrench } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../components/cards/console-missions/shared'
import { Skeleton } from '../../components/ui/Skeleton'
import { Pagination } from '../../components/ui/Pagination'
import { CardControls as CardControlsUI, type SortDirection } from '../../components/ui/CardControls'
import { ClusterStatusDot, getClusterState, type ClusterState } from '../../components/ui/ClusterStatusBadge'
import type { ClusterWithHealth } from './cardHooks'

// ============================================================================
// CardSkeleton - Loading state for cards
// ============================================================================

export interface CardSkeletonProps {
  /** Number of skeleton rows to show */
  rows?: number
  /** Type of skeleton layout */
  type?: 'table' | 'list' | 'chart' | 'status' | 'metric'
  /** Show header skeleton */
  showHeader?: boolean
  /** Show search skeleton */
  showSearch?: boolean
  /** Custom row height in pixels (overrides type-based default) */
  rowHeight?: number
}

export function CardSkeleton({
  rows = 3,
  type = 'list',
  showHeader = true,
  showSearch = false,
  rowHeight,
}: CardSkeletonProps) {
  const defaultHeight = type === 'table' ? 48 : type === 'metric' ? 80 : 80
  const height = rowHeight ?? defaultHeight

  return (
    <div className="h-full flex flex-col min-h-card">
      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <Skeleton variant="text" width={80} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
      )}
      {showSearch && (
        <Skeleton variant="rounded" height={32} className="mb-3" />
      )}
      {type === 'metric' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="glass p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Skeleton variant="circular" width={20} height={20} />
                <Skeleton variant="text" width={80} height={16} />
              </div>
              <Skeleton variant="text" width={60} height={36} className="mb-1" />
              <Skeleton variant="text" width={100} height={12} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {type === 'chart' ? (
            <Skeleton variant="rounded" height={200} />
          ) : (
            Array.from({ length: rows }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rounded"
                height={height}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CardEmptyState - Empty state with icon and message
// ============================================================================

export interface CardEmptyStateProps {
  /** Icon to display */
  icon?: LucideIcon
  /** Main title */
  title: string
  /** Secondary message */
  message?: string
  /** Variant determines color scheme */
  variant?: 'success' | 'info' | 'warning' | 'neutral'
  /** Optional action button */
  action?: {
    label: string
    onClick: () => void
  }
}

const emptyStateVariants = {
  success: {
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
    icon: CheckCircle,
  },
  info: {
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    icon: Info,
  },
  warning: {
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
    icon: AlertTriangle,
  },
  neutral: {
    iconBg: 'bg-secondary',
    iconColor: 'text-muted-foreground',
    icon: Info,
  },
}

export function CardEmptyState({
  icon,
  title,
  message,
  variant = 'neutral',
  action,
}: CardEmptyStateProps) {
  const variantConfig = emptyStateVariants[variant]
  const Icon = icon || variantConfig.icon

  return (
    <div className="h-full flex flex-col content-loaded">
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <div
          className={`w-12 h-12 rounded-full ${variantConfig.iconBg} flex items-center justify-center mb-3`}
          title={title}
        >
          <Icon className={`w-6 h-6 ${variantConfig.iconColor}`} />
        </div>
        <p className="text-foreground font-medium">{title}</p>
        {message && (
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="mt-3 px-3 py-1.5 text-sm rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CardErrorState - Error state with retry option
// ============================================================================

export interface CardErrorStateProps {
  /** Error message */
  error: string
  /** Retry callback */
  onRetry?: () => void
  /** Whether retry is in progress */
  isRetrying?: boolean
}

export function CardErrorState({ error, onRetry, isRetrying }: CardErrorStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-4">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
        <AlertTriangle className="w-6 h-6 text-red-400" />
      </div>
      <p className="text-foreground font-medium">Error loading data</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-3 px-3 py-1.5 text-sm rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {isRetrying ? 'Retrying...' : 'Try again'}
        </button>
      )}
    </div>
  )
}

// ============================================================================
// CardSearchInput - Reusable search input
// ============================================================================

export interface CardSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Debounce delay in ms. When set, onChange fires after the user stops typing. */
  debounceMs?: number
}

export function CardSearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  debounceMs,
}: CardSearchInputProps) {
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = useCallback((newValue: string) => {
    setLocalValue(newValue)
    if (debounceMs && debounceMs > 0) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onChange(newValue), debounceMs)
    } else {
      onChange(newValue)
    }
  }, [onChange, debounceMs])

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), [])

  return (
    <div className={`relative mb-4 ${className}`}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <input
        type="text"
        value={debounceMs ? localValue : value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
      />
    </div>
  )
}

// ============================================================================
// CardClusterFilter - Reusable cluster filter dropdown
// ============================================================================

export interface CardClusterFilterProps {
  /** Available clusters to filter (includes health info for status indicators) */
  availableClusters: ClusterWithHealth[]
  /** Currently selected clusters */
  selectedClusters: string[]
  /** Toggle cluster selection */
  onToggle: (cluster: string) => void
  /** Clear all selections */
  onClear: () => void
  /** Whether dropdown is visible */
  isOpen: boolean
  /** Set dropdown visibility */
  setIsOpen: (open: boolean) => void
  /** Ref for click outside handling */
  containerRef: React.RefObject<HTMLDivElement>
  /** Minimum number of clusters required to show filter (default: 2) */
  minClusters?: number
}

export function CardClusterFilter({
  availableClusters,
  selectedClusters,
  onToggle,
  onClear,
  isOpen,
  setIsOpen,
  containerRef,
  minClusters = 2,
}: CardClusterFilterProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 192),
      })
    } else {
      setDropdownPos(null)
    }
  }, [isOpen])

  if (availableClusters.length < minClusters) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
          selectedClusters.length > 0
            ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
        }`}
        title="Filter by cluster"
      >
        <Filter className="w-3 h-3" />
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && dropdownPos && createPortal(
        <div
          className="fixed w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="p-1">
            <button
              onClick={onClear}
              className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                selectedClusters.length === 0
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'hover:bg-secondary text-foreground'
              }`}
            >
              All clusters
            </button>
            {availableClusters.map((cluster) => {
              // Determine cluster state for status indicator
              const clusterState: ClusterState = cluster.healthy !== undefined || cluster.reachable !== undefined
                ? getClusterState(
                    cluster.healthy ?? true,
                    cluster.reachable,
                    cluster.nodeCount,
                    undefined,
                    cluster.errorType
                  )
                : 'healthy'

              const isUnreachable = cluster.reachable === false

              // Get status label for tooltip
              const stateLabel = clusterState === 'healthy' ? '' :
                clusterState === 'degraded' ? 'degraded' :
                clusterState === 'unreachable-auth' ? 'needs auth' :
                clusterState === 'unreachable-timeout' ? 'offline' :
                clusterState.startsWith('unreachable') ? 'offline' : ''

              return (
                <button
                  key={cluster.name}
                  onClick={() => !isUnreachable && onToggle(cluster.name)}
                  disabled={isUnreachable}
                  className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors flex items-center gap-2 ${
                    isUnreachable
                      ? 'opacity-40 cursor-not-allowed'
                      : selectedClusters.includes(cluster.name)
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'hover:bg-secondary text-foreground'
                  }`}
                  title={stateLabel ? `${cluster.name} (${stateLabel})` : cluster.name}
                >
                  <ClusterStatusDot state={clusterState} size="sm" />
                  <span className="flex-1 truncate">{cluster.name}</span>
                  {stateLabel && (
                    <span className="text-[10px] text-muted-foreground shrink-0">{stateLabel}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ============================================================================
// useDropdownPortal - Shared hook for portaling dropdowns out of overflow
// ============================================================================

const DROPDOWN_WIDTH = 192 // w-48 = 12rem = 192px
const DROPDOWN_GAP = 4

/**
 * Hook that computes fixed positioning for a dropdown rendered via createPortal.
 * Attach `triggerRef` to the button that opens the dropdown.
 * When `isOpen` is true, `style` will contain { top, left } for the portal div.
 */
export function useDropdownPortal(isOpen: boolean) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [style, setStyle] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setStyle({
        top: rect.bottom + DROPDOWN_GAP,
        left: Math.max(8, rect.right - DROPDOWN_WIDTH),
      })
    } else {
      setStyle(null)
    }
  }, [isOpen])

  return { triggerRef, style }
}

// ============================================================================
// CardClusterIndicator - Shows current cluster filter state
// ============================================================================

export interface CardClusterIndicatorProps {
  selectedCount: number
  totalCount: number
}

export function CardClusterIndicator({ selectedCount, totalCount }: CardClusterIndicatorProps) {
  if (selectedCount === 0) return null

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
      <Server className="w-3 h-3" />
      {selectedCount}/{totalCount}
    </span>
  )
}

// ============================================================================
// CardListItem - Generic clickable list item
// ============================================================================

export interface CardListItemProps {
  onClick?: () => void
  /** Background color variant */
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  /** Custom background class */
  bgClass?: string
  /** Custom border class */
  borderClass?: string
  /** Show chevron on hover */
  showChevron?: boolean
  /** Children content */
  children: ReactNode
  /** Tooltip */
  title?: string
  /** Data attribute for tour */
  dataTour?: string
}

const listItemVariants = {
  default: { bg: 'bg-secondary/30', border: 'border-border/50' },
  success: { bg: 'bg-green-500/20', border: 'border-green-500/20' },
  warning: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/20' },
  error: { bg: 'bg-red-500/20', border: 'border-red-500/20' },
  info: { bg: 'bg-blue-500/20', border: 'border-blue-500/20' },
}

export function CardListItem({
  onClick,
  variant = 'default',
  bgClass,
  borderClass,
  showChevron = true,
  children,
  title,
  dataTour,
}: CardListItemProps) {
  const variantConfig = listItemVariants[variant]
  const bg = bgClass || variantConfig.bg
  const border = borderClass || variantConfig.border

  return (
    <div
      data-tour={dataTour}
      className={`p-3 rounded-lg ${bg} border ${border} ${
        onClick ? 'cursor-pointer hover:opacity-80' : ''
      } transition-all group`}
      onClick={onClick}
      title={title}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">{children}</div>
        {showChevron && onClick && (
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-center" />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CardHeader - Standard card header with title and controls
// ============================================================================

export interface CardHeaderProps {
  /** Card title */
  title: string
  /** Count badge */
  count?: number
  /** Count badge color variant */
  countVariant?: 'default' | 'success' | 'warning' | 'error'
  /** Extra content after title */
  extra?: ReactNode
  /** Right-side controls */
  controls?: ReactNode
}

const countVariants = {
  default: 'bg-secondary text-muted-foreground',
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  error: 'bg-red-500/20 text-red-400',
}

export function CardHeader({
  title,
  count,
  countVariant = 'default',
  extra,
  controls,
}: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        {count !== undefined && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${countVariants[countVariant]}`}
            title={`${count} items`}
          >
            {count}
          </span>
        )}
        {extra}
      </div>
      {controls && <div className="flex items-center gap-2">{controls}</div>}
    </div>
  )
}

// ============================================================================
// CardStatusBadge - Status indicator badge
// ============================================================================

export interface CardStatusBadgeProps {
  status: string
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  size?: 'sm' | 'md'
}

const statusBadgeVariants = {
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  error: 'bg-red-500/20 text-red-400',
  info: 'bg-blue-500/20 text-blue-400',
  neutral: 'bg-secondary text-muted-foreground',
}

export function CardStatusBadge({
  status,
  variant = 'neutral',
  size = 'sm',
}: CardStatusBadgeProps) {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'

  return (
    <span
      className={`rounded ${statusBadgeVariants[variant]} ${sizeClasses}`}
      title={`Status: ${status}`}
    >
      {status}
    </span>
  )
}

// ============================================================================
// CardFilterChips - Status/category filter chips
// ============================================================================

export interface FilterChip {
  id: string
  label: string
  count?: number
  icon?: LucideIcon
  color?: string
}

export interface CardFilterChipsProps {
  chips: FilterChip[]
  activeChip: string
  onChipClick: (id: string) => void
}

export function CardFilterChips({ chips, activeChip, onChipClick }: CardFilterChipsProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
      {chips.map((chip) => {
        const isActive = activeChip === chip.id
        const Icon = chip.icon

        return (
          <button
            key={chip.id}
            onClick={() => onChipClick(chip.id)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${
              isActive
                ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {Icon && <Icon className={`w-3 h-3 ${isActive && chip.color ? chip.color : ''}`} />}
            <span className="capitalize">{chip.label}</span>
            {chip.count !== undefined && (
              <span
                className={`px-1 rounded text-[10px] ${
                  isActive ? 'bg-purple-500/30' : 'bg-secondary'
                }`}
              >
                {chip.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// CardControlsRow - Composition component for standard card controls
// ============================================================================

export interface CardControlsRowProps {
  /** Cluster filter config (from useCardData or useCardFilters) */
  clusterFilter?: {
    availableClusters: { name: string }[]
    selectedClusters: string[]
    onToggle: (cluster: string) => void
    onClear: () => void
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    containerRef: React.RefObject<HTMLDivElement>
    minClusters?: number
  }
  /** Cluster indicator showing selected/total count */
  clusterIndicator?: {
    selectedCount: number
    totalCount: number
  }
  /** Sort & limit controls */
  cardControls?: {
    limit: number | 'unlimited'
    onLimitChange: (limit: number | 'unlimited') => void
    sortBy: string
    sortOptions: { value: string; label: string }[]
    onSortChange: (sortBy: string) => void
    sortDirection: SortDirection
    onSortDirectionChange: (dir: SortDirection) => void
  }
  /** Extra content to render at the end */
  extra?: ReactNode
  className?: string
}

/**
 * Composition component assembling the standard controls row:
 * [ClusterIndicator] [ClusterFilter] [CardControls] [Extra]
 *
 * Refresh is handled by CardWrapper's title bar — do NOT add a refresh
 * button here to avoid duplication.
 *
 * All sections are optional — only renders what's provided.
 */
export function CardControlsRow({
  clusterFilter,
  clusterIndicator,
  cardControls,
  extra,
  className = '',
}: CardControlsRowProps) {
  return (
    <div className={`flex items-center gap-2 mb-3 ${className}`}>
      {clusterIndicator && (
        <CardClusterIndicator
          selectedCount={clusterIndicator.selectedCount}
          totalCount={clusterIndicator.totalCount}
        />
      )}
      {clusterFilter && (
        <CardClusterFilter
          availableClusters={clusterFilter.availableClusters}
          selectedClusters={clusterFilter.selectedClusters}
          onToggle={clusterFilter.onToggle}
          onClear={clusterFilter.onClear}
          isOpen={clusterFilter.isOpen}
          setIsOpen={clusterFilter.setIsOpen}
          containerRef={clusterFilter.containerRef}
          minClusters={clusterFilter.minClusters}
        />
      )}
      {cardControls && (
        <CardControlsUI
          limit={cardControls.limit}
          onLimitChange={cardControls.onLimitChange}
          sortBy={cardControls.sortBy}
          sortOptions={cardControls.sortOptions}
          onSortChange={cardControls.onSortChange}
          sortDirection={cardControls.sortDirection}
          onSortDirectionChange={cardControls.onSortDirectionChange}
        />
      )}
      {extra}
    </div>
  )
}

// ============================================================================
// CardPaginationFooter - Standardized pagination footer
// ============================================================================

export interface CardPaginationFooterProps {
  /** Current page (1-indexed) */
  currentPage: number
  /** Total number of pages */
  totalPages: number
  /** Total number of items across all pages */
  totalItems: number
  /** Items per page */
  itemsPerPage: number
  /** Page change callback */
  onPageChange: (page: number) => void
  /** Whether pagination is needed (hide when all items fit on one page) */
  needsPagination: boolean
}

/**
 * Standardized pagination footer with consistent separator styling.
 * Only renders when needsPagination is true.
 */
export function CardPaginationFooter({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  needsPagination,
}: CardPaginationFooterProps) {
  if (!needsPagination) return null

  return (
    <div className="pt-2 mt-2 border-t border-border/50">
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onPageChange={onPageChange}
      />
    </div>
  )
}

// ============================================================================
// CardAIActions - Unified Diagnose and Repair icon buttons that open the AI
// missions sidebar.
// Renders compact icon-only buttons consistent across all cards.
// ============================================================================

export interface CardAIResource {
  kind: string
  name: string
  namespace?: string
  cluster?: string
  status?: string
}

export interface CardAIActionsProps {
  /** Resource context for prompt generation */
  resource: CardAIResource
  /** Specific issues to include in AI prompts */
  issues?: Array<{ name: string; message: string }>
  /** Additional context passed to the AI agent */
  additionalContext?: Record<string, unknown>
  /** CSS class for the container */
  className?: string
  /** Whether to show the repair button (default: true) */
  showRepair?: boolean
  /** Custom tooltip for the repair button (default: "Repair") */
  repairLabel?: string
  /** Override the default diagnose prompt */
  diagnosePrompt?: string
  /** Override the default repair prompt */
  repairPrompt?: string
  /** Custom diagnose handler (bypasses startMission) */
  onDiagnose?: (e: React.MouseEvent) => void
  /** Custom repair handler (bypasses startMission) */
  onRepair?: (e: React.MouseEvent) => void
}

/**
 * Unified AI action buttons for cards. Renders compact icon-only Diagnose and
 * Repair buttons that open the AI missions sidebar with contextual prompts.
 *
 * Stops event propagation so parent onClick (drill-down) is not triggered.
 * Parent element should have `group` class for hover reveal.
 */
export function CardAIActions({
  resource,
  issues = [],
  additionalContext,
  className = '',
  showRepair = true,
  repairLabel = 'Repair',
  diagnosePrompt,
  repairPrompt,
  onDiagnose,
  onRepair,
}: CardAIActionsProps) {
  const { startMission } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  const { kind, name, namespace, cluster, status } = resource
  const loc = namespace ? ` in namespace "${namespace}"` : ''
  const on = cluster ? ` on cluster "${cluster}"` : ''
  const issuesList = issues.map(i => `- ${i.name}: ${i.message}`).join('\n')
  const hasIssues = issues.length > 0

  const handleDiagnose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDiagnose) { onDiagnose(e); return }
    checkKeyAndRun(() => {
      startMission({
        title: `Diagnose ${name}`,
        description: `Analyze ${kind} health and identify issues`,
        type: 'troubleshoot',
        cluster,
        initialPrompt: diagnosePrompt || `Analyze the health of ${kind} "${name}"${loc}${on}.

Current status: ${status || 'Unknown'}${hasIssues ? `\n\nKnown issues:\n${issuesList}` : ''}

Please provide:
1. Health assessment summary
2. Root cause analysis for any issues
3. Recommended actions to resolve`,
        context: { kind, name, namespace, cluster, status, issues, ...additionalContext },
      })
    })
  }, [checkKeyAndRun, startMission, kind, name, namespace, cluster, status, issues, hasIssues, issuesList, loc, on, additionalContext, onDiagnose, diagnosePrompt])

  const handleRepair = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (onRepair) { onRepair(e); return }
    checkKeyAndRun(() => {
      startMission({
        title: `${repairLabel} ${name}`,
        description: `Fix issues with ${kind}`,
        type: 'repair',
        cluster,
        initialPrompt: repairPrompt || `I need help repairing issues with ${kind} "${name}"${loc}${on}.

Issues to fix:
${hasIssues ? issuesList : 'No specific issues identified - please diagnose first'}

For each issue, please:
1. Diagnose the root cause
2. Suggest a fix with the exact kubectl commands
3. Explain potential side effects
4. Apply fixes step by step with my confirmation`,
        context: { kind, name, namespace, cluster, status, issues, ...additionalContext },
      })
    })
  }, [checkKeyAndRun, startMission, kind, name, namespace, cluster, status, issues, hasIssues, issuesList, loc, on, additionalContext, onRepair, repairPrompt, repairLabel])

  return (
    <div
      className={`flex items-center gap-0.5 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={handleDiagnose}
        className="p-1 rounded text-muted-foreground hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
        title={`Diagnose ${name}`}
      >
        <Stethoscope className="w-3.5 h-3.5" />
      </button>

      {showRepair && (
        <button
          onClick={handleRepair}
          className="p-1 rounded text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
          title={`${repairLabel} ${name}`}
        >
          <Wrench className="w-3.5 h-3.5" />
        </button>
      )}

      {showKeyPrompt && (
        <ApiKeyPromptModal
          isOpen={showKeyPrompt}
          onDismiss={dismissPrompt}
          onGoToSettings={goToSettings}
        />
      )}
    </div>
  )
}
