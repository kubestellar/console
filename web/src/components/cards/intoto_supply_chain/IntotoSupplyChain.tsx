/**
 * in-toto Supply Chain card — live data from useIntoto hook.
 *
 * Detects in-toto installation per cluster via CRD check, then fetches
 * layouts and link metadata. Falls back to demo data when not installed.
 * Offers AI mission install link in demo/uninstalled state.
 */

import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  AlertCircle,
  ShieldCheck,
  Link2,
  Loader2,
} from 'lucide-react'
import { ProgressRing } from '../../ui/ProgressRing'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useCardLoadingState } from '../CardDataContext'
import { useTranslation } from 'react-i18next'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { useIntoto } from '../../../hooks/useIntoto'
import { useMissions } from '../../../hooks/useMissions'
import { StatusBadge } from '../../ui/StatusBadge'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { CardControls } from '../../ui/CardControls'
import { Pagination } from '../../ui/Pagination'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { DEFAULT_PAGE_SIZE } from '../../../lib/constants/ui'
import type { IntotoLayout } from '../../../hooks/useIntoto'
import { IntotoLayoutRow } from './IntotoLayoutRow'
import { IntotoSupplyChainFooter } from './IntotoSupplyChainFooter'
import { INTOTO_INSTALL_PROMPT, INTOTO_SAMPLE_LAYOUTS_PROMPT } from './IntotoSupplyChain.prompts'

type SortField = 'name' | 'failedSteps' | 'verifiedSteps'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'failedSteps', label: 'Failed' },
  { value: 'verifiedSteps', label: 'Verified' },
]

interface IntotoSupplyChainProps {
  config?: Record<string, unknown>
}

