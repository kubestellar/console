import { AlertTriangle, Database, RefreshCw } from 'lucide-react'
import { getStoredAuthToken } from '../../lib/authToken'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import { Skeleton } from '../ui/Skeleton'
import { Pagination } from '../ui/Pagination'
import { useCardData } from '../../lib/cards/cardHooks'
import { useReportCardDataState } from './CardDataContext'
import { cn } from '../../lib/cn'
import { useCache } from '../../lib/cache'
import type { DynamicCardDefinition, DynamicCardDefinition_T1 } from '../../lib/dynamic-cards/types'
import { useTranslation } from 'react-i18next'

const MAX_AUTO_GRID_COLS = 3
const DEFAULT_DYNAMIC_CARD_EXPANDABLE_COLUMN_WIDTH = 'minmax(0, 1fr)'
const DEFAULT_DYNAMIC_CARD_BADGE_COLUMN_WIDTH = 'fit-content(8rem)'
const DEFAULT_DYNAMIC_CARD_COMPACT_COLUMN_WIDTH = 'fit-content(10rem)'

function getDynamicCardColumnWidth(column: NonNullable<DynamicCardDefinition_T1['columns']>[number]): string {
  const explicitWidth = column.width?.trim()
  if (explicitWidth) return explicitWidth

  switch (column.format) {
    case 'badge':
      return DEFAULT_DYNAMIC_CARD_BADGE_COLUMN_WIDTH
    case 'number':
    case 'date':
      return DEFAULT_DYNAMIC_CARD_COMPACT_COLUMN_WIDTH
    default:
      return DEFAULT_DYNAMIC_CARD_EXPANDABLE_COLUMN_WIDTH
  }
}

function buildDynamicCardColumnTemplate(columns: DynamicCardDefinition_T1['columns'] | undefined): string | undefined {
  if (!columns || columns.length === 0) return undefined

  return columns
    .map(getDynamicCardColumnWidth)
    .join(' ')
}

// ============================================================================
// Tier 1: Declarative Card Runtime
// ============================================================================

export interface Tier1Props {
  definition: DynamicCardDefinition
  cardDefinition: DynamicCardDefinition_T1
}

