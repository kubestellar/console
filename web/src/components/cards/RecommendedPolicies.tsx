/**
 * Recommended Policies — AI-powered policy gap analysis across the fleet.
 *
 * Analyzes which compliance tools and policies are deployed across clusters,
 * identifies gaps, and offers one-click AI missions to deploy recommended
 * policies fleet-wide. This is the showcase of multi-cluster-first AI
 * that saves time and tokens.
 */

import { useMemo, useState } from 'react'
import { Sparkles, Shield, ChevronRight, CheckCircle2, AlertTriangle, Zap, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ProgressRing } from '../ui/ProgressRing'
import { useCardLoadingState } from './CardDataContext'
import { useKyverno } from '../../hooks/useKyverno'
import { useKubescape } from '../../hooks/useKubescape'
import { useTrivy } from '../../hooks/useTrivy'
import { useClusters } from '../../hooks/useMCP'
import { useMissions } from '../../hooks/useMissions'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode } from '../../hooks/useDemoMode'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { StatusBadge } from '../ui/StatusBadge'
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_BG,
  SEVERITY_COLORS,
  KYVERNO_POLICY_PATTERNS,
  POLICY_DEFINITIONS,
} from './RecommendedPolicies.data'
import type { RecommendationCategory, PolicyRecommendation } from './RecommendedPolicies.data'

interface CardConfig {
  config?: Record<string, unknown>
}

// ─── Component ──────────────────────────────────────────────────────

