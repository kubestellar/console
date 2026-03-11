/**
 * Compliance Drift Card
 *
 * Computes fleet baseline (mean across clusters per tool) and flags
 * clusters deviating beyond 1 standard deviation. Lists clusters sorted
 * by severity: cluster name, drift direction, which tools, magnitude.
 * Empty state: "All clusters within baseline" with green checkmark.
 */

import { useState, useMemo } from 'react'
import { CheckCircle2, TrendingDown, TrendingUp, ChevronRight, Info } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useCardLoadingState } from './CardDataContext'
import { useKyverno } from '../../hooks/useKyverno'
import { useTrivy } from '../../hooks/useTrivy'
import { useKubescape } from '../../hooks/useKubescape'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { KyvernoDetailModal } from './kyverno/KyvernoDetailModal'
import { TrivyDetailModal } from './trivy/TrivyDetailModal'
import { KubescapeDetailModal } from './kubescape/KubescapeDetailModal'

interface CardConfig {
  config?: Record<string, unknown>
}

/** Minimum number of clusters needed for meaningful drift detection */
const MIN_CLUSTERS_FOR_DRIFT = 2

/** Standard deviation threshold for flagging drift (1 = outside 1σ) */
const DRIFT_STDDEV_THRESHOLD = 1

interface DriftEntry {
  cluster: string
  tool: string
  direction: 'above' | 'below'
  value: number
  baseline: number
  magnitude: number
}

/** Compute mean and standard deviation of an array of numbers */
function stats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return { mean, stdDev: Math.sqrt(variance) }
}

