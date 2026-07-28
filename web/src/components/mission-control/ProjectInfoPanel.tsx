import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import type { DependencyEdge } from './types'
import { fetchMissionContent } from '../../lib/missions/missionCache'
import { fetchKubaraValues } from '../../lib/kubara'
import type { MissionExport, MissionStep } from '../../lib/missions/types'
import { STATUS_COLORS, STATUS_LABELS } from './BlueprintInfoPanelsConstants'

// ---------------------------------------------------------------------------
// Kubara chart → install steps generator (#11881)
// ---------------------------------------------------------------------------

/** Default Kubara Helm repo URL used in generated install steps */
const KUBARA_HELM_REPO_URL = 'https://kubara-io.github.io/kubara'
/** Repo alias used in helm add repo step */
const KUBARA_HELM_REPO_ALIAS = 'kubara'

/**
 * Generate install steps from a kubara chart's values.yaml content.
 * Produces a practical helm install sequence: add repo, install chart, verify.
 */
function generateKubaraInstallSteps(chartName: string, valuesYaml: string | null): MissionStep[] {
  const steps: MissionStep[] = [
    {
      title: 'Add Kubara Helm repository',
      description: `Register the Kubara Helm chart repository for ${chartName}.`,
      command: `helm repo add ${KUBARA_HELM_REPO_ALIAS} ${KUBARA_HELM_REPO_URL} && helm repo update`,
    },
    {
      title: `Install ${chartName}`,
      description: `Install the ${chartName} chart from Kubara with production-tested defaults.`,
      command: `helm install ${chartName} ${KUBARA_HELM_REPO_ALIAS}/${chartName} --namespace ${chartName} --create-namespace`,
    },
  ]

  // If values.yaml was fetched, extract key configurable params for a values step
  if (valuesYaml) {
    const hasResources = /resources:/.test(valuesYaml)
    const hasReplicaCount = /replicaCount:/.test(valuesYaml)
    const hasMonitoring = /monitoring:/.test(valuesYaml)

    const customizations: string[] = []
    if (hasReplicaCount) customizations.push('replicaCount')
    if (hasResources) customizations.push('resources.requests.cpu', 'resources.requests.memory')
    if (hasMonitoring) customizations.push('monitoring.enabled')

    if (customizations.length > 0) {
      steps.push({
        title: 'Customize values (optional)',
        description: `Key configurable parameters: ${customizations.join(', ')}. Override with --set or a custom values file.`,
        command: `helm install ${chartName} ${KUBARA_HELM_REPO_ALIAS}/${chartName} --namespace ${chartName} --create-namespace -f custom-values.yaml`,
      })
    }
  }

  steps.push({
    title: 'Verify installation',
    description: `Check that ${chartName} pods are running successfully.`,
    command: `kubectl get pods -n ${chartName} --watch`,
  })

  return steps
}

// ---------------------------------------------------------------------------
// ProjectInfoPanel
// ---------------------------------------------------------------------------

