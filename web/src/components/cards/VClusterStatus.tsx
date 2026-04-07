import { CheckCircle2, Clock, XCircle, AlertCircle, Pause, Server } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

type VClusterStatusType = 'Running' | 'Paused' | 'Failed' | 'Unknown'

interface VCluster {
  name: string
  namespace: string
  hostCluster: string
  status: VClusterStatusType
  k8sVersion: string
  createdAt: string
}

const DEMO_AGE_OLDEST_DAYS = 45
const DEMO_AGE_STAGING_DAYS = 21
const DEMO_AGE_TEST_DAYS = 10
const DEMO_AGE_SANDBOX_DAYS = 3
const DEMO_AGE_QA_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

const DEMO_VCLUSTERS: VCluster[] = [
  { name: 'dev-vcluster', namespace: 'vcluster-dev', hostCluster: 'us-east-1', status: 'Running', k8sVersion: 'v1.30.2', createdAt: new Date(Date.now() - DEMO_AGE_OLDEST_DAYS * MS_PER_DAY).toISOString() },
  { name: 'staging-vcluster', namespace: 'vcluster-staging', hostCluster: 'us-west-2', status: 'Running', k8sVersion: 'v1.29.6', createdAt: new Date(Date.now() - DEMO_AGE_STAGING_DAYS * MS_PER_DAY).toISOString() },
  { name: 'test-env', namespace: 'vcluster-test', hostCluster: 'eu-central-1', status: 'Paused', k8sVersion: 'v1.30.0', createdAt: new Date(Date.now() - DEMO_AGE_TEST_DAYS * MS_PER_DAY).toISOString() },
  { name: 'sandbox-vcluster', namespace: 'vcluster-sandbox', hostCluster: 'us-east-1', status: 'Failed', k8sVersion: 'v1.28.11', createdAt: new Date(Date.now() - DEMO_AGE_SANDBOX_DAYS * MS_PER_DAY).toISOString() },
  { name: 'qa-vcluster', namespace: 'vcluster-qa', hostCluster: 'on-prem-dc1', status: 'Running', k8sVersion: 'v1.30.2', createdAt: new Date(Date.now() - DEMO_AGE_QA_DAYS * MS_PER_DAY).toISOString() },
]

const DEMO_STATS = { totalVClusters: 5, runningCount: 3, pausedCount: 1, failedCount: 1 }

const getStatusIcon = (status: VClusterStatusType) => {
  switch (status) {
    case 'Running': return CheckCircle2
    case 'Paused': return Pause
    case 'Failed': return XCircle
    default: return Clock
  }
}

const getStatusColors = (status: VClusterStatusType) => {
  switch (status) {
    case 'Running': return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/20' }
    case 'Paused': return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/20' }
    case 'Failed': return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/20' }
    default: return { bg: 'bg-gray-500/20', text: 'text-muted-foreground', border: 'border-gray-500/20' }
  }
}

type SortByOption = 'name' | 'hostCluster' | 'status'
type SortTranslationKey = 'common:common.name' | 'common:common.cluster' | 'common:common.status'
const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'name' as const, labelKey: 'common:common.name' },
  { value: 'hostCluster' as const, labelKey: 'common:common.cluster' },
  { value: 'status' as const, labelKey: 'common:common.status' },
]
const VCLUSTER_SORT_COMPARATORS: Record<SortByOption, (a: VCluster, b: VCluster) => number> = {
  name: commonComparators.string<VCluster>('name'),
  hostCluster: commonComparators.string<VCluster>('hostCluster'),
  status: commonComparators.string<VCluster>('status'),
}
const DEFAULT_PAGE_SIZE = 5

interface VClusterStatusProps { config?: Record<string, unknown> }