export function ComplianceDrift({ config: _config }: CardConfig) {
  const { statuses: kyvernoStatuses, isLoading: kyvernoLoading, isRefreshing: kyvernoRefreshing, lastRefresh: kyvernoLastRefresh, isDemoData: kyvernoDemoData, refetch: kyvernoRefetch } = useKyverno()
  const { statuses: trivyStatuses, isLoading: trivyLoading, isRefreshing: trivyRefreshing, isDemoData: trivyDemoData, refetch: trivyRefetch } = useTrivy()
  const { statuses: kubescapeStatuses, isLoading: kubescapeLoading, isRefreshing: kubescapeRefreshing, isDemoData: kubescapeDemoData, refetch: kubescapeRefetch } = useKubescape()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [modal, setModal] = useState<{ tool: string; cluster: string } | null>(null)

  const isLoading = kyvernoLoading || trivyLoading || kubescapeLoading
  const isRefreshing = kyvernoRefreshing || trivyRefreshing || kubescapeRefreshing
  const isDemoData = kyvernoDemoData || trivyDemoData || kubescapeDemoData

  const handleDriftClick = (d: DriftEntry) => {
    const toolKey = d.tool.toLowerCase()
    setModal({ tool: toolKey, cluster: d.cluster })
  }

  useCardLoadingState({ isLoading, hasAnyData: true, isDemoData })

  const drifts = useMemo((): DriftEntry[] => {
    const result: DriftEntry[] = []

    // Helper to filter clusters by global selection
    const shouldInclude = (cluster: string) =>
      isAllClustersSelected || selectedClusters.length === 0 || selectedClusters.includes(cluster)

    // --- Kyverno violations drift ---
    const kyvernoEntries = Object.entries(kyvernoStatuses || {})
      .filter(([name, s]) => s.installed && shouldInclude(name))
    if (kyvernoEntries.length >= MIN_CLUSTERS_FOR_DRIFT) {
      const values = kyvernoEntries.map(([, s]) => (s.policies || []).reduce((sum, p) => sum + p.violations, 0))
      const { mean, stdDev } = stats(values)
      if (stdDev > 0) {
        kyvernoEntries.forEach(([cluster], i) => {
          const val = values[i]
          const deviation = Math.abs(val - mean) / stdDev
          if (deviation > DRIFT_STDDEV_THRESHOLD) {
            result.push({
              cluster,
              tool: 'Kyverno',
              direction: val > mean ? 'above' : 'below',
              value: val,
              baseline: Math.round(mean),
              magnitude: Math.round(deviation * 10) / 10,
            })
          }
        })
      }
    }

    // --- Trivy vulnerabilities drift ---
    const trivyEntries = Object.entries(trivyStatuses || {})
      .filter(([name, s]) => s.installed && shouldInclude(name))
    if (trivyEntries.length >= MIN_CLUSTERS_FOR_DRIFT) {
      const values = trivyEntries.map(([, s]) => s.vulnerabilities.critical + s.vulnerabilities.high)
      const { mean, stdDev } = stats(values)
      if (stdDev > 0) {
        trivyEntries.forEach(([cluster], i) => {
          const val = values[i]
          const deviation = Math.abs(val - mean) / stdDev
          if (deviation > DRIFT_STDDEV_THRESHOLD) {
            result.push({
              cluster,
              tool: 'Trivy',
              direction: val > mean ? 'above' : 'below',
              value: val,
              baseline: Math.round(mean),
              magnitude: Math.round(deviation * 10) / 10,
            })
          }
        })
      }
    }

    // --- Kubescape score drift ---
    const kubescapeEntries = Object.entries(kubescapeStatuses || {})
      .filter(([name, s]) => s.installed && shouldInclude(name))
    if (kubescapeEntries.length >= MIN_CLUSTERS_FOR_DRIFT) {
      const values = kubescapeEntries.map(([, s]) => s.overallScore)
      const { mean, stdDev } = stats(values)
      if (stdDev > 0) {
        kubescapeEntries.forEach(([cluster], i) => {
          const val = values[i]
          const deviation = Math.abs(val - mean) / stdDev
          if (deviation > DRIFT_STDDEV_THRESHOLD) {
            result.push({
              cluster,
              tool: 'Kubescape',
              // For scores, below baseline is worse
              direction: val < mean ? 'below' : 'above',
              value: val,
              baseline: Math.round(mean),
              magnitude: Math.round(deviation * 10) / 10,
            })
          }
        })
      }
    }

    // Sort by magnitude descending (worst drifts first)
    result.sort((a, b) => b.magnitude - a.magnitude)
    return result
  }, [kyvernoStatuses, trivyStatuses, kubescapeStatuses, selectedClusters, isAllClustersSelected])

  // Empty state: all clusters within baseline
  if (!isLoading && drifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-4">
        <CheckCircle2 className="w-8 h-8 text-green-400" />
        <p className="text-sm font-medium text-green-400">All clusters within baseline</p>
        <p className="text-xs text-muted-foreground">
          No significant compliance deviations detected across the fleet
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5 p-1">
      {/* Context description */}
      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-secondary/20 rounded-md px-2 py-1.5 mb-1">
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5 text-muted-foreground/60" />
        <span>Flags clusters deviating from fleet average. Drift indicates inconsistent security posture that needs investigation.</span>
      </div>

      {/* Refresh indicator */}
      <div className="flex justify-end">
        <RefreshIndicator isRefreshing={isRefreshing} lastUpdated={kyvernoLastRefresh} size="xs" />
      </div>

      {drifts.map((d, i) => {
        const isBad = (d.tool === 'Kubescape' && d.direction === 'below') ||
          (d.tool !== 'Kubescape' && d.direction === 'above')
        const color = isBad ? 'red' : 'yellow'

        return (
          <div
            key={`${d.cluster}-${d.tool}-${i}`}
            className="flex items-center gap-2 p-2 rounded-lg bg-card/50 border border-border/50 cursor-pointer hover:bg-secondary/50 transition-colors group"
            onClick={() => handleDriftClick(d)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDriftClick(d) } }}
          >
            {d.direction === 'above' ? (
              <TrendingUp className={`w-4 h-4 flex-shrink-0 ${isBad ? 'text-red-400' : 'text-yellow-400'}`} />
            ) : (
              <TrendingDown className={`w-4 h-4 flex-shrink-0 ${isBad ? 'text-red-400' : 'text-yellow-400'}`} />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono truncate">{d.cluster}</span>
                <StatusBadge color={color} size="xs">{d.tool}</StatusBadge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {d.tool === 'Kubescape'
                  ? `Score ${d.value}% vs fleet avg ${d.baseline}%`
                  : `${d.value} vs fleet avg ${d.baseline}`
                }
                {' '}({d.magnitude}σ deviation)
              </p>
            </div>
            <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </div>
        )
      })}

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

export default ComplianceDrift
