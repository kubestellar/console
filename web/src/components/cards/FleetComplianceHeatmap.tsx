/**
 * Fleet Compliance Heatmap
 *
 * Grid view: rows = clusters, columns = tool categories (Kyverno, Kubescape, Trivy).
 * Cells colored green/yellow/red based on violation thresholds or posture scores.
 * Click any installed cell to open the tool's detail modal for that cluster.
 * Consumes all compliance hooks for a cross-cluster compliance overview.
 */

import { useState, useMemo } from 'react'
import { AlertTriangle, Info, Loader2 } from 'lucide-react'
import { ProgressRing } from '../ui/ProgressRing'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { useCardLoadingState } from './CardDataContext'
import { useKyverno } from '../../hooks/useKyverno'
import { useTrivy } from '../../hooks/useTrivy'
import { useKubescape } from '../../hooks/useKubescape'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useClusters } from '../../hooks/useMCP'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useMissions } from '../../hooks/useMissions'
import { KyvernoDetailModal } from './kyverno/KyvernoDetailModal'
import { TrivyDetailModal } from './trivy/TrivyDetailModal'
import { KubescapeDetailModal } from './kubescape/KubescapeDetailModal'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import {
  INSTALL_MISSIONS,
  STATUS_COLORS,
  STATUS_DOTS,
  buildKubescapeCell,
  buildKyvernoCell,
  buildTrivyCell,
  type HeatmapRow,
} from './FleetComplianceHeatmap.data'

interface CardConfig {
  config?: Record<string, unknown>
}