function IntotoSupplyChainInternal({ config: _config }: IntotoSupplyChainProps) {
  const { t } = useTranslation(['cards', 'common'])
  const {
    statuses,
    isLoading,
    isRefreshing,
    lastRefresh,
    installed,
    hasErrors,
    isDemoData,
    isFailed,
    consecutiveFailures,
    clustersChecked,
    totalClusters,
  } = useIntoto()
  const { startMission } = useMissions()
  const [expandedLayout, setExpandedLayout] = useState<string | null>(null)

  // Flat list of all layouts across all installed clusters (unfiltered — useCardData
  // applies global + local cluster filter internally via the 'cluster' field)
  const allLayouts = useMemo<IntotoLayout[]>(() => {
    const layouts: IntotoLayout[] = []
    for (const status of Object.values(statuses)) {
      if (!status.installed) continue
      layouts.push(...(status.layouts || []))
    }
    return layouts
  }, [statuses])

  // Stats computed from all layouts (pre-filter/pre-page) so the counters reflect
  // the full dataset — same pattern as ActiveAlerts stats row
  const stats = useMemo(() => {
    let totalLayouts = 0
    let verifiedSteps = 0
    let failedSteps = 0
    for (const status of Object.values(statuses)) {
      if (!status.installed) continue
      totalLayouts += status.totalLayouts
      verifiedSteps += status.verifiedSteps
      failedSteps += status.failedSteps
    }
    return { totalLayouts, verifiedSteps, failedSteps }
  }, [statuses])

  // Shared card data hook: filter (global + local cluster, search), sort, paginate
  const {
    items: displayedLayouts,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
    },
    sorting: { sortBy, setSortBy },
    containerRef,
    containerStyle,
  } = useCardData<IntotoLayout, SortField>(allLayouts, {
    filter: {
      searchFields: ['name', 'cluster'] as (keyof IntotoLayout)[],
      clusterField: 'cluster' as keyof IntotoLayout,
      storageKey: 'intoto-supply-chain',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string<IntotoLayout>('name'),
        failedSteps: commonComparators.number<IntotoLayout>('failedSteps'),
        verifiedSteps: commonComparators.number<IntotoLayout>('verifiedSteps'),
      },
    },
    defaultLimit: DEFAULT_PAGE_SIZE,
  })

  const hasData = installed || isDemoData
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
  })

  const handleInstall = () => {
    startMission({
      title: 'Install in-toto',
      description: 'Set up in-toto supply chain security on your clusters',
      type: 'deploy',
      initialPrompt: INTOTO_INSTALL_PROMPT,
      context: {},
    })
  }

  const handleDeploySampleLayouts = () => {
    startMission({
      title: 'Deploy Sample in-toto Layouts',
      description: 'Create example supply chain layouts to see in-toto in action',
      type: 'deploy',
      initialPrompt: INTOTO_SAMPLE_LAYOUTS_PROMPT,
      context: {},
    })
  }

  // Detect degraded state: installed but no layouts configured
  const isDegraded = useMemo(() => {
    if (!installed || isLoading) return false
    const installedClusters = Object.values(statuses).filter(s => s.installed)
    return installedClusters.length > 0 && installedClusters.every(s => s.totalLayouts === 0)
  }, [installed, isLoading, statuses])

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-1">
          <RefreshIndicator isRefreshing={isRefreshing} lastUpdated={lastRefresh} size="xs" />
          {isDemoData && (
            <StatusBadge color="purple" size="xs">
              Demo
            </StatusBadge>
          )}
          <a
            href="https://in-toto.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-cyan-400"
            title={t('intoto_supply_chain.documentation')}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <CardControls
          limit={itemsPerPage}
          onLimitChange={setItemsPerPage}
          sortBy={sortBy}
          onSortChange={setSortBy}
          sortOptions={SORT_OPTIONS}
          showSort={allLayouts.length > 1}
        />
      </div>

      {/* Initial loading skeleton */}
      {isLoading && !hasData && (
        <div className="space-y-3 animate-pulse">
          <div className="h-10 bg-secondary/50 rounded-lg" />
          <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
            <div className="h-12 bg-secondary/50 rounded-lg" />
            <div className="h-12 bg-secondary/50 rounded-lg" />
            <div className="h-12 bg-secondary/50 rounded-lg" />
          </div>
          <div className="h-8 bg-secondary/50 rounded-lg" />
          <div className="space-y-2">
            <div className="h-16 bg-secondary/50 rounded-lg" />
            <div className="h-16 bg-secondary/50 rounded-lg" />
          </div>
        </div>
      )}

      {/* Inline progress ring while scanning/refreshing (only if not initial load) */}
      {!isLoading && (isLoading || isRefreshing) && !installed && !isDemoData && (
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          {totalClusters > 0 ? (
            <ProgressRing progress={clustersChecked / totalClusters} size={14} strokeWidth={1.5} />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          )}
          <span>{t('intoto_supply_chain.scanningClusters')}</span>
        </div>
      )}

      {/* Fetch error state */}
      {hasErrors && !isDemoData && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">{t('intoto_supply_chain.fetchError')}</p>
            <p className="mt-1 text-red-400/80 leading-relaxed">
              {(() => {
                const errorMsg = Object.values(statuses).find(s => s.error)?.error
                if (typeof errorMsg === 'string' && errorMsg.includes('.')) {
                  return t(errorMsg, { defaultValue: errorMsg })
                }
                return t('intoto_supply_chain.fetchErrorHint')
              })()}{' '}
              <button
                onClick={() => window.location.reload()}
                className="text-red-400 underline hover:text-red-300 transition-colors"
              >
                {t('intoto_supply_chain.retry')}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Install prompt when not detected and no errors (only after scanning completes) */}
      {!installed && !isLoading && !isRefreshing && !hasErrors && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">{t('intoto_supply_chain.integrationTitle')}</p>
            <p className="text-muted-foreground">
              {t('intoto_supply_chain.integrationHint')}{' '}
              <button onClick={handleInstall} className="text-cyan-400 hover:underline">
                {t('intoto_supply_chain.installCta')}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Per-cluster badges */}
      {installed && Object.values(statuses).some(s => s.installed) && (
        <div className="flex flex-wrap gap-1 mb-3">
          {Object.values(statuses).filter(s => s.installed).map(s => (
            <StatusBadge
              key={s.cluster}
              color={s.failedSteps > 0 ? 'yellow' : 'green'}
              size="xs"
            >
              {s.cluster}: {s.totalLayouts}l/{s.failedSteps}f
            </StatusBadge>
          ))}
        </div>
      )}

      {/* Deploy Sample Layouts when installed but empty */}
      {isDegraded && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <Link2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">{t('intoto_supply_chain.noLayoutsTitle')}</p>
            <p className="text-muted-foreground">
              {t('intoto_supply_chain.noLayoutsHint')}{' '}
              <button
                onClick={handleDeploySampleLayouts}
                disabled={isLoading}
                className="text-cyan-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('intoto_supply_chain.deployLayoutsCta')}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-center">
          <p className="text-2xs text-cyan-400">{t('intoto_supply_chain.statsLayouts')}</p>
          <p className="text-lg font-bold text-foreground">{stats.totalLayouts}</p>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-2xs text-green-400">{t('intoto_supply_chain.statsVerified')}</p>
          <p className="text-lg font-bold text-foreground">{stats.verifiedSteps}</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-2xs text-red-400">{t('intoto_supply_chain.statsFailed')}</p>
          <p className="text-lg font-bold text-foreground">{stats.failedSteps}</p>
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('common:common.searchLayouts')}
      />

      {/* Layouts list */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2" style={containerStyle}>
        <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mb-2">
          <ShieldCheck className="w-3 h-3" />
          {isDemoData
            ? t('intoto_supply_chain.sampleLayouts')
            : t('intoto_supply_chain.layoutsCount', { count: totalItems })}
        </p>

        {(displayedLayouts || []).map((layout, i) => {
          const layoutKey = `${layout.cluster}-${layout.name}`
          const isExpanded = expandedLayout === layoutKey
          return (
            <IntotoLayoutRow
              key={`${layoutKey}-${i}`}
              layout={layout}
              isExpanded={isExpanded}
              onToggle={() => setExpandedLayout(isExpanded ? null : layoutKey)}
            />
          )
        })}
      </div>

      {/* Pagination */}
      {needsPagination && (
        <div className="pt-2 mt-2 border-t border-border/50">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : DEFAULT_PAGE_SIZE}
            onPageChange={goToPage}
          />
        </div>
      )}

      <IntotoSupplyChainFooter />
    </div>
  )
}

export function IntotoSupplyChain({ config: _config }: IntotoSupplyChainProps) {
  return (
    <DynamicCardErrorBoundary cardId="IntotoSupplyChain">
      <IntotoSupplyChainInternal config={_config} />
    </DynamicCardErrorBoundary>
  )
}
