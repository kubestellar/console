/**
 * Fleet Compliance Heatmap
 *
 * Grid view: rows = clusters, columns = tool categories (OPA, Kyverno, Kubescape, Trivy).
 * Cells colored green/yellow/red based on violation thresholds or posture scores.
 * Consumes all compliance hooks for a cross-cluster compliance overview.
 */

import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { useKyverno } from '../../hooks/useKyverno'
import { useTrivy } from '../../hooks/useTrivy'
import { useKubescape } from '../../hooks/useKubescape'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useClusters } from '../../hooks/useMCP'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useMissions } from '../../hooks/useMissions'

interface CardConfig {
  config?: Record<string, unknown>
}

/** Thresholds for color-coding vulnerability counts */
const VULN_CRITICAL_THRESHOLD = 5
const VULN_WARNING_THRESHOLD = 1

/** Thresholds for color-coding policy violations */
const POLICY_CRITICAL_THRESHOLD = 10
const POLICY_WARNING_THRESHOLD = 3

/** Threshold for color-coding Kubescape posture score (percentage) */
const POSTURE_GOOD_THRESHOLD = 80
const POSTURE_WARNING_THRESHOLD = 60

type CellStatus = 'good' | 'warning' | 'critical' | 'not-installed'

interface HeatmapCell {
  status: CellStatus
  label: string
  tooltip: string
}

interface HeatmapRow {
  cluster: string
  kyverno: HeatmapCell
  kubescape: HeatmapCell
  trivy: HeatmapCell
}

const STATUS_COLORS: Record<CellStatus, string> = {
  good: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  'not-installed': 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
}

const STATUS_DOTS: Record<CellStatus, string> = {
  good: 'bg-green-400',
  warning: 'bg-yellow-400',
  critical: 'bg-red-400',
  'not-installed': 'bg-zinc-500',
}

/** Install mission definitions for each compliance tool */
const INSTALL_MISSIONS: Record<string, { title: string; description: string; prompt: string }> = {
  kyverno: {
    title: 'Install Kyverno',
    description: 'Install Kyverno for Kubernetes-native policy management',
    prompt: `I want to install Kyverno for policy management on my clusters.

Please help me:
1. Install Kyverno via Helm (audit mode only — do NOT enforce)
2. Verify the installation is running
3. Set up a basic audit policy (like requiring labels)

Use: helm install kyverno kyverno/kyverno --namespace kyverno --create-namespace --version v1.17.1 --set admissionController.replicas=1

Important: Set validationFailureAction to Audit (not Enforce) for all policies to avoid breaking workloads.

Please proceed step by step.`,
  },
  kubescape: {
    title: 'Install Kubescape',
    description: 'Install Kubescape Operator for security posture management',
    prompt: `I want to install the Kubescape Operator for security posture scanning on my clusters.

Please help me:
1. Install Kubescape Operator via Helm (scan-only, no enforcement)
2. Verify it's running and scanning
3. Check initial scan results

Use: helm install kubescape-operator kubescape/kubescape-operator --version 1.30.5 --namespace kubescape --create-namespace --set capabilities.continuousScan=enable

Please proceed step by step.`,
  },
  trivy: {
    title: 'Install Trivy Operator',
    description: 'Install Trivy Operator for container vulnerability scanning',
    prompt: `I want to install the Trivy Operator for vulnerability scanning on my clusters.

Please help me:
1. Install Trivy Operator via Helm (scan-only mode, no enforcement)
2. Verify the operator is running and scanning
3. Check for initial vulnerability reports

Use: helm install trivy-operator aquasecurity/trivy-operator --version 0.23.0 --namespace trivy --create-namespace

Please proceed step by step.`,
  },
}