export function FleetComplianceHeatmap({ config: _config }: CardConfig) {
  const { t } = useTranslation('cards')
  const { statuses: kyvernoStatuses, isLoading: kyvernoLoading, isRefreshing: kyvernoRefreshing, lastRefresh: kyvernoLastRefresh, isDemoData: kyvernoDemoData, installed: kyvernoInstalled, refetch: kyvernoRefetch, clustersChecked: kyvernoChecked, totalClusters: kyvernoTotal } = useKyverno()
  const { statuses: trivyStatuses, isLoading: trivyLoading, isRefreshing: trivyRefreshing, isDemoData: trivyDemoData, installed: trivyInstalled, refetch: trivyRefetch, clustersChecked: trivyChecked, totalClusters: trivyTotal } = useTrivy()
  const { statuses: kubescapeStatuses, isLoading: kubescapeLoading, isRefreshing: kubescapeRefreshing, isDemoData: kubescapeDemoData, installed: kubescapeInstalled, refetch: kubescapeRefetch, clustersChecked: kubescapeChecked, totalClusters: kubescapeTotal } = useKubescape()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { deduplicatedClusters, consecutiveFailures: clusterFailures } = useClusters()
  const { isDemoMode } = useDemoMode()
  const { startMission } = useMissions()

  // Modal state: { tool, cluster }
  const [modal, setModal] = useState<{ tool: string; cluster: string } | null>(null)

  const isLoading = kyvernoLoading || trivyLoading || kubescapeLoading
  const isRefreshing = kyvernoRefreshing || trivyRefreshing || kubescapeRefreshing
  const isDemoData = isDemoMode || kyvernoDemoData || trivyDemoData || kubescapeDemoData

  /** Combined progressive streaming progress across all three tools */
  const totalChecking = Math.max(kyvernoTotal, kubescapeTotal, trivyTotal)
  const minChecked = Math.min(kyvernoChecked, kubescapeChecked, trivyChecked)

  /** Whether all clusters encountered errors (none succeeded) */
  const hasError = !isLoading && !isRefreshing &&
    Object.values(kyvernoStatuses || {}).every(s => !!s.error) &&
    Object.values(trivyStatuses || {}).every(s => !!s.error) &&
    Object.values(kubescapeStatuses || {}).every(s => !!s.error) &&
    (Object.keys(kyvernoStatuses || {}).length > 0 ||
     Object.keys(trivyStatuses || {}).length > 0 ||
     Object.keys(kubescapeStatuses || {}).length > 0)

  /** Whether each tool is installed on at least one cluster */
  const toolInstalled: Record<string, boolean> = {
    kyverno: kyvernoInstalled,
    kubescape: kubescapeInstalled,
    trivy: trivyInstalled,
  }

  const handleInstall = (toolKey: string) => {
    const mission = INSTALL_MISSIONS[toolKey]
    if (!mission) return
    startMission({
      title: mission.title,
      description: mission.description,
      type: 'deploy',
      initialPrompt: mission.prompt,
      context: {},
    })
  }

  const handleCellClick = (toolKey: string, cluster: string) => {
    // Only allow click on installed cells
    const statusMap: Record<string, Record<string, { installed?: boolean }>> = {
      kyverno: kyvernoStatuses,
      kubescape: kubescapeStatuses,
      trivy: trivyStatuses,
    }
    const clusterStatus = statusMap[toolKey]?.[cluster]
    if (clusterStatus?.installed) {
      setModal({ tool: toolKey, cluster })
    }
  }

  const hasAnyData =
    Object.values(kyvernoStatuses || {}).some(s => !s.error) ||
    Object.values(trivyStatuses || {}).some(s => !s.error) ||
    Object.values(kubescapeStatuses || {}).some(s => !s.error)

  // #6219: pass `hasError` through as `isFailed` so CardWrapper enters its
  // error render path when all 3 underlying hooks (kyverno, trivy,
  // kubescape) finished but found no clusters to scan / no installations.
  // hasError is computed above from `clustersChecked` totals.
  useCardLoadingState({ isLoading: isLoading && !isDemoData, isRefreshing, hasAnyData, isDemoData, isFailed: hasError, consecutiveFailures: clusterFailures })

  const rows = useMemo((): HeatmapRow[] => {
    // Collect all cluster names from compliance hooks + useClusters fallback
    const clusterSet = new Set<string>()
    for (const name of Object.keys(kyvernoStatuses || {})) clusterSet.add(name)
    for (const name of Object.keys(trivyStatuses || {})) clusterSet.add(name)
    for (const name of Object.keys(kubescapeStatuses || {})) clusterSet.add(name)
    // Fallback: include clusters from useClusters so the grid is always populated
    for (const c of (deduplicatedClusters || [])) clusterSet.add(c.name)

    let clusterNames = Array.from(clusterSet).sort()

    // Apply global cluster filter
    if (!isAllClustersSelected && selectedClusters.length > 0) {
      clusterNames = clusterNames.filter(c => selectedClusters.includes(c))
    }

    return clusterNames.map(cluster => {
      const kyvernoCell = buildKyvernoCell(kyvernoStatuses?.[cluster])
      const trivyCell = buildTrivyCell(trivyStatuses?.[cluster])
      const kubescapeCell = buildKubescapeCell(kubescapeStatuses?.[cluster])

      return { cluster, kyverno: kyvernoCell, kubescape: kubescapeCell, trivy: trivyCell }
    })
  }, [kyvernoStatuses, trivyStatuses, kubescapeStatuses, deduplicatedClusters, selectedClusters, isAllClustersSelected])

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2 p-4">
        <AlertTriangle className="w-6 h-6 text-destructive opacity-70" />
        <p className="text-destructive">Failed to load compliance data</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { kyvernoRefetch(); trivyRefetch(); kubescapeRefetch() }}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Retry
        </Button>
      </div>
    )
  }

  if (rows.length === 0) {
    // Still scanning — show loading state instead of definitive empty state
    if (isLoading || isRefreshing) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-3">
          {totalChecking > 0 ? (
            <ProgressRing progress={minChecked / totalChecking} size={28} strokeWidth={2.5} />
          ) : (
            <Loader2 className="w-6 h-6 animate-spin opacity-50" />
          )}
          <p>{t('fleetCompliance.scanningClusters')}</p>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t('fleetCompliance.noClusters')}
      </div>
    )
  }

  const tools = ['Kyverno', 'Kubescape', 'Trivy'] as const
  const toolKeys = ['kyverno', 'kubescape', 'trivy'] as const
  const toolTaglines: Record<string, string> = {
    kyverno: 'Policy engine',
    kubescape: 'Security posture',
    trivy: 'CVE scanner',
  }

  return (
    <div className="space-y-2 p-1">
      {/* Context description */}
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-secondary/20 rounded-md px-2 py-1.5">
        <Info className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/60" />
        <span>{t('fleetCompliance.contextDescription')}</span>
      </div>

      {/* Refresh indicator + inline progress */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        {(isLoading || isRefreshing) && totalChecking > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ProgressRing progress={minChecked / totalChecking} size={14} strokeWidth={1.5} />
            <span>{t('fleetCompliance.scanning')}</span>
          </div>
        )}
        <div className="ml-auto">
          <RefreshIndicator isRefreshing={isRefreshing} lastUpdated={kyvernoLastRefresh} size="xs" />
        </div>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-1 text-xs font-medium text-muted-foreground">
        <div className="px-2 py-1">Cluster</div>
        {tools.map((tool, i) => {
          const key = toolKeys[i]
          const installed = toolInstalled[key]
          return (
            <div key={tool} className="px-2 py-1 text-center">
              <span>{tool}</span>
              {!installed && !isLoading && !isRefreshing && (
                <button
                  onClick={() => handleInstall(key)}
                  className="ml-1 inline-flex items-center gap-0.5 text-cyan-400 hover:text-cyan-300 transition-colors"
                  title={`${tool} not detected — click to install with an AI Mission`}
                >
                  <Info className="w-3 h-3" />
                </button>
              )}
              <p className="text-[9px] text-muted-foreground/60 font-normal mt-0.5">{toolTaglines[key]}</p>
            </div>
          )
        })}
      </div>

      {/* Data rows */}
      {rows.map(row => (
        <div key={row.cluster} className="grid grid-cols-2 @md:grid-cols-4 gap-1">
          <div className="px-2 py-1.5 text-xs font-mono truncate" title={row.cluster}>
            {row.cluster}
          </div>
          {toolKeys.map(key => {
            const cell = row[key]
            const isClickable = cell.status !== 'not-installed'
            return (
              <div
                key={key}
                className={`px-2 py-1.5 rounded border text-xs text-center ${STATUS_COLORS[cell.status]} ${
                  isClickable ? 'cursor-pointer hover:brightness-125 transition-all' : ''
                }`}
                title={cell.tooltip}
                onClick={() => isClickable && handleCellClick(key, row.cluster)}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCellClick(key, row.cluster) } } : undefined}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${STATUS_DOTS[cell.status]}`} />
                {cell.label}
              </div>
            )
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex gap-3 pt-1 text-xs text-muted-foreground border-t border-border/50 mt-1">
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-0.5" /> Good</span>
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 mr-0.5" /> Warning</span>
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-0.5" /> Critical</span>
      </div>

      {/* Detail modals */}
      {modal?.tool === 'kyverno' && kyvernoStatuses[modal.cluster] && (
        <KyvernoDetailModal
          isOpen
          onClose={() => setModal(null)}
          clusterName={modal.cluster}
          status={kyvernoStatuses[modal.cluster]}
          onRefresh={() => kyvernoRefetch()}
          isRefreshing={kyvernoRefreshing}
        />
      )}
      {modal?.tool === 'trivy' && trivyStatuses[modal.cluster] && (
        <TrivyDetailModal
          isOpen
          onClose={() => setModal(null)}
          clusterName={modal.cluster}
          status={trivyStatuses[modal.cluster]}
          onRefresh={() => trivyRefetch()}
          isRefreshing={trivyRefreshing}
        />
      )}
      {modal?.tool === 'kubescape' && kubescapeStatuses[modal.cluster] && (
        <KubescapeDetailModal
          isOpen
          onClose={() => setModal(null)}
          clusterName={modal.cluster}
          status={kubescapeStatuses[modal.cluster]}
          onRefresh={() => kubescapeRefetch()}
          isRefreshing={kubescapeRefreshing}
        />
      )}
    </div>
  )
}

export default FleetComplianceHeatmap
