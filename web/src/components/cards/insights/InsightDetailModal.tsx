/**
 * Modal for detailed insight view with Overview, Evidence, and Remediation tabs.
 *
 * Opens when clicking any insight item on the 7 insight cards. Provides
 * drill-down without leaving the dashboard context.
 */

import { useState, useRef, useEffect } from 'react'
import { Brain, CheckCircle, XCircle, Rocket, ArrowRight, AlertTriangle } from 'lucide-react'
import { BaseModal } from '../../../lib/modals/BaseModal'
import { StatusBadge } from '../../ui/StatusBadge'
import { InsightSourceBadge } from './InsightSourceBadge'
import { useInsightActions } from './useInsightActions'
import { useMissions } from '../../../hooks/useMissions'
import type { MultiClusterInsight, InsightSeverity, CascadeLink, ClusterDelta } from '../../../types/insights'
import {
  emitModalOpened, emitModalTabViewed, emitModalClosed,
  emitInsightAcknowledged, emitInsightDismissed,
  emitActionClicked, emitAISuggestionViewed } from '../../../lib/analytics'

interface InsightDetailModalProps {
  isOpen: boolean
  onClose: () => void
  insight: MultiClusterInsight | null
}

const SEVERITY_COLORS: Record<InsightSeverity, { badge: 'red' | 'yellow' | 'blue'; bg: string }> = {
  critical: { badge: 'red', bg: 'bg-red-500/10 border-red-500/20' },
  warning: { badge: 'yellow', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  info: { badge: 'blue', bg: 'bg-blue-500/10 border-blue-500/20' } }

const MODAL_TYPE = 'insight_detail'

type TabId = 'overview' | 'evidence' | 'remediation'

export function InsightDetailModal({ isOpen, onClose, insight }: InsightDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const openTimeRef = useRef<number>(0)
  const { acknowledgeInsight, dismissInsight, isAcknowledged } = useInsightActions()
  const { startMission, openSidebar } = useMissions()

  // Track open time for analytics
  useEffect(() => {
    if (isOpen && insight) {
      openTimeRef.current = Date.now()
      emitModalOpened(MODAL_TYPE, insight.category)
      setActiveTab('overview')
    }
  }, [isOpen, insight])

  const handleClose = () => {
    if (openTimeRef.current > 0) {
      const durationMs = Date.now() - openTimeRef.current
      emitModalClosed(MODAL_TYPE, durationMs)
      openTimeRef.current = 0
    }
    onClose()
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabId)
    emitModalTabViewed(MODAL_TYPE, tab)
    if (tab === 'remediation' && insight) {
      emitAISuggestionViewed(insight.category, !!insight.remediation)
    }
  }

  const handleAcknowledge = () => {
    if (!insight) return
    acknowledgeInsight(insight.id)
    emitInsightAcknowledged(insight.category, insight.severity)
  }

  const handleDismiss = () => {
    if (!insight) return
    dismissInsight(insight.id)
    emitInsightDismissed(insight.category, insight.severity)
    handleClose()
  }

  const handleCreateMission = () => {
    if (!insight) return
    emitActionClicked('create_mission', insight.category, 'insights')
    startMission({
      title: `Fix: ${insight.title}`,
      description: insight.description,
      type: 'troubleshoot',
      cluster: (insight.affectedClusters || [])[0],
      initialPrompt: `I have a ${insight.category} insight: "${insight.title}".
Affected clusters: ${(insight.affectedClusters || []).join(', ')}.
${insight.description}
${insight.remediation ? `AI suggests: ${insight.remediation}` : ''}
Help me investigate and resolve this.`,
      context: {
        insightCategory: insight.category,
        severity: insight.severity,
        affectedClusters: insight.affectedClusters } })
    openSidebar()
    handleClose()
  }

  if (!insight) return null

  const severity = SEVERITY_COLORS[insight.severity]
  const acknowledged = isAcknowledged(insight.id)
  const hasEvidence = !!(insight.chain?.length || insight.deltas?.length || insight.metrics)

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'evidence', label: 'Evidence', badge: hasEvidence ? undefined : '—' },
    { id: 'remediation', label: 'Remediation', badge: insight.remediation ? 'AI' : undefined },
  ]

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="lg">
      <BaseModal.Header
        title={insight.title}
        icon={Brain}
        onClose={handleClose}
        extra={
          <div className="flex items-center gap-2">
            <InsightSourceBadge source={insight.source} confidence={insight.confidence} />
            <StatusBadge color={severity.badge} size="sm">{insight.severity}</StatusBadge>
            {acknowledged && (
              <StatusBadge color="green" size="sm">
                <CheckCircle className="w-3 h-3 mr-1" />
                Acknowledged
              </StatusBadge>
            )}
          </div>
        }
      />
      <BaseModal.Tabs tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />
      <BaseModal.Content>
        {activeTab === 'overview' && <OverviewTab insight={insight} />}
        {activeTab === 'evidence' && <EvidenceTab insight={insight} />}
        {activeTab === 'remediation' && (
          <RemediationTab insight={insight} onCreateMission={handleCreateMission} />
        )}
      </BaseModal.Content>
      <BaseModal.Footer>
        <div className="flex flex-wrap items-center justify-between gap-y-2 w-full">
          <div className="flex items-center gap-2">
            {!acknowledged && (
              <button
                onClick={handleAcknowledge}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Acknowledge
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-secondary/50 border border-border text-muted-foreground hover:bg-secondary transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Dismiss
            </button>
          </div>
          <button
            onClick={handleCreateMission}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            <Rocket className="w-3.5 h-3.5" />
            Create Mission
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

// ── Tab Components ──────────────────────────────────────────────────────

function OverviewTab({ insight }: { insight: MultiClusterInsight }) {
  return (
    <div className="space-y-4">
      {/* Description */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-1">Description</h4>
        <p className="text-sm text-foreground">{insight.description}</p>
      </div>

      {/* Severity & source */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Severity</h4>
          <StatusBadge
            color={SEVERITY_COLORS[insight.severity].badge}
            size="md"
          >
            {insight.severity}
          </StatusBadge>
        </div>
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Source</h4>
          <InsightSourceBadge source={insight.source} confidence={insight.confidence} />
        </div>
      </div>

      {/* Detection time */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-1">Detected</h4>
        <p className="text-sm text-foreground">
          {new Date(insight.detectedAt).toLocaleString()}
        </p>
      </div>

      {/* Affected clusters */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Affected Clusters</h4>
        <div className="flex flex-wrap gap-1.5">
          {(insight.affectedClusters || []).map(cluster => (
            <StatusBadge key={cluster} color="purple" size="sm">{cluster}</StatusBadge>
          ))}
        </div>
      </div>

      {/* Related resources */}
      {insight.relatedResources && insight.relatedResources.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Related Resources</h4>
          <div className="flex flex-wrap gap-1.5">
            {(insight.relatedResources || []).map(resource => (
              <StatusBadge key={String(resource)} color="gray" size="sm">{String(resource)}</StatusBadge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EvidenceTab({ insight }: { insight: MultiClusterInsight }) {
  const hasCascade = insight.chain && insight.chain.length > 0
  const hasDeltas = insight.deltas && insight.deltas.length > 0
  const hasMetrics = insight.metrics && Object.keys(insight.metrics).length > 0

  if (!hasCascade && !hasDeltas && !hasMetrics) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Brain className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No raw evidence data available</p>
        <p className="text-xs mt-1">This insight was detected from aggregate patterns</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Cascade chain */}
      {hasCascade && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Cascade Timeline</h4>
          <div className="space-y-2">
            {(insight.chain || []).map((link: CascadeLink, i: number) => (
              <div key={`${link.cluster}-${i}`} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  link.severity === 'critical' ? 'bg-red-500' :
                  link.severity === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                }`} />
                <div className="flex-1 flex items-center gap-2 text-xs">
                  <StatusBadge color="purple" size="xs">{link.cluster}</StatusBadge>
                  <span className="text-muted-foreground">{link.resource}</span>
                  <AlertTriangle className="w-3 h-3 text-yellow-400" />
                  <span className="text-foreground">{link.event}</span>
                  <span className="text-muted-foreground ml-auto text-2xs">
                    {new Date(link.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {i < (insight.chain || []).length - 1 && (
                  <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cluster deltas */}
      {hasDeltas && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Cluster Differences</h4>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/30">
                  <th className="text-left p-2 font-medium text-muted-foreground">Dimension</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Cluster A</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Cluster B</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Significance</th>
                </tr>
              </thead>
              <tbody>
                {(insight.deltas || []).map((delta: ClusterDelta, i: number) => (
                  <tr key={`${delta.dimension}-${i}`} className="border-t border-border/50">
                    <td className="p-2 font-medium text-foreground">{delta.dimension}</td>
                    <td className="p-2">
                      <span className="text-blue-400">{delta.clusterA.name}:</span>{' '}
                      <span className="text-foreground">{String(delta.clusterA.value)}</span>
                    </td>
                    <td className="p-2">
                      <span className="text-yellow-400">{delta.clusterB.name}:</span>{' '}
                      <span className="text-foreground">{String(delta.clusterB.value)}</span>
                    </td>
                    <td className="p-2">
                      <StatusBadge
                        color={delta.significance === 'high' ? 'red' : delta.significance === 'medium' ? 'yellow' : 'gray'}
                        size="xs"
                      >
                        {delta.significance}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resource metrics */}
      {hasMetrics && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Resource Metrics</h4>
          <div className="space-y-2">
            {Object.entries(insight.metrics || {}).map(([name, value]) => (
              <div key={name} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-32 truncate" title={name}>{name}</span>
                <div className="flex-1 bg-secondary/30 rounded-full h-2">
                  <div
                    className="h-full rounded-full bg-blue-500/60 transition-all"
                    style={{ width: `${Math.min(value, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-foreground w-12 text-right">{value}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RemediationTab({ insight, onCreateMission }: { insight: MultiClusterInsight; onCreateMission: () => void }) {
  return (
    <div className="space-y-4">
      {insight.remediation ? (
        <>
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <StatusBadge color="blue" size="sm">AI Suggestion</StatusBadge>
              {insight.provider && (
                <span className="text-2xs text-muted-foreground">via {insight.provider}</span>
              )}
            </div>
            <p className="text-sm text-foreground">{insight.remediation}</p>
          </div>

          <button
            onClick={onCreateMission}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm"
          >
            <Rocket className="w-4 h-4" />
            Apply with AI Mission
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Brain className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">No AI remediation available</p>
          <p className="text-xs mt-1">Connect kc-agent for AI-powered suggestions</p>
          <button
            onClick={onCreateMission}
            className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm"
          >
            <Rocket className="w-4 h-4" />
            Create Manual Mission
          </button>
        </div>
      )}
    </div>
  )
}