export function ProjectInfoPanel({ info, edges }: { info: ProjectHoverInfo; edges?: DependencyEdge[] }) {
  // Find connections for this project
  const connections = edges?.filter(e => e.from === info.name || e.to === info.name) ?? []
  const [mission, setMission] = useState<MissionExport | null>(null)
  const [loadingSteps, setLoadingSteps] = useState(false)
  const [stepsError, setStepsError] = useState<string | null>(null)
  const [stepsRetryNonce, setStepsRetryNonce] = useState(0)
  const fetchedRef = useRef<string>('')

  // Fetch mission steps — try multiple KB path variants for fuzzy matching
  const slug = info.name.toLowerCase().replace(/\s+/g, '-')
  useEffect(() => {
    const fetchKey = `${slug}:${stepsRetryNonce}`
    if (fetchedRef.current === fetchKey) return
    fetchedRef.current = fetchKey
    setLoadingSteps(true)
    setMission(null)
    setStepsError(null)

    const candidates: string[] = []
    if (info.kbPath) candidates.push(info.kbPath)
    candidates.push(`fixes/cncf-install/install-${slug}.json`)
    // Try with abbreviation suffix: open-policy-agent → open-policy-agent-opa
    const parts = slug.split('-')
    if (parts.length >= 2) {
      const abbrev = parts.map(p => p[0]).join('')
      candidates.push(`fixes/cncf-install/install-${slug}-${abbrev}.json`)
    }
    // Try without trailing "-operator"
    if (slug.endsWith('-operator')) {
      candidates.push(`fixes/cncf-install/install-${slug.replace(/-operator$/, '')}.json`)
    }

    const failSteps = () => {
      setStepsError('Install steps are unavailable right now. Retry to load them again.')
      setLoadingSteps(false)
    }

    const tryNext = (idx: number) => {
      if (idx >= candidates.length) {
        // #11881 — No KB entry found; generate install steps from kubara chart data
        if (info.kubaraChart) {
          const chartName = info.kubaraChart.repoPath.split('/').pop() || slug
          fetchKubaraValues(chartName, info.kubaraChart.valuesUrl)
            .then((valuesYaml) => {
              if (!valuesYaml) {
                failSteps()
                return
              }
              const generatedSteps = generateKubaraInstallSteps(chartName, valuesYaml)
              const generatedMission: MissionExport = {
                version: 'kc-mission-v1',
                title: info.displayName,
                description: info.reason ?? '',
                type: 'custom',
                tags: [],
                steps: generatedSteps,
                metadata: { source: `kubara/${chartName}` },
              }
              setMission(generatedMission)
              setLoadingSteps(false)
            })
            .catch(() => failSteps())
        } else {
          failSteps()
        }
        return
      }
      const indexMission: MissionExport = {
        version: 'kc-mission-v1',
        title: info.displayName,
        description: info.reason ?? '',
        type: 'custom',
        tags: [],
        steps: [],
        metadata: { source: candidates[idx] },
      }
      fetchMissionContent(indexMission)
        .then(({ mission: m }) => {
          if (m.steps && m.steps.length > 0) {
            setMission(m)
            setLoadingSteps(false)
          } else {
            tryNext(idx + 1)
          }
        })
        .catch(() => tryNext(idx + 1))
    }
    tryNext(0)
  }, [slug, info.kbPath, info.displayName, info.reason, info.kubaraChart, stepsRetryNonce])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground pr-2">{info.displayName}</h3>
          <div className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap', info.installed ? 'text-green-600 dark:text-green-400 bg-green-500/10' : (STATUS_COLORS[info.status] ?? 'text-muted-foreground'))}>
            {info.installed ? 'INSTALLED' : (STATUS_LABELS[info.status] ?? info.status.toUpperCase())}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {info.category}
          </span>
          {info.maturity && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
              {info.maturity}
            </span>
          )}
          {info.priority && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
              info.priority === 'required' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
              info.priority === 'recommended' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
              'bg-gray-500/10 text-gray-500 dark:text-gray-400'
            )}>
              {info.priority}
            </span>
          )}
        </div>
      </div>

      {/* Why */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Why</h4>
        <p className="text-xs text-foreground/80 leading-relaxed">{info.reason || '—'}</p>
      </div>

      {/* Dependencies */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Dependencies</h4>
        {info.dependencies.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {info.dependencies.map((dep) => (
              <span key={dep} className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                {dep}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">None</p>
        )}
      </div>

      {/* Connections */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Connections</h4>
        {connections.length > 0 ? (
          <div className="space-y-1">
            {connections.map((edge, i) => {
              const other = edge.from === info.name ? edge.to : edge.from
              const direction = edge.from === info.name ? '→' : '←'
              return (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    edge.crossCluster ? 'bg-amber-500' : 'bg-indigo-500'
                  )} />
                  <span className="text-foreground/80">{direction} {other}</span>
                  {edge.label && (
                    <span className="text-muted-foreground">({edge.label})</span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">None</p>
        )}
      </div>

      {/* Install steps */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Install Steps</h4>
        {loadingSteps ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading...
          </div>
        ) : stepsError ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[10px] text-red-700 dark:text-red-300">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <div className="space-y-2">
                <p>{stepsError}</p>
                <button
                  type="button"
                  onClick={() => setStepsRetryNonce((prev) => prev + 1)}
                  className="font-medium text-red-700 dark:text-red-200 underline underline-offset-2 hover:text-red-900 dark:hover:text-white"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : mission?.steps && mission.steps.length > 0 ? (
          <div className="space-y-1.5">
            {mission.steps.map((step, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="text-[10px] font-bold text-primary mt-0.5 shrink-0">{i + 1}.</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{step.title || step.description?.slice(0, 60)}</p>
                  {step.command && (
                    <pre className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 bg-muted rounded px-1.5 py-0.5 overflow-x-auto whitespace-pre-wrap break-all">
                      {step.command}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">
            No install steps found in knowledge base
          </p>
        )}
      </div>
    </div>
  )
}
