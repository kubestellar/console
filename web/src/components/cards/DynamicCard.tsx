import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Loader2, Database } from 'lucide-react'
import { STORAGE_KEY_TOKEN } from '../../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import { getDynamicCard } from '../../lib/dynamic-cards/dynamicCardRegistry'
import { compileCardCode, createCardComponent } from '../../lib/dynamic-cards/compiler'
import { Skeleton } from '../ui/Skeleton'
import { Pagination } from '../ui/Pagination'
import { useCardData } from '../../lib/cards/cardHooks'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useCardDemoState, useReportCardDataState } from './CardDataContext'
import { cn } from '../../lib/cn'
import { useCache } from '../../lib/cache'
import type { DynamicCardDefinition, DynamicCardDefinition_T1 } from '../../lib/dynamic-cards/types'
import type { CardComponentProps, CardComponent } from './cardRegistry'
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

/**
 * DynamicCard: Meta-component that renders dynamic card definitions.
 *
 * - For Tier 1 (declarative): Renders using built-in card runtime
 * - For Tier 2 (custom code): Compiles TSX and renders the result
 *
 * Registered as `dynamic_card` in CARD_COMPONENTS.
 * config.dynamicCardId determines which definition to render.
 */
export function DynamicCard({ config }: CardComponentProps) {
  const { t } = useTranslation('cards')
  // Guard against undefined/null config to prevent crashes (#4910)
  const safeConfig = config ?? {}
  const dynamicCardId = (typeof safeConfig.dynamicCardId === 'string' ? safeConfig.dynamicCardId : '') || ''
  const definition = getDynamicCard(dynamicCardId)

  // Report demo state: dynamic cards depend on the agent for live API data.
  //
  // #9058 — Always include `hasData: true` in this report. Previously this
  // call reported `{ isDemoData, isFailed, consecutiveFailures }` without
  // `hasData`, leaving `hasData` as `undefined` (falsy). Because
  // `useReportCardDataState` uses `useLayoutEffect` and parent layout
  // effects fire AFTER children's, the meta-component's report runs LAST
  // and overwrote the `hasData: true` that `Tier1CardRuntime` /
  // `Tier2CardRuntime` had reported. CardWrapper then saw
  // `!childDataState.hasData` for a rendered card and painted its generic
  // "No data available" empty-state overlay (with a Retry button) on top
  // of a perfectly valid custom card with valid inline/static data.
  //
  // Reporting `hasData: true` here is correct for BOTH branches:
  //  - Error shell states below (missing id / missing definition /
  //    invalid tier definition): the shell IS the rendered content, so
  //    we tell CardWrapper not to paint its generic empty state over it.
  //  - Tier runtime branch: the card's content (data rows, internal
  //    empty-state message, or internal skeleton) IS the rendered
  //    content, and the runtime handles its own internal loading/empty/
  //    error UI.
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })
  useReportCardDataState({
    isDemoData: shouldUseDemoData,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    hasData: true,
  })

  if (!dynamicCardId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-8 h-8 text-yellow-400 mb-2" />
        <p className="text-sm text-muted-foreground">
          {t('dynamicCard.missingConfig')}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {t('dynamicCard.noDynamicCardId')}
        </p>
      </div>
    )
  }

  if (!definition) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-8 h-8 text-yellow-400 mb-2" />
        <p className="text-sm text-muted-foreground">
          {t('dynamicCard.notFound', { id: dynamicCardId })}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {t('dynamicCard.notFoundHint')}
        </p>
      </div>
    )
  }

  return (
    <DynamicCardErrorBoundary cardId={dynamicCardId}>
      {definition.tier === 'tier1' && definition.cardDefinition ? (
        <Tier1CardRuntime definition={definition} cardDefinition={definition.cardDefinition} />
      ) : definition.tier === 'tier2' && definition.sourceCode ? (
        <Tier2CardRuntime definition={definition} config={safeConfig} />
      ) : (
        <div className="h-full flex flex-col items-center justify-center p-4 text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-400 mb-2" />
          <p className="text-sm text-muted-foreground">
            {t('dynamicCard.invalidDefinition', { missing: definition.tier === 'tier1' ? t('dynamicCard.cardDefinition') : t('dynamicCard.sourceCode') })}
          </p>
        </div>
      )}
    </DynamicCardErrorBoundary>
  )
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
    enabled: isApiSource && !isInvalidConfig && !isMissingEndpoint && !!apiEndpoint,
    fetcher: async () => {
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
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

// ============================================================================
// Tier 2: Custom Code Runtime
// ============================================================================

export interface Tier2Props {
  definition: DynamicCardDefinition
  config?: Record<string, unknown>
}

export function Tier2CardRuntime({ definition, config }: Tier2Props) {
  const { t } = useTranslation('cards')
  // Guard against undefined config (#4910)
  const safeConfig = config ?? {}
  const [CardComponent, setCardComponent] = useState<CardComponent | null>(null)
  const [compiling, setCompiling] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | undefined>(undefined)

  // Report internal loading/error state to CardWrapper so header stays in sync (#5208)
  useReportCardDataState({
    isFailed: !!error,
    consecutiveFailures: error ? 1 : 0,
    errorMessage: error ?? undefined,
    isLoading: compiling,
    isRefreshing: false,
    hasData: !!CardComponent,
    isDemoData: false,
  })

  useEffect(() => {
    let cancelled = false

    async function compile() {
      setCompiling(true)
      setError(null)

      try {
        const source = definition.sourceCode
        if (!source) {
          setError('No source code provided.')
          setCompiling(false)
          return
        }

        // Check for cached compiled code
        let code = definition.compiledCode
        if (!code) {
          const result = await compileCardCode(source)
          if (cancelled) return
          if (result.error) {
            setError(result.error)
            setCompiling(false)
            return
          }
          code = result.code!
        }

        // Create component from compiled code
        const componentResult = createCardComponent(code)
        if (cancelled) return

        if (componentResult.error) {
          setError(componentResult.error)
          setCompiling(false)
          return
        }

        cleanupRef.current = componentResult.cleanup
        setCardComponent(() => componentResult.component)
        setCompiling(false)
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        // Message is already surfaced to the user via setError below (#8816)
        setError(`Unexpected error: ${message}`)
        setCompiling(false)
      }
    }

    compile()
    return () => {
      cancelled = true
      // Clean up any timers the card created
      cleanupRef.current?.()
    }
  }, [definition.sourceCode, definition.compiledCode])

  if (compiling) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">{t('dynamicCard.compiling')}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mb-2" />
        <p className="text-sm text-red-400 font-medium">{t('dynamicCard.compilationError')}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm font-mono wrap-break-word">
          {error}
        </p>
      </div>
    )
  }

  if (!CardComponent) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('dynamicCard.noComponent')}</p>
      </div>
    )
  }

  return <CardComponent config={safeConfig} />
}
