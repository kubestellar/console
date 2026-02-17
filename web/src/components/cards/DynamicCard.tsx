import { useState, useEffect } from 'react'
import { AlertTriangle, Loader2, Database } from 'lucide-react'
import { STORAGE_KEY_TOKEN } from '../../lib/constants'
import { getDynamicCard } from '../../lib/dynamic-cards/dynamicCardRegistry'
import { compileCardCode, createCardComponent } from '../../lib/dynamic-cards/compiler'
import { Skeleton } from '../ui/Skeleton'
import { Pagination } from '../ui/Pagination'
import { useCardData } from '../../lib/cards/cardHooks'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { cn } from '../../lib/cn'
import type { DynamicCardDefinition, DynamicCardDefinition_T1 } from '../../lib/dynamic-cards/types'
import type { CardComponentProps, CardComponent } from './cardRegistry'
import { useTranslation } from 'react-i18next'

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
  const { t: _t } = useTranslation()
  const dynamicCardId = (config?.dynamicCardId as string) || ''
  const definition = getDynamicCard(dynamicCardId)

  if (!definition) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-8 h-8 text-yellow-400 mb-2" />
        <p className="text-sm text-muted-foreground">
          Dynamic card "{dynamicCardId}" not found.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          The card definition may have been deleted or not loaded yet.
        </p>
      </div>
    )
  }

  return (
    <DynamicCardErrorBoundary cardId={dynamicCardId}>
      {definition.tier === 'tier1' && definition.cardDefinition ? (
        <Tier1CardRuntime definition={definition} cardDefinition={definition.cardDefinition} />
      ) : definition.tier === 'tier2' && definition.sourceCode ? (
        <Tier2CardRuntime definition={definition} config={config} />
      ) : (
        <div className="h-full flex flex-col items-center justify-center p-4 text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-400 mb-2" />
          <p className="text-sm text-muted-foreground">
            Invalid card definition: missing {definition.tier === 'tier1' ? 'card definition' : 'source code'}.
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
  const { t } = useTranslation()
  const [apiData, setApiData] = useState<Record<string, unknown>[]>([])
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const data = cardDefinition.dataSource === 'static'
    ? (cardDefinition.staticData || [])
    : apiData

  // Fetch API data if needed
  useEffect(() => {
    if (cardDefinition.dataSource !== 'api' || !cardDefinition.apiEndpoint) return

    let cancelled = false
    setApiLoading(true)
    setApiError(null)

    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    fetch(cardDefinition.apiEndpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json) => {
        if (cancelled) return
        setApiData(Array.isArray(json) ? json : json.items || json.data || [json])
        setApiLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setApiError(err.message)
        setApiLoading(false)
      })

    return () => { cancelled = true }
  }, [cardDefinition.dataSource, cardDefinition.apiEndpoint])

  // useCardData for search/pagination
  const searchFields = (cardDefinition.searchFields || []) as (keyof Record<string, unknown>)[]
  const {
    items,
    totalItems,
    currentPage,
    totalPages,
    goToPage,
    needsPagination,
    itemsPerPage,
    filters,
  } = useCardData(data, {
    filter: {
      searchFields,
    },
    sort: {
      defaultField: searchFields[0] as string || 'name',
      defaultDirection: 'asc',
      comparators: {},
    },
    defaultLimit: cardDefinition.defaultLimit || 5,
  })

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
        <p className="text-sm text-yellow-400">Failed to fetch data</p>
        <p className="text-xs text-muted-foreground mt-1">{apiError}</p>
      </div>
    )
  }

  const showStats = cardDefinition.layout === 'stats' || cardDefinition.layout === 'stats-and-list'
  const showList = cardDefinition.layout === 'list' || cardDefinition.layout === 'stats-and-list'

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Stats */}
      {showStats && cardDefinition.stats && cardDefinition.stats.length > 0 && (
        <div className={cn(
          'grid gap-2 mb-3',
          cardDefinition.stats.length <= 3 ? `grid-cols-${cardDefinition.stats.length}` : 'grid-cols-4',
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
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
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
            placeholder={t('common.search')}
            className="w-full text-xs px-2.5 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
        </div>
      )}

      {/* List */}
      {showList && (
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Database className="w-6 h-6 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {cardDefinition.emptyMessage || 'No data available.'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {/* Column headers */}
              {cardDefinition.columns && cardDefinition.columns.length > 0 && (
                <div className="flex items-center gap-2 py-1 px-1.5 border-b border-border/50">
                  {cardDefinition.columns.map(col => (
                    <span
                      key={col.field}
                      className="text-[10px] font-medium text-muted-foreground uppercase"
                      style={{ width: col.width, flex: col.width ? 'none' : '1' }}
                    >
                      {col.label}
                    </span>
                  ))}
                </div>
              )}
              {/* Rows */}
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-card/30 transition-colors">
                  {(cardDefinition.columns || []).map(col => {
                    const val = String((item as Record<string, unknown>)[col.field] ?? '-')
                    if (col.format === 'badge') {
                      const badgeColor = col.badgeColors?.[val] || 'bg-gray-500/20 text-gray-400'
                      return (
                        <span
                          key={col.field}
                          className={cn('text-[10px] px-1 py-0.5 rounded shrink-0', badgeColor)}
                          style={{ width: col.width, flex: col.width ? 'none' : undefined }}
                        >
                          {val}
                        </span>
                      )
                    }
                    return (
                      <span
                        key={col.field}
                        className="text-xs text-foreground truncate"
                        style={{ width: col.width, flex: col.width ? 'none' : '1' }}
                      >
                        {val}
                      </span>
                    )
                  })}
                </div>
              ))}
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
  const [CardComponent, setCardComponent] = useState<CardComponent | null>(null)
  const [compiling, setCompiling] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function compile() {
      setCompiling(true)
      setError(null)

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

      setCardComponent(() => componentResult.component)
      setCompiling(false)
    }

    compile()
    return () => { cancelled = true }
  }, [definition.sourceCode, definition.compiledCode])

  if (compiling) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Compiling card...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mb-2" />
        <p className="text-sm text-red-400 font-medium">Compilation Error</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm font-mono break-words">
          {error}
        </p>
      </div>
    )
  }

  if (!CardComponent) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No component produced.</p>
      </div>
    )
  }

  return <CardComponent config={config} />
}