export function FleetComplianceHeatmap({ config: _config }: CardConfig) {
  const { statuses: kyvernoStatuses, isLoading: kyvernoLoading, isDemoData: kyvernoDemoData, installed: kyvernoInstalled } = useKyverno()
  const { statuses: trivyStatuses, isLoading: trivyLoading, isDemoData: trivyDemoData, installed: trivyInstalled } = useTrivy()
  const { statuses: kubescapeStatuses, isLoading: kubescapeLoading, isDemoData: kubescapeDemoData, installed: kubescapeInstalled } = useKubescape()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { deduplicatedClusters } = useClusters()
  const { isDemoMode } = useDemoMode()
  const { startMission } = useMissions()

  const isLoading = kyvernoLoading || trivyLoading || kubescapeLoading
  const isDemoData = isDemoMode || kyvernoDemoData || trivyDemoData || kubescapeDemoData

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

  useCardLoadingState({ isLoading, hasAnyData: true, isDemoData })

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
      // Kyverno cell
      const ks = kyvernoStatuses?.[cluster]
      let kyvernoCell: HeatmapCell
      if (!ks || !ks.installed) {
        kyvernoCell = { status: 'not-installed', label: 'N/A', tooltip: 'Kyverno not installed' }
      } else {
        const violations = (ks.policies || []).reduce((sum, p) => sum + p.violations, 0)
        const status: CellStatus = violations >= POLICY_CRITICAL_THRESHOLD ? 'critical'
          : violations >= POLICY_WARNING_THRESHOLD ? 'warning' : 'good'
        kyvernoCell = {
          status,
          label: `${violations} violations`,
          tooltip: `${(ks.policies || []).length} policies, ${violations} violations`,
        }
      }

      // Trivy cell
      const ts = trivyStatuses?.[cluster]
      let trivyCell: HeatmapCell
      if (!ts || !ts.installed) {
        trivyCell = { status: 'not-installed', label: 'N/A', tooltip: 'Trivy not installed' }
      } else {
        const critHigh = ts.vulnerabilities.critical + ts.vulnerabilities.high
        const status: CellStatus = critHigh >= VULN_CRITICAL_THRESHOLD ? 'critical'
          : critHigh >= VULN_WARNING_THRESHOLD ? 'warning' : 'good'
        trivyCell = {
          status,
          label: `${critHigh} crit/high`,
          tooltip: `C:${ts.vulnerabilities.critical} H:${ts.vulnerabilities.high} M:${ts.vulnerabilities.medium} L:${ts.vulnerabilities.low}`,
        }
      }

      // Kubescape cell
      const kss = kubescapeStatuses?.[cluster]
      let kubescapeCell: HeatmapCell
      if (!kss || !kss.installed) {
        kubescapeCell = { status: 'not-installed', label: 'N/A', tooltip: 'Kubescape not installed' }
      } else {
        const score = kss.overallScore
        const status: CellStatus = score >= POSTURE_GOOD_THRESHOLD ? 'good'
          : score >= POSTURE_WARNING_THRESHOLD ? 'warning' : 'critical'
        kubescapeCell = {
          status,
          label: `${score}%`,
          tooltip: `Score: ${score}%, ${kss.passedControls}/${kss.totalControls} controls passing`,
        }
      }

      return { cluster, kyverno: kyvernoCell, kubescape: kubescapeCell, trivy: trivyCell }
    })
  }, [kyvernoStatuses, trivyStatuses, kubescapeStatuses, deduplicatedClusters, selectedClusters, isAllClustersSelected])

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No clusters available
      </div>
    )
  }

  const tools = ['Kyverno', 'Kubescape', 'Trivy'] as const
  const toolKeys = ['kyverno', 'kubescape', 'trivy'] as const

  return (
    <div className="space-y-2 p-1">
      {/* Header row */}
      <div className="grid grid-cols-4 gap-1 text-xs font-medium text-muted-foreground">
        <div className="px-2 py-1">Cluster</div>
        {tools.map((tool, i) => {
          const key = toolKeys[i]
          const installed = toolInstalled[key]
          return (
            <div key={tool} className="px-2 py-1 text-center">
              <span>{tool}</span>
              {!installed && !isLoading && (
                <button
                  onClick={() => handleInstall(key)}
                  className="ml-1 inline-flex items-center gap-0.5 text-cyan-400 hover:text-cyan-300 transition-colors"
                  title={`${tool} not detected — click to install with an AI Mission`}
                >
                  <Info className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Data rows */}
      {rows.map(row => (
        <div key={row.cluster} className="grid grid-cols-4 gap-1">
          <div className="px-2 py-1.5 text-xs font-mono truncate" title={row.cluster}>
            {row.cluster}
          </div>
          {toolKeys.map(key => {
            const cell = row[key]
            return (
              <div
                key={key}
                className={`px-2 py-1.5 rounded border text-xs text-center ${STATUS_COLORS[cell.status]}`}
                title={cell.tooltip}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${STATUS_DOTS[cell.status]}`} />
                {cell.label}
              </div>
            )
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex gap-3 pt-1 text-[10px] text-muted-foreground border-t border-border/50 mt-1">
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-0.5" /> Good</span>
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 mr-0.5" /> Warning</span>
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-0.5" /> Critical</span>
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-500 mr-0.5" /> N/A</span>
      </div>
    </div>
  )
}

export default FleetComplianceHeatmap