function RecommendedPoliciesInternal({ config: _config }: CardConfig) {
  const { t } = useTranslation('cards')
  const { statuses: kyvernoStatuses, isLoading: kyvernoLoading, isRefreshing: kyvernoRefreshing, installed: kyvernoInstalled, isDemoData: kyvernoDemoData, clustersChecked: kyvernoChecked, totalClusters: kyvernoTotal } = useKyverno()
  const { isLoading: kubescapeLoading, isRefreshing: kubescapeRefreshing, installed: kubescapeInstalled, isDemoData: kubescapeDemoData, clustersChecked: kubescapeChecked, totalClusters: kubescapeTotal } = useKubescape()
  const { isLoading: trivyLoading, isRefreshing: trivyRefreshing, installed: trivyInstalled, isDemoData: trivyDemoData, clustersChecked: trivyChecked, totalClusters: trivyTotal } = useTrivy()
  const { deduplicatedClusters, isFailed, consecutiveFailures } = useClusters()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const { isDemoMode } = useDemoMode()
  const [expandedCategory, setExpandedCategory] = useState<RecommendationCategory | null>(null)

  // Card is only "loading" when ALL tools are still loading — show partial results ASAP
  const isLoading = kyvernoLoading && kubescapeLoading && trivyLoading
  const isDemoData = isDemoMode || kyvernoDemoData || kubescapeDemoData || trivyDemoData

  /** Combined progressive streaming progress across all three tools */
  const totalChecking = Math.max(kyvernoTotal, kubescapeTotal, trivyTotal)
  const minChecked = Math.min(kyvernoChecked, kubescapeChecked, trivyChecked)
  const allChecked = minChecked >= totalChecking && totalChecking > 0

  // Build recommendations from real cluster data
  const { recommendations, fleetCoverage, totalGaps } = useMemo(() => {
    const totalClusters = (deduplicatedClusters || []).length
    const recs: PolicyRecommendation[] = []

    // Evaluate each policy definition against real cluster data
    for (const def of POLICY_DEFINITIONS) {
      const coveredClusters: string[] = []
      const eligibleClusters: string[] = []

      if (def.tool === 'kyverno') {
        for (const [clusterName, status] of Object.entries(kyvernoStatuses)) {
          if (!status.installed) continue
          if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
          eligibleClusters.push(clusterName)

          // Check if any policy name matches the pattern
          const hasPolicy = (status.policies || []).some(p => {
            const policyLower = p.name.toLowerCase()
            // Check all known pattern keys for this recommendation
            for (const [pattern, recId] of Object.entries(KYVERNO_POLICY_PATTERNS)) {
              if (recId === def.id && policyLower.includes(pattern)) return true
            }
            return false
          })

          if (hasPolicy) coveredClusters.push(clusterName)
        }
      }

      recs.push({
        ...def,
        coveredClusters,
        eligibleClusters,
        totalClusters: Math.max(totalClusters, eligibleClusters.length) })
    }

    // Calculate fleet-wide coverage
    const totalPossible = recs.reduce((sum, r) => sum + Math.max(r.eligibleClusters.length, 1), 0)
    const totalCovered = recs.reduce((sum, r) => sum + r.coveredClusters.length, 0)
    const coverage = totalPossible > 0 ? Math.round((totalCovered / totalPossible) * 100) : 0

    // Count gaps (recommendations not fully deployed)
    const gaps = recs.filter(r => r.coveredClusters.length < r.eligibleClusters.length).length

    return { recommendations: recs, fleetCoverage: coverage, totalGaps: gaps }
  }, [kyvernoStatuses, deduplicatedClusters, selectedClusters])

  // Group by category
  const grouped = (() => {
    const groups = new Map<RecommendationCategory, PolicyRecommendation[]>()
    for (const rec of recommendations) {
      const existing = groups.get(rec.category) || []
      existing.push(rec)
      groups.set(rec.category, existing)
    }
    return groups
  })()

  // Count category gaps
  const categoryGaps = (() => {
    const gaps = new Map<RecommendationCategory, number>()
    for (const [cat, recs] of grouped.entries()) {
      gaps.set(cat, recs.filter(r => r.coveredClusters.length < r.eligibleClusters.length).length)
    }
    return gaps
  })()

  const hasAnyData = kyvernoInstalled || kubescapeInstalled || trivyInstalled || isDemoData
  useCardLoadingState({ isLoading: isLoading && !hasAnyData, isRefreshing: kyvernoRefreshing || kubescapeRefreshing || trivyRefreshing, hasAnyData, isDemoData, isFailed, consecutiveFailures })

  const handleDeployAll = () => {
    const gaps = recommendations.filter(r => r.coveredClusters.length < r.eligibleClusters.length)
    if (gaps.length === 0) return

    const policyList = gaps.map(g => `- ${g.name}`).join('\n')
    const clusterSet = new Set<string>()
    for (const g of gaps) {
      for (const c of g.eligibleClusters) {
        if (!g.coveredClusters.includes(c)) clusterSet.add(c)
      }
    }

    startMission({
      title: 'Deploy All Recommended Policies',
      description: `Deploy ${gaps.length} missing policies across ${clusterSet.size} clusters`,
      type: 'deploy',
      initialPrompt: `Deploy all recommended compliance policies that are currently missing across my fleet.

Missing policies to deploy:
${policyList}

Target clusters: ${Array.from(clusterSet).join(', ')}

Important:
- ALL policies must be in Audit mode (validationFailureAction: Audit) — NEVER enforce
- Set background: true on all policies to scan existing resources
- Add appropriate category annotations
- After deploying, verify PolicyReports are being generated on each cluster

Deploy each policy to every cluster where it's missing. Proceed cluster by cluster, confirming success before moving to the next.`,
      context: { recommendations: gaps.map(g => ({ name: g.name, id: g.id, missingOn: g.eligibleClusters.filter(c => !g.coveredClusters.includes(c)) })) } })
  }

  const handleDeployOne = (rec: PolicyRecommendation) => {
    const missingClusters = rec.eligibleClusters.filter(c => !rec.coveredClusters.includes(c))
    if (missingClusters.length === 0) return

    startMission({
      title: `Deploy: ${rec.name}`,
      description: `Deploy ${rec.name} to ${missingClusters.length} cluster${missingClusters.length === 1 ? '' : 's'}`,
      type: 'deploy',
      initialPrompt: rec.missionPrompt + `\n\nTarget clusters: ${missingClusters.join(', ')}`,
      context: { policy: rec.id, clusters: missingClusters } })
  }

  // No tools installed — prompt to get started (but only after scanning is complete)
  if (!kyvernoInstalled && !kubescapeInstalled && !trivyInstalled && !isDemoData) {
    // Still scanning — show loading state only while NO tool has finished yet
    if (isLoading) {
      return (
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center py-6 text-center">
            {totalChecking > 0 ? (
              <ProgressRing progress={minChecked / totalChecking} size={32} strokeWidth={2.5} className="mb-3" />
            ) : (
              <Loader2 className="w-8 h-8 text-muted-foreground/50 mb-3 animate-spin" />
            )}
            <p className="text-sm font-medium text-foreground">Scanning clusters...</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
              Detecting compliance tools across your fleet
            </p>
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Shield className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No Compliance Tools Detected</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
            Install Kyverno, Kubescape, or Trivy to get AI-powered policy recommendations across your fleet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Fleet coverage summary */}
      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 border border-border/50">
        <div className="relative w-12 h-12 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
            <circle
              cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3"
              strokeDasharray={`${fleetCoverage}, 100`}
              className={fleetCoverage >= 80 ? 'text-green-400' : fleetCoverage >= 50 ? 'text-yellow-400' : 'text-red-400'}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-foreground">{fleetCoverage}%</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Fleet Coverage</p>
          <p className="text-xs text-muted-foreground">
            {totalGaps > 0
              ? <>{totalGaps} policy {totalGaps === 1 ? 'gap' : 'gaps'} across your fleet</>
              : 'All recommended policies deployed'
            }
          </p>
        </div>
        {totalGaps > 0 && (
          <button
            onClick={handleDeployAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-medium hover:bg-purple-500/30 transition-colors whitespace-nowrap"
            title="Deploy all missing policies with a single AI mission"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Deploy All
          </button>
        )}
      </div>

      {/* Inline progress ring while still scanning remaining tools */}
      {!allChecked && !isLoading && (kyvernoLoading || kubescapeLoading || trivyLoading) && totalChecking > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ProgressRing progress={minChecked / totalChecking} size={14} strokeWidth={1.5} />
          <span>{t('recommendedPolicies.scanningClusters')}</span>
        </div>
      )}

      {/* Category sections */}
      <div className="space-y-1.5">
        {Array.from(grouped.entries()).map(([category, recs]) => {
          const gaps = categoryGaps.get(category) || 0
          const isExpanded = expandedCategory === category

          return (
            <div key={category}>
              {/* Category header */}
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : category)}
                className={`w-full flex flex-wrap items-center justify-between gap-y-2 p-2 rounded-lg border transition-colors ${
                  isExpanded ? CATEGORY_BG[category] : 'bg-secondary/20 border-transparent hover:bg-secondary/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''} ${CATEGORY_COLORS[category]}`} />
                  <span className={`text-xs font-medium ${CATEGORY_COLORS[category]}`}>
                    {CATEGORY_LABELS[category]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {gaps > 0 ? (
                    <StatusBadge color="yellow" size="xs">{gaps} gap{gaps !== 1 ? 's' : ''}</StatusBadge>
                  ) : (
                    <StatusBadge color="green" size="xs">
                      <CheckCircle2 className="w-3 h-3 mr-0.5" />
                      covered
                    </StatusBadge>
                  )}
                </div>
              </button>

              {/* Expanded policy list */}
              {isExpanded && (
                <div className="mt-1 space-y-1 pl-2">
                  {recs.map(rec => {
                    const isCovered = rec.coveredClusters.length >= rec.eligibleClusters.length && rec.eligibleClusters.length > 0
                    const coverageRatio = rec.eligibleClusters.length > 0
                      ? `${rec.coveredClusters.length}/${rec.eligibleClusters.length}`
                      : '0/0'
                    const missingCount = rec.eligibleClusters.length - rec.coveredClusters.length

                    return (
                      <div
                        key={rec.id}
                        className="flex items-start gap-2 p-2 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors"
                      >
                        {isCovered ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${SEVERITY_COLORS[rec.severity]}`} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground truncate">{rec.name}</span>
                            <span className={`text-2xs ${SEVERITY_COLORS[rec.severity]}`}>
                              {rec.severity}
                            </span>
                          </div>
                          <p className="text-2xs text-muted-foreground mt-0.5 line-clamp-2">{rec.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-2xs text-muted-foreground">
                              {coverageRatio} clusters
                            </span>
                            {/* Mini progress bar */}
                            {rec.eligibleClusters.length > 0 && (
                              <div className="flex-1 h-1 rounded-full bg-secondary max-w-[80px]">
                                <div
                                  className={`h-full rounded-full ${isCovered ? 'bg-green-400' : 'bg-yellow-400'}`}
                                  style={{ width: `${(rec.coveredClusters.length / rec.eligibleClusters.length) * 100}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        {!isCovered && missingCount > 0 && (
                          <button
                            onClick={() => handleDeployOne(rec)}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/15 text-purple-400 text-2xs font-medium hover:bg-purple-500/25 transition-colors shrink-0"
                            title={`Deploy to ${missingCount} cluster${missingCount === 1 ? '' : 's'} with AI`}
                          >
                            <Zap className="w-3 h-3" />
                            Deploy
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* AI value prop footer */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
        <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <p className="text-2xs text-muted-foreground">
          <span className="text-purple-400 font-medium">AI-powered</span> — One click deploys policies across your entire fleet
        </p>
      </div>
    </div>
  )
}

export function RecommendedPolicies({ config }: CardConfig) {
  return (
    <DynamicCardErrorBoundary cardId="RecommendedPolicies">
      <RecommendedPoliciesInternal config={config} />
    </DynamicCardErrorBoundary>
  )
}
