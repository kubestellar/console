/**
 * ClusterAssignmentPanel — Phase 2 of Mission Control.
 *
 * Split view: cluster readiness cards on left, assignment matrix on right.
 * AI recommendations overlay.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { Loader2, Wand2, Shuffle, LayoutGrid, Table } from 'lucide-react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '../ui/Button'
import { ClusterReadinessCard } from './ClusterReadinessCard'
import { AssignmentMatrix } from './AssignmentMatrix'
import type { MissionControlState, PayloadProject } from './types'
import type { Mission } from '../../hooks/useMissions'

// Import cluster data hook
import { useClusters } from '../../hooks/mcp/clusters'
import { useHelmReleases } from '../../hooks/mcp/helm'

type ViewMode = 'cards' | 'matrix'

interface ClusterAssignmentPanelProps {
  state: MissionControlState
  onAskAI: (projects: PayloadProject[], clustersJson: string) => void
  onAutoAssign: (clusters: Array<{ name: string; context?: string; distribution?: string; cpuCores?: number; memoryGB?: number; storageGB?: number; cpuUsageCores?: number; cpuRequestsCores?: number; memoryUsageGB?: number; memoryRequestsGB?: number }>) => void
  onSetAssignment: (clusterName: string, projectName: string, assigned: boolean) => void
  aiStreaming: boolean
  planningMission?: Mission | null
  /** Map of projectName → Set<clusterName> for projects already installed */
  installedOnCluster?: Map<string, Set<string>>
}

