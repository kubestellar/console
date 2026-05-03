/**
 * BlueprintInfoPanels — right-hand info panels for FlightPlanBlueprint.
 *
 * Contains:
 *  - ProjectInfoPanel   — shown when hovering a project node
 *  - ClusterInfoPanel   — shown when hovering a cluster zone
 *  - DeployModeInfoPanel — shown when the deploy-mode toggle is active
 *
 * Also exports helper utilities:
 *  - GaugeRow           — labelled resource gauge bar
 *  - generateDefaultPhases — auto-derives deploy phases from dependencies
 *  - getDependencyNotes — human-readable integration notes for a project set
 */

import { useState, useEffect, useRef } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import type { DependencyEdge, DeployPhase, PayloadProject } from './types'
import { fetchMissionContent } from '../missions/browser/missionCache'
import type { MissionExport } from '../../lib/missions/types'

// ---------------------------------------------------------------------------
// Status display maps (shared with the main component)
// ---------------------------------------------------------------------------

export const STATUS_COLORS: Record<string, string> = {
  pending: 'text-slate-400',
  running: 'text-amber-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'READY TO DEPLOY',
  running: 'DEPLOYING',
  completed: 'INSTALLED',
  failed: 'FAILED',
}

// ---------------------------------------------------------------------------
// GaugeRow
// ---------------------------------------------------------------------------