export function Tier1CardRuntime({ cardDefinition }: Tier1Props) {
  const { t } = useTranslation(['cards', 'common'])

  // Compute validation flags up front (before hooks) to keep hook call order stable (#4910)
  const isInvalidConfig = !cardDefinition || typeof cardDefinition !== 'object'
  const isMissingEndpoint = !isInvalidConfig && cardDefinition?.dataSource === 'api' && !cardDefinition?.apiEndpoint

  const isApiSource = !isInvalidConfig && cardDefinition?.dataSource === 'api'
  const apiEndpoint = cardDefinition?.apiEndpoint || ''

  // #16506: Restrict apiEndpoint to same-origin URLs only to prevent
  // session token exfiltration to attacker-controlled servers.
  const isSafeEndpoint = (() => {
    if (!apiEndpoint) return false
    // Root-relative paths (e.g. "/api/...") are safe, but protocol-relative
    // URLs ("//evil.com") must be rejected because the browser resolves them
    // to an external origin.
    if (apiEndpoint.startsWith('/')) return !apiEndpoint.startsWith('//')
    // Absolute URLs must match current origin
    try {
      const parsed = new URL(apiEndpoint)
      return parsed.origin === window.location.origin
    } catch {
      return false
    }
  })()

  // API data via useCache (persists across navigation, SWR pattern, demo fallback)
  const {
    data: apiData,
    isLoading: apiLoading,
    isRefreshing: apiRefreshing,
    isFailed: apiFailed,
    isDemoFallback,
    error: apiError,
    consecutiveFailures,
  } = useCache<Record<string, unknown>[]>({
    key: `dynamic-card-api-${apiEndpoint}`,
    initialData: [],
    demoData: [{ id: 'demo-1', name: 'Demo Item', status: 'active' }],
    persist: true,
    enabled: isApiSource && !isInvalidConfig && !isMissingEndpoint && !!apiEndpoint && isSafeEndpoint,
    fetcher: async () => {
      const token = await getStoredAuthToken()
      const res = await fetch(apiEndpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return Array.isArray(json) ? json : (json.items || json.data || [json])
    },
  })

  const data = isInvalidConfig
    ? []
    : (cardDefinition?.dataSource === 'static'
        ? (cardDefinition?.staticData || [])
        : apiData)

  // Report loading state to CardWrapper so header stays in sync with body (#5208)
  useReportCardDataState({
    isFailed: apiFailed,
    consecutiveFailures,
    errorMessage: apiError ?? undefined,
    isLoading: isApiSource ? apiLoading : false,
    isRefreshing: isApiSource ? apiRefreshing : false,
    hasData: isApiSource ? apiData.length > 0 : true,
    isDemoData: isDemoFallback && !apiLoading,
  })

  // useCardData for search/pagination — guard against undefined cardDefinition
  const searchFields = ((cardDefinition?.searchFields || []) as (keyof Record<string, unknown>)[])
  const defaultSortField = searchFields.length > 0 ? (searchFields[0] as string) : 'name'
  const {
    items,
    totalItems,
    currentPage,
    totalPages,
    goToPage,
    needsPagination,
    itemsPerPage,
    filters,
    containerRef,
    containerStyle,
  } = useCardData(data ?? [], {
    filter: {
      searchFields,
    },
    sort: {
      defaultField: defaultSortField,
      defaultDirection: 'asc' as const,
      comparators: {},
    },
    defaultLimit: cardDefinition?.defaultLimit ?? 5,
  })

  // Validation-based early returns — placed after all hooks to respect Rules of Hooks (#4910)
  if (isInvalidConfig) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-6 h-6 text-yellow-400 mb-2" />
        <p className="text-sm text-yellow-400">{t('dynamicCard.invalidCardConfig')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('dynamicCard.invalidCardConfigHint')}</p>
      </div>
    )
  }

  if (isMissingEndpoint) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-6 h-6 text-yellow-400 mb-2" />
        <p className="text-sm text-yellow-400">{t('dynamicCard.missingEndpoint')}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('dynamicCard.missingEndpointHint')}
        </p>
      </div>
    )
  }

  if (apiLoading) {
    return (
      <div className="space-y-3 p-2">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  if (apiError) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-6 h-6 text-yellow-400 mb-2" />
        <p className="text-sm text-yellow-400">{t('dynamicCard.fetchFailed')}</p>
        <p className="text-xs text-muted-foreground mt-1">{apiError}</p>
      </div>
    )
  }

  const showStats = cardDefinition.layout === 'stats' || cardDefinition.layout === 'stats-and-list'
  const showList = cardDefinition.layout === 'list' || cardDefinition.layout === 'stats-and-list'
  const columnTemplate = buildDynamicCardColumnTemplate(cardDefinition.columns)
  const columnLayoutStyle = columnTemplate ? { gridTemplateColumns: columnTemplate } : undefined

  return (
    <div className="h-full flex flex-col min-h-card">
      {isApiSource && apiRefreshing && (
        <div className="flex justify-end mb-1">
          <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />
        </div>
      )}
      {/* Stats */}
      {showStats && cardDefinition.stats && cardDefinition.stats.length > 0 && (
        <div className={cn(
          'grid gap-2 mb-3',
          cardDefinition.stats.length <= MAX_AUTO_GRID_COLS ? `grid-cols-${cardDefinition.stats.length}` : 'grid-cols-4',
        )}>
          {cardDefinition.stats.map((stat, idx) => {
            // Resolve stat value from data
            let value: string | number = stat.value
            if (stat.value.startsWith('count:')) {
              value = data.length
            } else if (stat.value.startsWith('field:') && data.length > 0) {
              const field = stat.value.replace('field:', '')
              value = String(data[0]?.[field] ?? '-')
            }

            return (
              <div key={idx} className="rounded-md bg-card/50 border border-border p-2 text-center">
                <p className={cn('text-lg font-semibold', stat.color || 'text-foreground')}>
                  {value}
                </p>
                <p className="text-2xs text-muted-foreground">{stat.label}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Search */}
      {showList && (
        <div className="mb-2">
          {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from DynamicCard.tsx (pre-existing baselined violation) */}
          <input
            type="text"
            value={filters.search}
            onChange={(e) => filters.setSearch(e.target.value)}
            placeholder={t('common:common.search')}
            className="w-full text-xs px-2.5 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
          />
        </div>
      )}

      {/* List */}
      {showList && (
        <div ref={containerRef} className="flex-1 overflow-y-auto" style={containerStyle}>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Database className="w-6 h-6 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {cardDefinition.emptyMessage || t('dynamicCard.noDataAvailable')}
              </p>
            </div>
          ) : (
            <div
              className="grid items-center gap-x-2 gap-y-0.5"
              style={columnLayoutStyle}
              data-testid="dynamic-card-list-grid"
            >
              {/* Column headers */}
              {(cardDefinition.columns || []).map(col => (
                <span
                  key={`header-${col.field}`}
                  className="min-w-0 border-b border-border/50 px-1.5 py-1 text-2xs font-medium text-muted-foreground uppercase truncate"
                >
                  {col.label}
                </span>
              ))}
              {/* Rows */}
              {items.flatMap((item, idx) =>
                (cardDefinition.columns || []).map(col => {
                  const val = String((item as Record<string, unknown>)[col.field] ?? '-')
                  const cellKey = `${idx}-${col.field}`
                  if (col.format === 'badge') {
                    // Semantic badge color — adapts to both light and dark themes.
                    const badgeColor = col.badgeColors?.[val] || 'bg-muted text-muted-foreground'
                    return (
                      <div
                        key={cellKey}
                        className="min-w-0 px-1.5 py-1"
                        data-testid={idx === 0 ? 'dynamic-card-data-row' : undefined}
                      >
                        <span
                          className={cn(
                            'inline-flex max-w-full justify-self-start overflow-hidden text-ellipsis whitespace-nowrap rounded px-1 py-0.5 text-2xs',
                            badgeColor,
                          )}
                        >
                          {val}
                        </span>
                      </div>
                    )
                  }
                  return (
                    <span
                      key={cellKey}
                      className="min-w-0 px-1.5 py-1 truncate text-xs text-foreground"
                      data-testid={idx === 0 ? 'dynamic-card-data-row' : undefined}
                    >
                      {val}
                    </span>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {needsPagination && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
            onPageChange={goToPage}
          />
        </div>
      )}
    </div>
  )
}
