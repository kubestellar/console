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
  CheckCircle,
  ExternalLink,
  AlertCircle,
  ShieldCheck,
  XCircle,
  MinusCircle,
  Link2,
  Loader2,
} from 'lucide-react'
import { ProgressRing } from '../ui/ProgressRing'
import { CardSearchInput } from '../../lib/cards/CardComponents'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useIntoto } from '../../hooks/useIntoto'
import { useMissions } from '../../hooks/useMissions'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { StatusBadge } from '../ui/StatusBadge'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import type { IntotoLayout, IntotoStep } from '../../hooks/useIntoto'

interface IntotoSupplyChainProps {
  config?: Record<string, unknown>
}

/** Icon and colour for each step verification status */
const STEP_STATUS_CONFIG: Record<
  IntotoStep['status'],
  { icon: typeof CheckCircle; color: string; label: string }
> = {
  verified: { icon: CheckCircle, color: 'text-green-400', label: 'Verified' },
  failed: { icon: XCircle, color: 'text-red-400', label: 'Failed' },
  missing: { icon: MinusCircle, color: 'text-yellow-400', label: 'Missing' },
  unknown: { icon: AlertCircle, color: 'text-muted-foreground', label: 'Unknown' },
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
    refetch,
    clustersChecked,
    totalClusters,
  } = useIntoto()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [localSearch, setLocalSearch] = useState('')
  const [expandedLayout, setExpandedLayout] = useState<string | null>(null)

  // Aggregate all layouts across clusters, filtered by global cluster filter
  const allLayouts = useMemo<IntotoLayout[]>(() => {
    const layouts: IntotoLayout[] = []
    for (const [clusterName, status] of Object.entries(statuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      layouts.push(...(status.layouts || []))
    }
    return layouts
  }, [statuses, selectedClusters])

  // Aggregate stats across filtered clusters
  const stats = useMemo(() => {
    let totalLayouts = 0
    let verifiedSteps = 0
    let failedSteps = 0
    for (const [clusterName, status] of Object.entries(statuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      totalLayouts += status.totalLayouts
      verifiedSteps += status.verifiedSteps
      failedSteps += status.failedSteps
    }
    return { totalLayouts, verifiedSteps, failedSteps }
  }, [statuses, selectedClusters])

  // Filter layouts by local search
  const filteredLayouts = useMemo(() => {
    if (!localSearch.trim()) return allLayouts
    const query = localSearch.toLowerCase()
    return allLayouts.filter(layout =>
      (layout.name ?? '').toLowerCase().includes(query) ||
      (layout.cluster ?? '').toLowerCase().includes(query) ||
      (layout.steps || []).some(s => (s.name ?? '').toLowerCase().includes(query))
    )
  }, [allLayouts, localSearch])

  const hasData = installed || isDemoData
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
  })

  const handleInstall = () => {
    startMission({
      title: 'Install in-toto',
      description: 'Set up in-toto supply chain security on your clusters',
      type: 'deploy',
      initialPrompt: `I want to install in-toto for supply chain security on my Kubernetes clusters.

Please help me:
1. Install the in-toto admission controller via Helm
2. Create a sample layout policy covering build and deploy steps
3. Verify the CRDs are registered: layouts.in-toto.io and links.in-toto.io

Use the official in-toto Kubernetes integration:
  helm repo add in-toto https://in-toto.github.io/helm-charts
  helm install in-toto in-toto/in-toto --namespace in-toto --create-namespace

Important: Start in audit/dry-run mode to avoid blocking existing workloads.

Please proceed step by step.`,
      context: {},
    })
  }

  const handleDeploySampleLayouts = () => {
    startMission({
      title: 'Deploy Sample in-toto Layouts',
      description: 'Create example supply chain layouts to see in-toto in action',
      type: 'deploy',
      initialPrompt: `Deploy sample in-toto layouts so I can see the supply chain security dashboard in action.

Please create 3 sample in-toto Layout CRs covering a typical CI/CD pipeline:

1. **build-and-push** — Steps: clone-repo → run-tests → build-image → push-image
2. **deploy-pipeline** — Steps: pull-image → scan-image → apply-manifests
3. **release-signing** — Steps: sign-artifact → upload-provenance

Important:
- Add the annotation in-toto.io/mode: "audit" on all layouts
- Set functionary pubkeys to placeholder values (demo mode)
- After applying, verify with: kubectl get layouts.in-toto.io -A
- Check links: kubectl get links.in-toto.io -A

Please proceed step by step.`,
      context: {},
    })
  }

  // Detect degraded state: installed but no layouts configured
  const isDegraded = useMemo(() => {
    if (!installed || isLoading) return false
    const installedClusters = Object.values(statuses).filter(s => s.installed)
    return installedClusters.length > 0 && installedClusters.every(s => s.totalLayouts === 0)
  }, [installed, isLoading, statuses])

  const getLayoutHealthColor = (layout: IntotoLayout) => {
    if (layout.failedSteps > 0) return 'yellow'
    if (layout.verifiedSteps === layout.steps.length && layout.steps.length > 0) return 'green'
    return 'blue'
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Controls */}
      <div className="flex items-center justify-end gap-1 mb-3">
        <RefreshIndicator isRefreshing={isRefreshing} lastUpdated={lastRefresh} size="xs" />
        <a
          href="https://in-toto.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-cyan-400"
          title={t('cards:intotoSupplyChain.documentation')}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Inline progress ring while scanning */}
      {(isLoading || isRefreshing) && !installed && !isDemoData && (
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          {totalClusters > 0 ? (
            <ProgressRing progress={clustersChecked / totalClusters} size={14} strokeWidth={1.5} />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          )}
          <span>{t('intotoSupplyChain.scanningClusters')}</span>
        </div>
      )}

      {/* Fetch error state */}
      {hasErrors && !isDemoData && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">Failed to fetch supply chain data</p>
            <p className="text-muted-foreground">
              Check API connectivity or in-toto service status.{' '}
              <button onClick={() => refetch()} className="text-red-400 hover:underline">
                Retry →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Install prompt when not detected and no errors (only after scanning completes) */}
      {!installed && !isLoading && !isRefreshing && !hasErrors && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">in-toto Integration</p>
            <p className="text-muted-foreground">
              Install in-toto for supply chain security verification.{' '}
              <button onClick={handleInstall} className="text-cyan-400 hover:underline">
                Install with an AI Mission →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Per-cluster badges — click to expand cluster detail */}
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
          <Link2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">No Layouts Configured</p>
            <p className="text-muted-foreground">
              in-toto is installed but has no supply chain layouts.{' '}
              <button
                onClick={handleDeploySampleLayouts}
                disabled={isLoading}
                className="text-cyan-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Deploy sample layouts with AI →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-center">
          <p className="text-2xs text-cyan-400">Layouts</p>
          <p className="text-lg font-bold text-foreground">{stats.totalLayouts}</p>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-2xs text-green-400">Verified</p>
          <p className="text-lg font-bold text-foreground">{stats.verifiedSteps}</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-2xs text-red-400">Failed</p>
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
      <div className="flex-1 overflow-y-auto space-y-2">
        <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mb-2">
          <ShieldCheck className="w-3 h-3" />
          {isDemoData ? 'Sample Layouts' : `${filteredLayouts.length} Layouts`}
        </p>

        {(filteredLayouts || []).map((layout, i) => {
          const isExpanded = expandedLayout === `${layout.cluster}-${layout.name}`
          const healthColor = getLayoutHealthColor(layout)

          return (
            <div
              key={`${layout.cluster}-${layout.name}-${i}`}
              className="rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              {/* Layout header row */}
              <button
                className="w-full p-2.5 text-left"
                onClick={() =>
                  setExpandedLayout(isExpanded ? null : `${layout.cluster}-${layout.name}`)
                }
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} layout: ${layout.name} on ${layout.cluster}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground truncate">
                    {layout.name}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {layout.failedSteps > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <XCircle className="w-3 h-3" />
                        {layout.failedSteps}
                      </span>
                    )}
                    <StatusBadge color={healthColor} size="xs">
                      {layout.verifiedSteps}/{layout.steps.length}
                    </StatusBadge>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{layout.steps.length} steps</span>
                  <span className="text-2xs">{layout.cluster}</span>
                </div>
              </button>

              {/* Expanded steps */}
              {isExpanded && (
                <div className="px-2.5 pb-2.5 space-y-1 border-t border-border/30 pt-2">
                  {(layout.steps || []).map((step, si) => {
                    const cfg = STEP_STATUS_CONFIG[step.status]
                    const StatusIcon = cfg.icon
                    return (
                      <div
                        key={`${step.name}-${si}`}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className={`w-3 h-3 ${cfg.color} flex-shrink-0`} />
                          <span className="text-foreground">{step.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="text-2xs">{step.functionary}</span>
                          <span className={`text-2xs ${cfg.color}`}>{cfg.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Features highlight */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-2xs text-muted-foreground font-medium mb-2">in-toto Features</p>
        <div className="grid grid-cols-2 gap-1.5 text-2xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Step Verification
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Provenance Tracking
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Functionary Signing
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            SLSA Compliance
          </div>
        </div>
      </div>

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-2xs">
        <a
          href="https://in-toto.io/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          Documentation
        </a>
        <span className="text-muted-foreground/30">·</span>
        <a
          href="https://github.com/in-toto/in-toto"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          GitHub
        </a>
        <span className="text-muted-foreground/30">·</span>
        <a
          href="https://slsa.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          SLSA
        </a>
      </div>
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
