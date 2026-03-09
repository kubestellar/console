/**
 * Compliance Drift Card
 *
 * Computes fleet baseline (median across clusters per tool) and flags
 * clusters deviating beyond 1 standard deviation. Lists clusters sorted
 * by severity: cluster name, drift direction, which tools, magnitude.
 * Empty state: "All clusters within baseline" with green checkmark.
 */

import { useMemo } from 'react'
import { CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useKyverno } from '../../hooks/useKyverno'
import { useTrivy } from '../../hooks/useTrivy'
import { useKubescape } from '../../hooks/useKubescape'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'

interface CardConfig {
  config?: Record<string, unknown>
}

/** Minimum number of clusters needed for meaningful drift detection */
const MIN_CLUSTERS_FOR_DRIFT = 2

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
  const { statuses: kyvernoStatuses, isLoading: kyvernoLoading, isDemoData: kyvernoDemoData } = useKyverno()
  const { statuses: trivyStatuses, isLoading: trivyLoading, isDemoData: trivyDemoData } = useTrivy()
  const { statuses: kubescapeStatuses, isLoading: kubescapeLoading, isDemoData: kubescapeDemoData } = useKubescape()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const isLoading = kyvernoLoading || trivyLoading || kubescapeLoading
  const isDemoData = kyvernoDemoData || trivyDemoData || kubescapeDemoData

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
          if (deviation > 1) {
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
          if (deviation > 1) {
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
          if (deviation > 1) {
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
      {drifts.map((d, i) => {
        const isBad = (d.tool === 'Kubescape' && d.direction === 'below') ||
          (d.tool !== 'Kubescape' && d.direction === 'above')
        const color = isBad ? 'red' : 'yellow'

        return (
          <div
            key={`${d.cluster}-${d.tool}-${i}`}
            className="flex items-center gap-2 p-2 rounded-lg bg-card/50 border border-border/50"
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
          </div>
        )
      })}
    </div>
  )
}

export default ComplianceDrift