export function ClusterAssignmentPanel({
  state,
  onAskAI,
  onAutoAssign,
  onSetAssignment,
  aiStreaming,
  planningMission,
  installedOnCluster = new Map() }: ClusterAssignmentPanelProps) {
  // Use deduplicatedClusters so multiple kubeconfig contexts pointing at the
  // same physical cluster (e.g. several user identities for the same
  // OpenShift API server) collapse into a single picker entry. Using the raw
  // `clusters` field surfaces every context, which produced rows like
  // "Andrew.Anderson@ibm.com" repeated four times.
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()
  const { releases: helmReleases } = useHelmReleases()
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [, setAutoAssignDone] = useState(false)
  // Cluster set is owned by Define Mission (state.targetClusters); the panel
  // no longer maintains a local excluded set.
  const excludedClusters = useMemo(() => new Set<string>(), [])

  // Healthy clusters only — sort by name for stable ordering when toggling projects (#4548).
  // ALSO scope to state.targetClusters when the user picked a subset on the
  // previous step (Define Mission > TARGET CLUSTERS). Without this filter,
  // the user picks 1 cluster and Chart Your Course shows all 5 — which both
  // misleads the AI and wastes the user's earlier scoping choice. An empty
  // targetClusters list means "all clusters" (the default state when the
  // user hasn't narrowed down).
  const targetClustersSet = useMemo(
    () => new Set(state.targetClusters || []),
    [state.targetClusters]
  )
  const allHealthyClusters = useMemo(
    () => clusters
      .filter((c) => c.healthy !== false && c.reachable !== false)
      .filter((c) => targetClustersSet.size === 0 || targetClustersSet.has(c.name))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [clusters, targetClustersSet]
  )
  // Active clusters = healthy minus excluded
  const healthyClusters = allHealthyClusters.filter((c) => !excludedClusters.has(c.name))

  const projectNames = state.projects.map((p) => p.name)

  // Generate per-cluster inspection notes from helm release data
  const clusterInspectionNotes = useMemo(() => {
    const notes = new Map<string, string[]>()
    if (!helmReleases?.length) return notes
    for (const cluster of healthyClusters) {
      const clusterReleases = helmReleases.filter(r =>
        r.cluster === cluster.name ||
        r.cluster === cluster.context ||
        (r.cluster && (r.cluster.includes(cluster.name) || cluster.name.includes(r.cluster)))
      )
      if (clusterReleases.length === 0) continue
      const clusterNotes: string[] = []
      for (const project of state.projects) {
        const pName = project.name.toLowerCase()
        const match = clusterReleases.find(r =>
          r.name.toLowerCase().includes(pName) ||
          (r.chart && r.chart.toLowerCase().includes(pName)) ||
          (r.namespace && r.namespace.toLowerCase().includes(pName))
        )
        if (match) {
          const ns = match.namespace ? ` in '${match.namespace}' namespace` : ''
          clusterNotes.push(`${project.displayName} already running${ns} (${match.name}) — skip install`)
        }
      }
      if (clusterNotes.length > 0) notes.set(cluster.name, clusterNotes)
    }
    return notes
  }, [helmReleases, healthyClusters, state.projects])

  const handleAutoAssign = () => {
    if (healthyClusters.length === 0) return
    onAutoAssign(healthyClusters)
    setAutoAssignDone(true)
  }

  const handleAISuggest = () => {
    if (healthyClusters.length === 0) return
    const clustersJson = JSON.stringify(
      healthyClusters.map((c) => ({
        name: c.name,
        context: c.context,
        provider: c.distribution || 'kubernetes',
        nodeCount: c.nodeCount,
        cpuCores: c.cpuCores,
        memoryGB: c.memoryGB,
        storageGB: c.storageGB,
        cpuUsageCores: c.cpuUsageCores,
        memoryUsageGB: c.memoryUsageGB,
        namespaces: c.namespaces?.length ?? 0 })),
      null,
      2
    )
    onAskAI(state.projects, clustersJson)
  }

  // Cluster picker no longer lives on this panel — selection is owned by
  // Define Mission's TARGET CLUSTERS picker. Nothing to auto-open here.

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1">Chart Your Course</h2>
          <p className="text-sm text-muted-foreground">
            Assign {state.projects.length} project{state.projects.length !== 1 ? 's' : ''} to
            your clusters. AI analyzes readiness and suggests optimal distribution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('cards')}
              className={`!p-1.5 !rounded-none ${viewMode === 'cards' ? 'bg-primary/10 text-primary' : ''}`}
              title="Card view"
              icon={<LayoutGrid className="w-4 h-4" />}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('matrix')}
              className={`!p-1.5 !rounded-none ${viewMode === 'matrix' ? 'bg-primary/10 text-primary' : ''}`}
              title="Matrix view"
              icon={<Table className="w-4 h-4" />}
            />
          </div>

          {/* Cluster count — passive display. Cluster selection is owned by
              Define Mission > TARGET CLUSTERS so there's a single source of
              truth for the mission scope. To change the cluster mix, the user
              goes back one step. */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-secondary/50 text-xs text-muted-foreground"
            title="Cluster selection is set in the Define Mission step"
          >
            <span className="font-medium text-foreground">{healthyClusters.length}</span>
            <span>cluster{healthyClusters.length === 1 ? '' : 's'}</span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleAutoAssign}
            disabled={aiStreaming || healthyClusters.length === 0}
            icon={<Shuffle className="w-3.5 h-3.5" />}
            title="Balance projects across clusters by compute, category, and install status"
          >
            Auto-Assign
          </Button>
          <Button
            variant="secondary"
            size="sm"
            data-testid="mission-control-ask-ai"
            onClick={handleAISuggest}
            disabled={aiStreaming || healthyClusters.length === 0}
            icon={
              aiStreaming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )
            }
            title="AI analyzes clusters and suggests assignments with detailed notes"
          >
            {aiStreaming ? 'Analyzing...' : 'Suggest & Refine'}
          </Button>
        </div>
      </div>

      {/* AI streaming — inline preview */}
      {aiStreaming && (
        <AIAssignmentStreamPreview planningMission={planningMission} />
      )}

      {/* Clusters loading */}
      {clustersLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading clusters...</span>
        </div>
      )}

      {/* No clusters */}
      {!clustersLoading && healthyClusters.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm font-medium">No healthy clusters found</p>
          <p className="text-xs mt-1">
            Connect clusters via the Clusters page or start the kc-agent
          </p>
        </div>
      )}

      {/* Content */}
      {!clustersLoading && healthyClusters.length > 0 && (
        <>
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {healthyClusters.map((cluster) => {
                const aiAssignment = state.assignments.find((a) => a.clusterName === cluster.name)
                const helmNotes = clusterInspectionNotes.get(cluster.name) ?? []
                // Merge helm-generated notes with AI warnings (dedupe by checking if AI already mentions the project)
                const mergedAssignment = aiAssignment && helmNotes.length > 0
                  ? {
                      ...aiAssignment,
                      warnings: [
                        ...helmNotes.filter(note => {
                          // Don't add helm note if AI already has a warning about the same project
                          const aiWarnings = aiAssignment.warnings ?? []
                          return !aiWarnings.some(w => {
                            // Compare by checking if both mention the same project name
                            const noteProject = note.split(' already')[0].toLowerCase()
                            return w.toLowerCase().includes(noteProject)
                          })
                        }),
                        ...(aiAssignment.warnings ?? []),
                      ] }
                  : aiAssignment
                return (
                <div key={cluster.name} data-testid={`mission-control-cluster-${cluster.name}`}>
                <ClusterReadinessCard
                  cluster={cluster}
                  assignment={mergedAssignment}
                  onToggleProject={(name, assigned) =>
                    onSetAssignment(cluster.name, name, assigned)
                  }
                  availableProjects={projectNames}
                  isRecommended={state.assignments.some(
                    (a) => a.clusterName === cluster.name && a.projectNames.length > 0
                  )}
                  installedOnCluster={installedOnCluster}
                />
                </div>
                )
              })}
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <AssignmentMatrix
                projects={state.projects}
                clusters={healthyClusters}
                assignments={state.assignments}
                onToggle={onSetAssignment}
              />
            </div>
          )}

          {/* Phase summary */}
          {state.phases.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-medium mb-2">Deployment Phases</h3>
              <div className="flex flex-wrap gap-2">
                {state.phases.map((phase) => (
                  <div
                    key={phase.phase}
                    className="px-3 py-2 rounded-lg bg-secondary/50 border border-border"
                  >
                    <div className="text-xs font-medium">
                      Phase {phase.phase}: {phase.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {(phase.projectNames || []).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Assignment Stream Preview — shows live AI text during cluster assignment
// ---------------------------------------------------------------------------

function AIAssignmentStreamPreview({ planningMission }: { planningMission?: Mission | null }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const latestMsg = planningMission?.messages
    .filter((m) => m.role === 'assistant')
    .slice(-1)[0]

  const rawText = latestMsg?.content ?? ''
  const displayText = rawText
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [displayText])

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg bg-primary/5 border border-primary/20 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-primary/10">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        <span className="text-xs font-semibold text-primary">AI is analyzing cluster readiness...</span>
      </div>
      <div
        ref={scrollRef}
        className="px-4 py-3 max-h-40 overflow-y-auto text-xs text-foreground/80 leading-relaxed prose prose-invert prose-xs max-w-none [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_p]:my-1 [&_strong]:text-foreground/90"
      >
        {displayText ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {displayText}
          </ReactMarkdown>
        ) : (
          <span className="text-muted-foreground/60 italic">Analyzing clusters...</span>
        )}
        <span className="inline-block w-1.5 h-3.5 bg-primary/60 ml-0.5 animate-pulse align-text-bottom" />
      </div>
    </motion.div>
  )
}
