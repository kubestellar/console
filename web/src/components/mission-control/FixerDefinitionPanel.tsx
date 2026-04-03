/**
 * FixerDefinitionPanel — Phase 1 of Mission Control.
 *
 * Left: textarea + AI suggestions + PayloadGrid.
 * Right: Info panel showing hovered project details, mission steps, and alternatives.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Loader2, Plus, Search, Info, Shield, Eye, Network, Box, Lock, Layers, Server, X as XIcon } from 'lucide-react'
import { Button } from '../ui/Button'
import { PayloadGrid } from './PayloadGrid'
import type { MissionControlState, PayloadProject } from './types'
import type { Mission } from '../../hooks/useMissions'
import { fetchMissionContent } from '../missions/browser/missionCache'
import type { MissionExport } from '../../lib/missions/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../lib/cn'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'

const PLACEHOLDER_EXAMPLES = [
  'Production-grade security compliance with runtime protection and policy enforcement...',
  'Full observability stack with metrics, tracing, and log aggregation across 3 clusters...',
  'Service mesh with mTLS, traffic management, and canary deployments...',
  'GitOps continuous delivery with automated rollbacks and multi-cluster sync...',
  'Edge computing platform with lightweight clusters and workload distribution...',
]

interface FixerDefinitionPanelProps {
  state: MissionControlState
  onDescriptionChange: (desc: string) => void
  onTitleChange: (title: string) => void
  onTargetClustersChange: (clusters: string[]) => void
  onAskAI: (description: string, existing?: PayloadProject[]) => void
  onAddProject: (project: PayloadProject) => void
  onRemoveProject: (name: string) => void
  onUpdatePriority: (name: string, priority: PayloadProject['priority']) => void
  onReplaceProject?: (oldName: string, newProject: PayloadProject) => void
  aiStreaming: boolean
  planningMission: Mission | null | undefined
  installedProjects?: Set<string>
}

export function FixerDefinitionPanel({
  state,
  onDescriptionChange,
  onTitleChange,
  onTargetClustersChange,
  onAskAI,
  onAddProject,
  onRemoveProject,
  onUpdatePriority,
  onReplaceProject,
  aiStreaming,
  planningMission,
  installedProjects,
}: FixerDefinitionPanelProps) {
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualName, setManualName] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [stickyProject, setStickyProject] = useState<PayloadProject | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  const handleSubmit = () => {
    if (!state.description.trim()) return
    if (!state.title) {
      const firstSentence = state.description.split(/[.!?\n]/)[0].trim()
      onTitleChange(firstSentence.slice(0, 60))
    }
    onAskAI(state.description, state.projects)
  }

  const handleManualAdd = () => {
    if (!manualName.trim()) return
    onAddProject({
      name: manualName.toLowerCase().replace(/\s+/g, '-'),
      displayName: manualName.trim(),
      reason: 'Manually added',
      category: 'Custom',
      priority: 'recommended',
      dependencies: [],
    })
    setManualName('')
    setShowManualAdd(false)
  }

  const handleCardClick = useCallback((project: PayloadProject) => {
    setStickyProject(project)
  }, [])

  const latestAIMessage = planningMission?.messages
    .filter((m) => m.role === 'assistant')
    .slice(-1)[0]

  // Summary stats for left sidebar
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of state.projects) {
      counts[p.category] = (counts[p.category] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [state.projects])

  const priorityCounts = useMemo(() => ({
    required: state.projects.filter((p) => p.priority === 'required').length,
    recommended: state.projects.filter((p) => p.priority === 'recommended').length,
    optional: state.projects.filter((p) => p.priority === 'optional').length,
  }), [state.projects])

  const totalDeps = useMemo(() => new Set(state.projects.flatMap((p) => p.dependencies)).size, [state.projects])

  return (
    <div className="h-full flex">
      {/* Left sidebar: Mission summary */}
      <div className="w-56 border-r border-border bg-card p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
        <div>
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mission Summary</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Projects</span>
              <span className="font-semibold text-foreground">{state.projects.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Dependencies</span>
              <span className="font-semibold text-foreground">{totalDeps}</span>
            </div>
          </div>
        </div>

        {state.projects.length > 0 && (
          <>
            <div>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">By Priority</h3>
              <div className="space-y-1.5">
                {priorityCounts.required > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-muted-foreground flex-1">Required</span>
                    <span className="font-semibold text-foreground">{priorityCounts.required}</span>
                  </div>
                )}
                {priorityCounts.recommended > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-muted-foreground flex-1">Recommended</span>
                    <span className="font-semibold text-foreground">{priorityCounts.recommended}</span>
                  </div>
                )}
                {priorityCounts.optional > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                    <span className="text-muted-foreground flex-1">Optional</span>
                    <span className="font-semibold text-foreground">{priorityCounts.optional}</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">By Category</h3>
              <div className="space-y-1.5">
                {categoryCounts.map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-2 text-xs">
                    <CategoryIcon category={cat} />
                    <span className="text-muted-foreground flex-1 truncate" title={cat}>{cat}</span>
                    <span className="font-semibold text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {state.projects.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50">
            <Layers className="w-6 h-6 mb-2" />
            <p className="text-[10px] text-center">Describe your fix to get started</p>
          </div>
        )}
      </div>

      {/* Center: main content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {/* Title */}
        <div>
          <h2 className="text-2xl font-bold mb-1">Define Your Mission</h2>
          <p className="text-sm text-muted-foreground">
            Describe the fix you want to deploy. AI will suggest the best CNCF
            projects and dependencies.
          </p>
        </div>

        {/* Solution title (editable) */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Mission Title
          </label>
          <input
            type="text"
            value={state.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g., Production Security Compliance"
            className="w-full mt-1 px-4 py-2 rounded-lg border border-border bg-secondary/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Description textarea */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Describe Your Solution
          </label>
          <div className="relative mt-1">
            <textarea
              ref={textareaRef}
              value={state.description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-border bg-secondary/30 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/40 transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground/50">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={!state.description.trim() || aiStreaming}
                className="h-7 px-3"
                icon={
                  aiStreaming ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )
                }
              >
                {aiStreaming ? 'Thinking...' : state.projects.length > 0 ? 'Refine' : 'Suggest'}
              </Button>
            </div>
          </div>
        </div>

        {/* Target clusters — scope which clusters AI analyzes */}
        <TargetClusterSelector
          selected={state.targetClusters}
          onChange={onTargetClustersChange}
        />

        {/* AI streaming indicator — shows live AI text as it arrives */}
        {aiStreaming && (
          <AIStreamingPreview planningMission={planningMission} />
        )}

        {/* AI Executive Analysis */}
        {latestAIMessage && !aiStreaming && (
          <ExecutiveAnalysis
            aiContent={latestAIMessage.content}
            projects={state.projects}
            missionTitle={state.title}
            missionDescription={state.description}
          />
        )}

        {/* Payload Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Selected Payload</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowManualAdd(!showManualAdd)}
              className="h-7 text-xs"
              icon={<Plus className="w-3 h-3" />}
            >
              Add Manually
            </Button>
          </div>

          {showManualAdd && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-3 flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Project name (e.g., Falco, Prometheus, Cilium)"
                  className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-secondary/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleManualAdd()
                  }}
                  autoFocus
                />
              </div>
              <Button variant="primary" size="sm" onClick={handleManualAdd} disabled={!manualName.trim()}>
                Add
              </Button>
            </motion.div>
          )}

          <PayloadGrid
            projects={state.projects}
            onRemoveProject={onRemoveProject}
            onUpdatePriority={onUpdatePriority}
            onClickProject={handleCardClick}
            installedProjects={installedProjects}
          />
        </div>
      </div>

      {/* Right: Info panel */}
      <div className="w-[26rem] border-l border-border bg-card flex flex-col overflow-y-auto shrink-0">
        <AnimatePresence mode="wait">
          {stickyProject ? (
            <motion.div
              key={`p-${stickyProject!.name}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.12 }}
              className="p-4 space-y-4"
            >
              <ProjectDetailPanel
                project={
                  // Always use the latest version from state (stale hover refs don't have swap updates)
                  state.projects.find((p) => p.name === stickyProject!.name)
                  ?? stickyProject!
                }
                allProjects={state.projects}
                onReplace={onReplaceProject ? (oldName, newProject) => {
                  onReplaceProject(oldName, newProject)
                  // Update sticky to the swapped-in project so the panel refreshes
                  setStickyProject(newProject)
                } : undefined}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6"
            >
              <Info className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm text-center">Click a project card for details</p>
              <p className="text-xs text-center mt-1 opacity-60">
                See AI reasoning, install steps, dependencies, and alternatives
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Executive Analysis (full AI reasoning, not truncated)
// ---------------------------------------------------------------------------

function ExecutiveAnalysis({
  aiContent,
  projects,
  missionTitle,
  missionDescription,
}: {
  aiContent: string
  projects: PayloadProject[]
  missionTitle: string
  missionDescription: string
}) {
  const [expanded, setExpanded] = useState(true)

  // Extract the non-JSON text from the AI response
  const analysisText = aiContent
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim()

  // Build executive summary sections
  const requiredProjects = projects.filter((p) => p.priority === 'required')
  const recommendedProjects = projects.filter((p) => p.priority === 'recommended')
  const optionalProjects = projects.filter((p) => p.priority === 'optional')
  const allDeps = new Set(projects.flatMap((p) => p.dependencies))
  const categories = [...new Set(projects.map((p) => p.category))]

  return (
    <div className="rounded-lg bg-secondary/30 border border-primary/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-secondary/50 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold text-primary">Executive Analysis</span>
        <span className="text-[10px] text-muted-foreground ml-1">
          {projects.length} projects · {categories.length} categories · {allDeps.size} dependencies
        </span>
        <span className="ml-auto text-muted-foreground text-xs">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Mission overview */}
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Mission Objective</h4>
            <p className="text-xs text-foreground/80">
              {missionTitle ? `${missionTitle}: ` : ''}{missionDescription || 'No description provided'}
            </p>
          </div>

          {/* AI's full reasoning */}
          {analysisText && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">AI Reasoning</h4>
              <div className="text-xs text-foreground/80 leading-relaxed prose prose-invert prose-xs max-w-none [&_table]:text-[10px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border-collapse [&_th]:border [&_th]:border-border/30 [&_td]:border [&_td]:border-border/30 [&_th]:bg-secondary/50 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_p]:my-1.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_h4]:text-[11px] [&_strong]:text-foreground/90 [&_code]:text-[10px] [&_code]:bg-secondary/60 [&_code]:px-1 [&_code]:rounded">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    td: ({ children, ...props }) => {
                      const raw = String(children ?? '')
                      const text = raw.toLowerCase()
                      let indicator: React.ReactNode = null
                      let displayChildren: React.ReactNode = children
                      // Normalize "Missing" → "Not installed"
                      if (/^missing$/i.test(raw.trim())) {
                        displayChildren = 'Not installed'
                      }
                      // Check negative patterns FIRST (they contain positive substrings like "installed")
                      if (/not installed|missing|not found|absent/.test(text)) {
                        indicator = <span className="inline-block mr-1.5 align-middle text-[10px]">🚀</span>
                      } else if (/error|failed|crash|unhealthy|degraded/.test(text)) {
                        indicator = <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1.5 align-middle" />
                      } else if (/warning|misconfigured|partial|pending|conflict/.test(text)) {
                        indicator = <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5 align-middle" />
                      } else if (/already running|active|installed|running|ready|bound|healthy/.test(text)) {
                        indicator = <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5 align-middle" />
                      }
                      return <td {...props}>{indicator}{displayChildren}</td>
                    },
                  }}
                >
                  {analysisText}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Project selection rationale */}
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Selection Rationale</h4>
            <div className="space-y-2">
              {requiredProjects.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-red-400">Required ({requiredProjects.length})</span>
                  <ul className="mt-1 space-y-1">
                    {requiredProjects.map((p) => (
                      <li key={p.name} className="text-xs text-foreground/70 flex gap-1.5">
                        <span className="text-red-400 shrink-0">•</span>
                        <span><span className="font-medium text-foreground">{p.displayName}</span> — {p.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recommendedProjects.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-blue-400">Recommended ({recommendedProjects.length})</span>
                  <ul className="mt-1 space-y-1">
                    {recommendedProjects.map((p) => (
                      <li key={p.name} className="text-xs text-foreground/70 flex gap-1.5">
                        <span className="text-blue-400 shrink-0">•</span>
                        <span><span className="font-medium text-foreground">{p.displayName}</span> — {p.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {optionalProjects.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-gray-400">Optional ({optionalProjects.length})</span>
                  <ul className="mt-1 space-y-1">
                    {optionalProjects.map((p) => (
                      <li key={p.name} className="text-xs text-foreground/70 flex gap-1.5">
                        <span className="text-gray-400 shrink-0">•</span>
                        <span><span className="font-medium text-foreground">{p.displayName}</span> — {p.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Architecture coverage */}
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Coverage Areas</h4>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <span key={cat} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {cat}
                </span>
              ))}
            </div>
          </div>

          {/* Key dependencies */}
          {allDeps.size > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Shared Dependencies</h4>
              <div className="flex flex-wrap gap-1">
                {Array.from(allDeps).map((dep) => (
                  <span key={dep} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Project detail panel (used in Define Mission info sidebar)
// ---------------------------------------------------------------------------

/** Known alternatives for common CNCF project categories */
const ALTERNATIVES: Record<string, { name: string; displayName: string; reason: string }[]> = {
  falco: [
    { name: 'tetragon', displayName: 'Tetragon', reason: 'eBPF-based security observability by Cilium team' },
    { name: 'kubearmor', displayName: 'KubeArmor', reason: 'Runtime security enforcement using LSM' },
  ],
  'open-policy-agent': [
    { name: 'kyverno', displayName: 'Kyverno', reason: 'Kubernetes-native policy engine, no Rego needed' },
  ],
  kyverno: [
    { name: 'open-policy-agent', displayName: 'OPA Gatekeeper', reason: 'Rego-based policy engine, more flexible but steeper learning curve' },
  ],
  istio: [
    { name: 'linkerd', displayName: 'Linkerd', reason: 'Lighter service mesh with simpler operational model' },
    { name: 'cilium', displayName: 'Cilium Service Mesh', reason: 'eBPF-based mesh without sidecars' },
  ],
  linkerd: [
    { name: 'istio', displayName: 'Istio', reason: 'Feature-rich service mesh with Envoy proxy' },
  ],
  prometheus: [
    { name: 'thanos', displayName: 'Thanos', reason: 'Long-term Prometheus storage with global query' },
    { name: 'victoriametrics', displayName: 'VictoriaMetrics', reason: 'High-performance Prometheus-compatible TSDB' },
  ],
  cilium: [
    { name: 'calico', displayName: 'Calico', reason: 'Mature CNI with eBPF dataplane option' },
    { name: 'antrea', displayName: 'Antrea', reason: 'Kubernetes-native CNI using Open vSwitch' },
  ],
  'cert-manager': [
    { name: 'step-certificates', displayName: 'step-ca', reason: 'Smallstep CA for internal PKI' },
  ],
  'trivy-operator': [
    { name: 'grype', displayName: 'Grype', reason: 'Anchore vulnerability scanner' },
    { name: 'kubescape', displayName: 'Kubescape', reason: 'ARMO security posture scanning' },
  ],
  grype: [
    { name: 'trivy-operator', displayName: 'Trivy Operator', reason: 'Aqua vulnerability scanning for Kubernetes' },
    { name: 'kubescape', displayName: 'Kubescape', reason: 'ARMO security posture scanning' },
  ],
  kubescape: [
    { name: 'trivy-operator', displayName: 'Trivy Operator', reason: 'Aqua vulnerability scanning for Kubernetes' },
    { name: 'grype', displayName: 'Grype', reason: 'Anchore vulnerability scanner' },
  ],
  tetragon: [
    { name: 'falco', displayName: 'Falco', reason: 'Runtime threat detection via syscall monitoring' },
    { name: 'kubearmor', displayName: 'KubeArmor', reason: 'Runtime security enforcement using LSM' },
  ],
  kubearmor: [
    { name: 'falco', displayName: 'Falco', reason: 'Runtime threat detection via syscall monitoring' },
    { name: 'tetragon', displayName: 'Tetragon', reason: 'eBPF-based security observability by Cilium team' },
  ],
  calico: [
    { name: 'cilium', displayName: 'Cilium', reason: 'eBPF-based networking and security' },
    { name: 'antrea', displayName: 'Antrea', reason: 'Kubernetes-native CNI using Open vSwitch' },
  ],
}

/** Display info for original projects when swapping back */
const ALTERNATIVES_DISPLAY: Record<string, { displayName: string; reason: string }> = {
  falco: { displayName: 'Falco', reason: 'Runtime threat detection via syscall monitoring' },
  'open-policy-agent': { displayName: 'OPA Gatekeeper', reason: 'Rego-based policy engine for admission control' },
  kyverno: { displayName: 'Kyverno', reason: 'Kubernetes-native policy engine' },
  istio: { displayName: 'Istio', reason: 'Full-featured service mesh with Envoy proxy' },
  linkerd: { displayName: 'Linkerd', reason: 'Lightweight service mesh' },
  prometheus: { displayName: 'Prometheus', reason: 'CNCF monitoring and alerting toolkit' },
  cilium: { displayName: 'Cilium', reason: 'eBPF-based networking and security' },
  'cert-manager': { displayName: 'cert-manager', reason: 'Automated TLS certificate management' },
  'trivy-operator': { displayName: 'Trivy Operator', reason: 'Aqua vulnerability scanning for Kubernetes' },
}

function ProjectDetailPanel({
  project,
  allProjects,
  onReplace,
}: {
  project: PayloadProject
  allProjects: PayloadProject[]
  onReplace?: (oldName: string, newProject: PayloadProject) => void
}) {
  const [mission, setMission] = useState<MissionExport | null>(null)
  const [loadingSteps, setLoadingSteps] = useState(false)
  const fetchedRef = useRef<string>('')

  useEffect(() => {
    if (!project.kbPath || fetchedRef.current === project.kbPath) return
    fetchedRef.current = project.kbPath
    setLoadingSteps(true)
    const indexMission: MissionExport = {
      version: 'kc-mission-v1',
      title: project.displayName,
      description: project.reason ?? '',
      type: 'custom',
      tags: [],
      steps: [],
      metadata: { source: project.kbPath },
    }
    fetchMissionContent(indexMission)
      .then(({ mission: m }) => setMission(m))
      .catch(() => {/* ignore */})
      .finally(() => setLoadingSteps(false))
  }, [project.kbPath, project.displayName, project.reason])

  // Look up alternatives using the original AI-suggested name (before any swaps)
  const lookupKey = project.originalName ?? project.name
  const rawAlts = ALTERNATIVES[lookupKey] ?? []
  // Build full list: the original AI-suggested project + all alternatives
  // If we swapped away from the original, include it as a "swap back" option
  const isSwapped = !!project.originalName
  const allAlts: { name: string; displayName: string; reason: string; isCurrent: boolean; isOriginal: boolean }[] = []

  // Add the original project as an option if we swapped away from it
  if (isSwapped) {
    allAlts.push({
      name: lookupKey,
      displayName: ALTERNATIVES_DISPLAY[lookupKey]?.displayName ?? lookupKey,
      reason: ALTERNATIVES_DISPLAY[lookupKey]?.reason ?? 'Original AI recommendation',
      isCurrent: false,
      isOriginal: true,
    })
  }

  // Add all known alternatives
  for (const alt of rawAlts) {
    allAlts.push({
      ...alt,
      isCurrent: alt.name === project.name,
      isOriginal: false,
    })
  }

  // Add the current project to the list if not already present (so user sees "Selected" marker)
  if (!allAlts.some((a) => a.name === project.name)) {
    allAlts.unshift({
      name: project.name,
      displayName: project.displayName,
      reason: project.reason ?? '',
      isCurrent: true,
      isOriginal: false,
    })
  }

  // Filter out projects that are already in the payload under a different slot
  const availableAlts = allAlts.filter((a) =>
    a.isCurrent || !allProjects.some((p) => p.name === a.name && p.name !== project.name)
  )

  return (
    <>
      <div>
        <h3 className="text-base font-bold text-foreground">{project.displayName}</h3>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {project.category}
          </span>
          {project.maturity && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
              {project.maturity}
            </span>
          )}
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            project.priority === 'required' ? 'bg-red-500/10 text-red-400' :
            project.priority === 'recommended' ? 'bg-blue-500/10 text-blue-400' :
            'bg-gray-500/10 text-gray-400 dark:text-gray-500'
          )}>
            {project.priority}
          </span>
          {project.importedMission && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">
              {project.replacesInstallMission ? 'your YAML' : 'your YAML + community'}
            </span>
          )}
        </div>
      </div>

      {/* AI Reason */}
      {project.reason && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Why AI Chose This</h4>
          <p className="text-sm text-foreground/80 leading-relaxed">{project.reason}</p>
        </div>
      )}

      {/* Dependencies */}
      {project.dependencies.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Dependencies</h4>
          <div className="flex flex-wrap gap-1">
            {project.dependencies.map((dep) => (
              <span key={dep} className="text-xs px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Install Steps */}
      {project.kbPath && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Install Steps</h4>
          {loadingSteps ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading mission...
            </div>
          ) : mission?.steps && mission.steps.length > 0 ? (
            <div className="space-y-2">
              {mission.steps.map((step, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-[10px] font-bold text-primary mt-0.5 shrink-0">{i + 1}.</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{step.title || step.description?.slice(0, 80)}</p>
                    {step.command && (
                      <pre className="text-[10px] text-emerald-400 font-mono mt-0.5 bg-slate-800 rounded px-1.5 py-0.5 overflow-x-auto whitespace-pre-wrap break-all">
                        {step.command}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-400 font-mono">
              {project.kbPath.split('/').pop()?.replace('.json', '')}
            </p>
          )}
        </div>
      )}

      {/* Alternatives */}
      {availableAlts.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Alternatives {isSwapped && <span className="text-amber-400 normal-case font-normal ml-1">(swapped from original)</span>}
          </h4>
          <div className="space-y-2">
            {availableAlts.map((alt) => (
              <div
                key={alt.name}
                className={cn(
                  'rounded-lg border p-2.5 transition-colors',
                  alt.isCurrent
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border hover:border-primary/30'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{alt.displayName}</span>
                    {alt.isCurrent && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                        Selected
                      </span>
                    )}
                    {alt.isOriginal && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                        AI Original
                      </span>
                    )}
                  </div>
                  {!alt.isCurrent && onReplace && (
                    <button
                      onClick={() => onReplace(project.name, {
                        name: alt.name,
                        displayName: alt.displayName,
                        reason: alt.reason,
                        category: project.category,
                        priority: project.priority,
                        dependencies: project.dependencies,
                      })}
                      className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      Swap
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{alt.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Category icon helper
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Security': <Shield className="w-3 h-3 text-red-400" />,
  'Runtime Security': <Shield className="w-3 h-3 text-red-400" />,
  'Vulnerability Scanning': <Eye className="w-3 h-3 text-orange-400" />,
  'Policy Enforcement': <Lock className="w-3 h-3 text-amber-400" />,
  'Networking': <Network className="w-3 h-3 text-sky-400" />,
  'Network Security': <Network className="w-3 h-3 text-sky-400" />,
  'Service Mesh': <Network className="w-3 h-3 text-cyan-400" />,
  'Observability': <Eye className="w-3 h-3 text-blue-400" />,
  'Identity & Encryption': <Lock className="w-3 h-3 text-violet-400" />,
  'Authentication & IAM': <Lock className="w-3 h-3 text-violet-400" />,
  'Secrets Management': <Lock className="w-3 h-3 text-emerald-400" />,
  'Storage': <Box className="w-3 h-3 text-green-400" />,
  'Custom': <Layers className="w-3 h-3 text-slate-400" />,
}

function CategoryIcon({ category }: { category: string }) {
  return CATEGORY_ICONS[category] ?? <Layers className="w-3 h-3 text-slate-400" />
}

// ---------------------------------------------------------------------------
// AI Streaming Preview — shows live AI text as it arrives inline
// ---------------------------------------------------------------------------

function AIStreamingPreview({ planningMission }: { planningMission: Mission | null | undefined }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Get the latest assistant message (still streaming)
  const latestMsg = planningMission?.messages
    .filter((m) => m.role === 'assistant')
    .slice(-1)[0]

  const rawText = latestMsg?.content ?? ''
  // Strip JSON blocks — only show the reasoning text
  const displayText = rawText
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim()

  // Auto-scroll to bottom as text streams in
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
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-primary/10">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        <span className="text-xs font-semibold text-primary">AI is analyzing your requirements...</span>
      </div>

      {/* Streaming text */}
      <div
        ref={scrollRef}
        className="px-4 py-3 max-h-48 overflow-y-auto text-xs text-foreground/80 leading-relaxed prose prose-invert prose-xs max-w-none [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_p]:my-1 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_strong]:text-foreground/90"
      >
        {displayText ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {displayText}
          </ReactMarkdown>
        ) : (
          <span className="text-muted-foreground/60 italic">Thinking...</span>
        )}
        {/* Blinking cursor */}
        <span className="inline-block w-1.5 h-3.5 bg-primary/60 ml-0.5 animate-pulse align-text-bottom" />
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Target Cluster Selector — lets users scope which clusters AI analyzes
// ---------------------------------------------------------------------------

/** Minimum height for the cluster chip container */
const CLUSTER_CHIP_MIN_HEIGHT_PX = 40

function TargetClusterSelector({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (clusters: string[]) => void
}) {
  const { availableClusters, clusterInfoMap } = useGlobalFilters()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Use deduplicated short names
  const clusters = availableClusters

  const toggleCluster = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter(c => c !== name))
    } else {
      onChange([...selected, name])
    }
  }

  const isAllSelected = selected.length === 0 || selected.length === clusters.length

  return (
    <div ref={ref} className="relative">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Target Clusters
      </label>
      <p className="text-xs text-muted-foreground/60 mt-0.5 mb-1">
        {isAllSelected
          ? 'All clusters — AI will analyze your full fleet'
          : `${selected.length} cluster${selected.length === 1 ? '' : 's'} selected — AI analysis scoped to these`}
      </p>

      {/* Selected chips + dropdown trigger */}
      <div
        className="relative mt-1 flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-secondary/30 cursor-pointer hover:border-primary/30 transition-colors"
        style={{ minHeight: CLUSTER_CHIP_MIN_HEIGHT_PX }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selected.length === 0 ? (
          <span className="text-sm text-muted-foreground/50 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" />
            All clusters (click to scope)
          </span>
        ) : (
          <>
            {selected.map(name => {
              const info = clusterInfoMap[name]
              const isHealthy = info?.healthy !== false && info?.reachable !== false
              return (
                <span
                  key={name}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium',
                    isHealthy
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
                  )}
                  onClick={(e) => { e.stopPropagation(); toggleCluster(name) }}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', isHealthy ? 'bg-green-400' : 'bg-yellow-400')} />
                  {name}
                  <XIcon className="w-3 h-3 opacity-50 hover:opacity-100" />
                </span>
              )
            })}
            {selected.length > 0 && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground/50 hover:text-foreground ml-1"
                onClick={(e) => { e.stopPropagation(); onChange([]) }}
              >
                Clear
              </button>
            )}
          </>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {/* All clusters toggle */}
          <button
            type="button"
            className={cn(
              'w-full px-3 py-2 text-left text-sm hover:bg-secondary/50 flex items-center gap-2 border-b border-border/50',
              isAllSelected && 'text-primary font-medium',
            )}
            onClick={() => { onChange([]); setIsOpen(false) }}
          >
            <Server className="w-3.5 h-3.5" />
            All clusters
            {isAllSelected && <span className="ml-auto text-primary">✓</span>}
          </button>

          {clusters.map(name => {
            const info = clusterInfoMap[name]
            const isHealthy = info?.healthy !== false && info?.reachable !== false
            const isSelected = selected.includes(name)
            return (
              <button
                type="button"
                key={name}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-sm hover:bg-secondary/50 flex items-center gap-2',
                  isSelected && 'bg-primary/5',
                )}
                onClick={() => toggleCluster(name)}
              >
                <span className={cn('w-2 h-2 rounded-full shrink-0', isHealthy ? 'bg-green-400' : 'bg-yellow-400')} />
                <span className="truncate">{name}</span>
                {isSelected && <span className="ml-auto text-primary text-xs">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