export function GaugeRow({ label, value, max, unit }: {
  label: string; value?: number; max?: number; unit?: string
}) {
  const pctVal = (value != null && max != null && max > 0)
    ? Math.round((value / max) * 100)
    : undefined
  const display = value != null
    ? max != null ? `${Math.round(value)} / ${max}${unit ?? ''}` : `${Math.round(value)}${unit ?? ''}`
    : max != null ? `— / ${max}${unit ?? ''}` : 'N/A'
  const barColor = pctVal != null
    ? pctVal >= 80 ? '#ef4444' : pctVal >= 50 ? '#f59e0b' : '#22c55e'
    : '#334155'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400 font-medium">{label}</span>
        <span className="text-foreground tabular-nums">{display}{pctVal != null ? ` (${pctVal}%)` : ''}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        {pctVal != null && (
          <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, backgroundColor: barColor }} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProjectInfoPanel
// ---------------------------------------------------------------------------

export function ProjectInfoPanel({ info, edges }: { info: ProjectHoverInfo; edges?: DependencyEdge[] }) {
  // Find connections for this project
  const connections = edges?.filter(e => e.from === info.name || e.to === info.name) ?? []
  const [mission, setMission] = useState<MissionExport | null>(null)
  const [loadingSteps, setLoadingSteps] = useState(false)
  const fetchedRef = useRef<string>('')

  // Fetch mission steps — try multiple KB path variants for fuzzy matching
  const slug = info.name.toLowerCase().replace(/\s+/g, '-')
  useEffect(() => {
    if (fetchedRef.current === slug) return
    fetchedRef.current = slug
    setLoadingSteps(true)
    setMission(null)

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

    const tryNext = (idx: number) => {
      if (idx >= candidates.length) { setLoadingSteps(false); return }
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
          if (m.steps && m.steps.length > 0) { setMission(m); setLoadingSteps(false) }
          else tryNext(idx + 1)
        })
        .catch(() => tryNext(idx + 1))
    }
    tryNext(0)
  }, [slug, info.kbPath, info.displayName, info.reason])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground pr-2">{info.displayName}</h3>
          <div className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap', info.installed ? 'text-green-400 bg-green-500/10' : (STATUS_COLORS[info.status] ?? 'text-slate-400'))}>
            {info.installed ? 'INSTALLED' : (STATUS_LABELS[info.status] ?? info.status.toUpperCase())}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {info.category}
          </span>
          {info.maturity && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
              {info.maturity}
            </span>
          )}
          {info.priority && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
              info.priority === 'required' ? 'bg-red-500/10 text-red-400' :
              info.priority === 'recommended' ? 'bg-blue-500/10 text-blue-400' :
              'bg-gray-500/10 text-gray-400 dark:text-gray-500'
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
              <span key={dep} className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
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
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
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
        ) : mission?.steps && mission.steps.length > 0 ? (
          <div className="space-y-1.5">
            {mission.steps.map((step, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="text-[10px] font-bold text-primary mt-0.5 shrink-0">{i + 1}.</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-foreground">{step.title || step.description?.slice(0, 60)}</p>
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
          <p className="text-[10px] text-muted-foreground italic">
            No install steps found in knowledge base
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ClusterInfoPanel
// ---------------------------------------------------------------------------

/** Format large numbers nicely: 13590.945 → "13,591" */
function fmtNum(v: number | undefined): string {
  if (v == null) return '—'
  return Math.round(v).toLocaleString()
}

export function ClusterInfoPanel({ info }: { info: ClusterHoverInfo }) {
  return (
    <>
      <div>
        <h3 className="text-base font-bold text-foreground">{info.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {info.provider.toUpperCase()}
          {info.nodeCount != null ? ` · ${info.nodeCount} nodes` : ''}
          {info.podCount != null ? ` · ${info.podCount} pods` : ''}
        </p>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resources</h4>
        <div className="space-y-3">
          <GaugeRow label="CPU" value={info.cpuUsage} max={info.cpuCores} unit=" cores" />
          <GaugeRow label="Memory" value={info.memUsage} max={info.memGB != null ? Math.round(info.memGB) : undefined} unit=" GB" />
          <GaugeRow label="Storage" value={undefined} max={info.storageGB != null ? Math.round(info.storageGB) : undefined} unit=" GB" />
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Capacity</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">CPU</span>
            <span className="text-foreground tabular-nums">{fmtNum(info.cpuCores)} cores</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Memory</span>
            <span className="text-foreground tabular-nums">{fmtNum(info.memGB)} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Storage</span>
            <span className="text-foreground tabular-nums">{fmtNum(info.storageGB)} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">PVC</span>
            <span className="text-foreground tabular-nums">{info.pvcBoundCount ?? '?'}/{info.pvcCount ?? '?'}</span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Accelerators</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center rounded-lg bg-slate-800/50 py-2">
            <div className="text-base font-bold text-foreground">{info.gpuCount ?? '—'}</div>
            <div className="text-[10px] text-muted-foreground">GPU</div>
          </div>
          <div className="text-center rounded-lg bg-slate-800/50 py-2">
            <div className="text-base font-bold text-foreground">{info.tpuCount ?? '—'}</div>
            <div className="text-[10px] text-muted-foreground">TPU</div>
          </div>
          <div className="text-center rounded-lg bg-slate-800/50 py-2">
            <div className="text-base font-bold text-foreground">—</div>
            <div className="text-[10px] text-muted-foreground">XPU</div>
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// DeployModeInfoPanel helpers
// ---------------------------------------------------------------------------

/** Map of known dependency integration notes */
const DEPENDENCY_NOTES: Record<string, Record<string, string>> = {
  'cert-manager': {
    istio: 'cert-manager provides TLS certificates that Istio uses for mTLS between services',
    'external-secrets': 'cert-manager can issue certs stored/synced via External Secrets Operator',
    keycloak: 'cert-manager provides TLS certificates for Keycloak HTTPS endpoints',
  },
  helm: {
    '*': 'Helm must be available on the cluster before any Helm-based installations',
  },
  prometheus: {
    falco: 'Falco exports metrics to Prometheus for runtime security alerting',
    cilium: 'Cilium Hubble metrics are scraped by Prometheus for network observability',
    'trivy-operator': 'Trivy vulnerability scan results are exported as Prometheus metrics',
    kyverno: 'Kyverno policy violation metrics feed into Prometheus dashboards',
    keycloak: 'Keycloak exposes JMX/metrics endpoints for Prometheus scraping',
  },
  falco: {
    kyverno: 'Falco detects runtime threats; Kyverno enforces admission policies — complementary defense layers',
    'open-policy-agent': 'Falco handles runtime detection while OPA handles admission-time policy enforcement',
  },
  cilium: {
    'open-policy-agent': 'Cilium network policies can complement OPA admission policies for defense in depth',
    kyverno: 'Cilium handles L3/L4/L7 network policy; Kyverno handles Kubernetes admission policy',
  },
}

export function getDependencyNotes(projects: PayloadProject[]): string[] {
  const notes: string[] = []
  const nameSet = new Set(projects.map((p) => p.name))
  for (const project of projects) {
    for (const dep of project.dependencies) {
      const depNotes = DEPENDENCY_NOTES[dep]
      if (!depNotes) continue
      const specific = depNotes[project.name]
      if (specific && nameSet.has(dep)) {
        notes.push(specific)
      }
      const wildcard = depNotes['*']
      if (wildcard && !notes.includes(wildcard)) {
        notes.push(wildcard)
      }
    }
  }
  // Also check reverse: if project A is in DEPENDENCY_NOTES and project B is in the payload
  for (const [src, targets] of Object.entries(DEPENDENCY_NOTES)) {
    if (!nameSet.has(src)) continue
    for (const [target, note] of Object.entries(targets)) {
      if (target === '*') continue
      if (nameSet.has(target) && !notes.includes(note)) {
        notes.push(note)
      }
    }
  }
  return notes
}

/** Auto-generate phases from project dependencies when AI doesn't provide them */
export function generateDefaultPhases(projects: PayloadProject[]): DeployPhase[] {
  const nameSet = new Set(projects.map((p) => p.name))
  const placed = new Set<string>()

  // Phase 1: Infrastructure (projects that are dependencies of others, or known infra tools)
  const infraNames = new Set(['helm', 'cert-manager', 'external-secrets', 'external-secrets-operator'])
  const phase1: string[] = []
  const phase2: string[] = []
  const phase3: string[] = []

  // Find projects that are deps of other projects
  for (const p of projects) {
    for (const dep of p.dependencies) {
      if (nameSet.has(dep)) infraNames.add(dep)
    }
  }

  for (const p of projects) {
    if (infraNames.has(p.name)) {
      phase1.push(p.name)
      placed.add(p.name)
    }
  }

  // Phase 2: Core security/networking (required projects not in phase 1)
  for (const p of projects) {
    if (placed.has(p.name)) continue
    if (p.priority === 'required') {
      phase2.push(p.name)
      placed.add(p.name)
    }
  }

  // Phase 3: Everything else
  for (const p of projects) {
    if (placed.has(p.name)) continue
    phase3.push(p.name)
    placed.add(p.name)
  }

  const result: DeployPhase[] = []
  // Padded estimates: account for image pulls, CRD registration, RBAC setup, retries
  const INFRA_PER_PROJECT_SEC = 180
  const INFRA_OVERHEAD_SEC = 120
  const SECURITY_PER_PROJECT_SEC = 210
  const SECURITY_OVERHEAD_SEC = 120
  const SERVICES_PER_PROJECT_SEC = 150
  const SERVICES_OVERHEAD_SEC = 60
  if (phase1.length > 0) result.push({ phase: 1, name: 'Core Infrastructure', projectNames: phase1, estimatedSeconds: phase1.length * INFRA_PER_PROJECT_SEC + INFRA_OVERHEAD_SEC })
  if (phase2.length > 0) result.push({ phase: result.length + 1, name: 'Security & Networking', projectNames: phase2, estimatedSeconds: phase2.length * SECURITY_PER_PROJECT_SEC + SECURITY_OVERHEAD_SEC })
  if (phase3.length > 0) result.push({ phase: result.length + 1, name: 'Monitoring & Services', projectNames: phase3, estimatedSeconds: phase3.length * SERVICES_PER_PROJECT_SEC + SERVICES_OVERHEAD_SEC })
  return result
}

// ---------------------------------------------------------------------------
// DeployModeInfoPanel
// ---------------------------------------------------------------------------

export function DeployModeInfoPanel({ mode, phases, projects, onShowProject, installedProjects = new Set() }: {
  mode: 'phased' | 'yolo'
  phases: DeployPhase[]
  projects: PayloadProject[]
  onShowProject?: (project: PayloadProject) => void
  installedProjects?: Set<string>
}) {
  const depNotes = getDependencyNotes(projects)
  // Use AI-provided phases, or auto-generate from dependencies
  const effectivePhases = phases.length > 0 ? phases : generateDefaultPhases(projects)
  const totalEstSec = effectivePhases.reduce((sum, p) => sum + (p.estimatedSeconds ?? 180), 0)
  const aiMinLow = Math.ceil(totalEstSec / 60)
  const aiMinHigh = Math.ceil(totalEstSec * 1.5 / 60)
  // Human estimate: ~20-40 min per project (reading docs, writing YAML, debugging RBAC, etc.)
  const HUMAN_MIN_LOW_PER_PROJECT = 20
  const HUMAN_MIN_HIGH_PER_PROJECT = 40
  const humanHrsLow = Math.max(1, Math.floor(projects.length * HUMAN_MIN_LOW_PER_PROJECT / 60))
  const humanHrsHigh = Math.ceil(projects.length * HUMAN_MIN_HIGH_PER_PROJECT / 60)

  return (
    <>
      <div>
        <h3 className="text-base font-bold text-foreground">
          {mode === 'phased' ? 'Phased Rollout' : 'YOLO Mode'}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {mode === 'phased'
            ? 'Deploy projects in sequential phases. Each phase completes before the next begins. Prerequisites and dependencies are respected — infrastructure first, then services, then monitoring.'
            : "Launch all projects simultaneously across all clusters. No waiting for dependencies. Maximum speed, maximum risk. Best for dev/test environments or when you're feeling lucky."}
        </p>
      </div>

      {/* AI vs Human time comparison */}
      {projects.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Time Estimate</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs">🤖</span>
                <span className="text-xs font-medium text-foreground">AI-Assisted</span>
              </div>
              <span className="text-sm font-bold text-primary">{aiMinLow}–{aiMinHigh} min</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs">👤</span>
                <span className="text-xs font-medium text-foreground">Manual (Human)</span>
              </div>
              <span className="text-sm font-bold text-muted-foreground">{humanHrsLow}–{humanHrsHigh} hrs</span>
            </div>
            <div className="h-px bg-border" />
            <p className="text-[10px] text-muted-foreground italic">
              {Math.round(humanHrsLow * 60 / aiMinHigh)}x faster — includes reading docs, writing YAML, debugging RBAC, troubleshooting image pulls, and configuring integrations
            </p>
          </div>
        </div>
      )}

      {mode === 'phased' && effectivePhases.length > 0 && (
        <p className="text-xs text-primary">
          {effectivePhases.length} phases · {aiMinLow}–{aiMinHigh} min estimated
        </p>
      )}

      {/* Phase breakdown — different layout for phased vs YOLO */}
      {mode === 'phased' && effectivePhases.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Launch Sequence
          </h4>
          <div className="space-y-3">
            {effectivePhases.map((phase, phaseIdx) => {
              const phaseProjects = phase.projectNames
                .map((n) => projects.find((p) => p.name === n))
                .filter(Boolean) as PayloadProject[]
              return (
                <div key={phase.phase} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-white bg-primary rounded-full w-6 h-6 flex items-center justify-center shadow-xs">
                      {phase.phase}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{phase.name}</span>
                    {phase.estimatedSeconds && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {Math.ceil(phase.estimatedSeconds / 60)}–{Math.ceil(phase.estimatedSeconds * 1.5 / 60)} min
                      </span>
                    )}
                  </div>
                  <ul className="space-y-2 ml-1">
                    {phaseProjects.map((proj) => (
                      <li key={proj.name} className="flex items-start gap-2">
                        <span className="text-xs font-bold text-primary mt-0.5 shrink-0">{phaseIdx + 1}.{phaseProjects.indexOf(proj) + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground">{proj.displayName}</span>
                            {onShowProject && (
                              <button
                                onClick={() => onShowProject(proj)}
                                className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="View install mission"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {installedProjects.has(proj.name) && (
                            <span className="text-[9px] ml-1 px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                              installed
                            </span>
                          )}
                          {!installedProjects.has(proj.name) && (
                            <span className="text-[9px] ml-1 px-1 py-0.5 rounded bg-slate-500/10 text-slate-400">
                              deploy
                            </span>
                          )}
                          <span className={cn(
                            'text-[9px] ml-1.5 px-1 py-0.5 rounded',
                            proj.priority === 'required' ? 'bg-red-500/10 text-red-400' :
                            proj.priority === 'recommended' ? 'bg-blue-500/10 text-blue-400' :
                            'bg-gray-500/10 text-gray-400 dark:text-gray-500'
                          )}>
                            {proj.priority}
                          </span>
                          {proj.reason && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{proj.reason}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {phaseIdx < effectivePhases.length - 1 && (
                    <div className="flex items-center justify-center mt-2 text-muted-foreground">
                      <span className="text-[10px]">↓ wait for completion ↓</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {mode === 'yolo' && projects.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            All Launched Simultaneously
          </h4>
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            <div className="flex flex-wrap gap-1.5">
              {projects.map((proj) => (
                <span key={proj.name} className={cn(
                  'text-[10px] px-2 py-1 rounded-md border',
                  installedProjects.has(proj.name)
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                )}>
                  {proj.displayName}
                  {installedProjects.has(proj.name) && <span className="ml-1 opacity-60">✓</span>}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-purple-400/60 mt-2 italic">
              No ordering — all {projects.length} projects deploy at once
            </p>
          </div>
        </div>
      )}

      {/* Dependency integration notes */}
      {depNotes.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Integration & Dependency Notes
          </h4>
          <ul className="space-y-1.5">
            {depNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <span className="text-primary mt-0.5 shrink-0">→</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          {mode === 'phased' ? 'Safety Features' : 'Considerations'}
        </h4>
        <div className="text-xs text-muted-foreground">
          {mode === 'phased' ? (
            <ul className="space-y-1 list-disc list-inside">
              <li>Safe for production environments</li>
              <li>Automatic pause on failure</li>
              <li>Retry/skip individual projects</li>
              <li>Dependencies validated per phase</li>
              <li>Rollback plan generated for each phase</li>
            </ul>
          ) : (
            <ul className="space-y-1 list-disc list-inside">
              <li>All missions launched in parallel</li>
              <li>No dependency gating — order not guaranteed</li>
              <li>Fastest possible deployment</li>
              <li>Failures don't block other projects</li>
              <li>May need manual intervention if deps fail</li>
            </ul>
          )}
        </div>
      </div>

      {/* Rollback Plan */}
      {projects.length > 0 && (() => {
        const toRemove = projects.filter(p => !installedProjects.has(p.name))
        const toKeep = projects.filter(p => installedProjects.has(p.name))
        const effectivePhases2 = phases.length > 0 ? phases : generateDefaultPhases(projects)
        const rollbackPhases = [...effectivePhases2].reverse()
        return (
          <div className="pt-2 border-t border-border">
            <h4 className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
              Rollback Plan
            </h4>
            <p className="text-[10px] text-muted-foreground mb-2">
              Reverse deployment in safe order. Already-installed items are preserved.
            </p>

            {toKeep.length > 0 && (
              <div className="mb-2">
                <p className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                  Protected (will not be removed)
                </p>
                <div className="flex flex-wrap gap-1">
                  {toKeep.map(p => (
                    <span key={p.name} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {p.displayName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {toRemove.length > 0 && (
              <div>
                <p className="text-[9px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
                  {mode === 'phased' ? 'Removal Order (reverse phases)' : 'Will Be Removed'}
                </p>
                {mode === 'phased' ? (
                  <div className="space-y-1.5">
                    {rollbackPhases.map((phase, i) => {
                      const removable = phase.projectNames.filter(n => !installedProjects.has(n))
                      if (removable.length === 0) return null
                      return (
                        <div key={phase.phase} className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[9px] font-bold text-amber-400">Step {i + 1}</span>
                            <span className="text-[10px] text-muted-foreground">Remove {phase.name}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {removable.map(n => (
                              <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                helm uninstall {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {toRemove.map(p => (
                      <span key={p.name} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        helm uninstall {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {toRemove.length === 0 && (
              <p className="text-[10px] text-emerald-400 italic">
                All projects are already installed — nothing to roll back.
              </p>
            )}
          </div>
        )
      })()}
    </>
  )
}