export function VClusterStatus({ config: _config }: VClusterStatusProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = SORT_OPTIONS_KEYS.map(opt => ({ value: opt.value, label: String(t(opt.labelKey)) }))
  const isLoading = false
  const hasError = false
  useCardLoadingState({ isLoading: false, hasAnyData: DEMO_VCLUSTERS.length > 0, isDemoData: true })
  const {
    items: paginatedVClusters, totalItems, currentPage, totalPages, itemsPerPage,
    goToPage, needsPagination, setItemsPerPage,
    filters: { search: localSearch, setSearch: setLocalSearch, localClusterFilter, toggleClusterFilter, clearClusterFilter, availableClusters, showClusterFilter, setShowClusterFilter, clusterFilterRef },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
    containerRef, containerStyle,
  } = useCardData<VCluster, SortByOption>(DEMO_VCLUSTERS, {
    filter: { searchFields: ['name', 'namespace', 'hostCluster', 'status', 'k8sVersion'], clusterField: 'hostCluster', storageKey: 'vcluster-status' },
    sort: { defaultField: 'name', defaultDirection: 'asc', comparators: VCLUSTER_SORT_COMPARATORS },
    defaultLimit: DEFAULT_PAGE_SIZE,
  })
  if (isLoading) {
    return (<div className="h-full flex flex-col min-h-card"><div className="flex items-center justify-between mb-3"><Skeleton variant="text" width={120} height={20} /><Skeleton variant="rounded" width={80} height={28} /></div><div className="space-y-2"><Skeleton variant="rounded" height={60} /><Skeleton variant="rounded" height={60} /><Skeleton variant="rounded" height={60} /></div></div>)
  }
  if (hasError) {
    return (<div className="h-full flex flex-col items-center justify-center min-h-card p-6"><AlertCircle className="w-12 h-12 text-red-400 mb-4" /><p className="text-sm text-muted-foreground mb-4">{t('vclusterStatus.loadFailed')}</p><button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm">{t('common:common.retry')}</button></div>)
  }
  return (
    <div className="h-full flex flex-col min-h-card">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">{t('vclusterStatus.nVClusters', { count: totalItems })}</span>
          {localClusterFilter.length > 0 && (<span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded"><Server className="w-3 h-3" />{localClusterFilter.length}/{availableClusters.length}</span>)}
        </div>
        <CardControlsRow
          clusterFilter={{ availableClusters, selectedClusters: localClusterFilter, onToggle: toggleClusterFilter, onClear: clearClusterFilter, isOpen: showClusterFilter, setIsOpen: setShowClusterFilter, containerRef: clusterFilterRef, minClusters: 1 }}
          cardControls={{ limit: itemsPerPage, onLimitChange: setItemsPerPage, sortBy, sortOptions: SORT_OPTIONS, onSortChange: (v) => setSortBy(v as SortByOption), sortDirection, onSortDirectionChange: setSortDirection }}
        />
      </div>
      <CardSearchInput value={localSearch} onChange={setLocalSearch} placeholder={t('vclusterStatus.searchPlaceholder')} className="mb-3" />
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-center"><p className="text-2xs text-purple-400">{t('vclusterStatus.total')}</p><p className="text-lg font-bold text-foreground">{DEMO_STATS.totalVClusters}</p></div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center"><p className="text-2xs text-green-400">{t('vclusterStatus.running')}</p><p className="text-lg font-bold text-foreground">{DEMO_STATS.runningCount}</p></div>
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center"><p className="text-2xs text-yellow-400">{t('vclusterStatus.paused')}</p><p className="text-lg font-bold text-foreground">{DEMO_STATS.pausedCount}</p></div>
      </div>
      {DEMO_STATS.failedCount > 0 && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div><p className="text-red-400 font-medium">{t('vclusterStatus.healthWarning')}</p><p className="text-muted-foreground">{t('vclusterStatus.failedCount', { count: DEMO_STATS.failedCount })}</p></div>
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2" style={containerStyle}>
        {paginatedVClusters.map((vc, idx) => {
          const Icon = getStatusIcon(vc.status)
          const colors = getStatusColors(vc.status)
          return (
            <div key={`${vc.hostCluster}-${vc.namespace}-${vc.name}-${idx}`} className="p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${colors.text}`} />
                  <span className="text-sm font-medium text-foreground truncate">{vc.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-2xs ${colors.bg} ${colors.text}`}>{vc.status}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{vc.k8sVersion}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2"><ClusterBadge cluster={vc.hostCluster} /><span className="text-muted-foreground">{vc.namespace}</span></div>
              </div>
            </div>
          )
        })}
      </div>
      <CardPaginationFooter currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10} onPageChange={goToPage} needsPagination={needsPagination && itemsPerPage !== 'unlimited'} />
    </div>
  )
}

export default VClusterStatus
