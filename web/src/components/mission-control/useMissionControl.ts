/**
 * useMissionControl — State management hook for the Mission Control wizard.
 *
 * Manages the 3-phase wizard state, AI conversation via useMissions,
 * console-kb project index lookup, and localStorage persistence.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useMissions } from '../../hooks/useMissions'
import { useHelmReleases } from '../../hooks/mcp/helm'
import { useClusters } from '../../hooks/mcp/clusters'
import type {
  MissionControlState,
  PayloadProject,
  ClusterAssignment,
  DeployPhase,
  WizardPhase,
  OverlayMode,
  PhaseProgress,
} from './types'

const STORAGE_KEY = 'kc_mission_control_state'
// Wizard state expires after 7 days to avoid persisting abandoned mission drafts
const WIZARD_STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Persisted state (survives page reload / accidental close)
// ---------------------------------------------------------------------------

interface PersistedStateEntry {
  state: Partial<MissionControlState>
  savedAt: number
}

function loadPersistedState(): Partial<MissionControlState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) // TTL validation applied below via WIZARD_STATE_TTL_MS
    if (!raw) return null
    const entry = JSON.parse(raw) as PersistedStateEntry | Partial<MissionControlState>
    // Support both new format (with savedAt timestamp) and legacy format (plain state)
    if ('savedAt' in entry && typeof entry.savedAt === 'number') {
      // Check TTL — discard wizard state older than WIZARD_STATE_TTL_MS
      if (Date.now() - entry.savedAt > WIZARD_STATE_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY)
        return null
      }
      return entry.state
    }
    // Legacy format — no expiry info, return as-is
    return entry as Partial<MissionControlState>
  } catch {
    return null
  }
}

function persistState(state: MissionControlState) {
  try {
    const entry: PersistedStateEntry = { state, savedAt: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // quota exceeded — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function makeInitialState(persisted?: Partial<MissionControlState> | null): MissionControlState {
  return {
    phase: persisted?.phase ?? 'define',
    description: persisted?.description ?? '',
    title: persisted?.title ?? '',
    projects: persisted?.projects ?? [],
    assignments: persisted?.assignments ?? [],
    phases: persisted?.phases ?? [],
    overlay: persisted?.overlay ?? 'architecture',
    deployMode: persisted?.deployMode ?? 'phased',
    isDryRun: persisted?.isDryRun ?? false,
    targetClusters: persisted?.targetClusters ?? [],
    planningMissionId: persisted?.planningMissionId,
    aiStreaming: false,
    launchProgress: persisted?.launchProgress ?? [],
    groundControlDashboardId: persisted?.groundControlDashboardId,
  }
}

// ---------------------------------------------------------------------------
// JSON extraction from AI messages
// ---------------------------------------------------------------------------

/**
 * Extract a JSON block from AI text. When `requiredKey` is given, tries all
 * fenced ```json blocks and returns the first one containing that key.
 * Falls back to the first parseable block otherwise.
 */
export function extractJSON<T>(text: string, requiredKey?: string): T | null {
  const fencedRe = /```json\s*\n?([\s\S]*?)```/g
  const candidates: T[] = []
  let m: RegExpExecArray | null
  while ((m = fencedRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as T
      if (requiredKey && typeof parsed === 'object' && parsed !== null && requiredKey in parsed) {
        return parsed
      }
      candidates.push(parsed)
    } catch {
      // skip unparseable blocks
    }
  }
  if (candidates.length > 0) return candidates[0]

  // Try raw JSON (starts with { or [)
  const rawMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (rawMatch) {
    try {
      return JSON.parse(rawMatch[1]) as T
    } catch {
      // fall through
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMissionControl() {
  const [state, setState] = useState<MissionControlState>(() =>
    makeInitialState(loadPersistedState())
  )
  const { startMission, sendMessage, missions } = useMissions()
  const { releases: helmReleases } = useHelmReleases()
  const { clusters } = useClusters()
  const lastParsedContentRef = useRef('')

  // Persist on change (debounced via effect)
  useEffect(() => {
    persistState(state)
  }, [state])

  // ---------------------------------------------------------------------------
  // AI conversation monitoring
  // ---------------------------------------------------------------------------

  // Watch the planning mission for new assistant messages
  const planningMission = missions.find((m) => m.id === state.planningMissionId)

  // Track content length of the latest assistant message so we can re-parse
  // when streaming appends to it (messages.length stays the same during streaming)
  const latestAssistantContent = useMemo(() => {
    if (!planningMission) return ''
    const msgs = planningMission.messages.filter((m) => m.role === 'assistant')
    return msgs[msgs.length - 1]?.content ?? ''
  }, [planningMission?.messages])

  useEffect(() => {
    if (!planningMission) return
    const assistantMsgs = planningMission.messages.filter((m) => m.role === 'assistant')
    const latest = assistantMsgs[assistantMsgs.length - 1]
    if (!latest) return

    // Skip if we already parsed this exact content
    if (latest.content === lastParsedContentRef.current) return

    // Try to parse structured data from the latest AI message
    if (state.phase === 'define') {
      const parsed = extractJSON<{ projects?: PayloadProject[] }>(latest.content, 'projects')
      if (parsed?.projects && parsed.projects.length > 0) {
        // Ensure dependencies defaults to []
        const normalized = parsed.projects.map((p) => ({
          ...p,
          dependencies: p.dependencies ?? [],
        }))
        lastParsedContentRef.current = latest.content
        setState((prev) => ({
          ...prev,
          projects: mergeProjects(prev.projects, normalized),
          aiStreaming: false,
        }))
      }
    } else if (state.phase === 'assign') {
      const parsed = extractJSON<{
        assignments?: ClusterAssignment[]
        phases?: DeployPhase[]
        warnings?: string[]
      }>(latest.content, 'assignments')
      if (parsed?.assignments) {
        lastParsedContentRef.current = latest.content
        setState((prev) => {
          const aiAssignments = parsed.assignments!
          const aiClusterNames = new Set(aiAssignments.map(a => a.clusterName))
          // Keep clusters the AI didn't mention as-is (user may have manually edited them)
          const preserved = prev.assignments
            .filter(a => !aiClusterNames.has(a.clusterName))
          return {
            ...prev,
            assignments: [...aiAssignments, ...preserved],
            phases: parsed.phases ?? prev.phases,
            aiStreaming: false,
          }
        })
      }
    }
  }, [latestAssistantContent, state.phase, state.planningMissionId, planningMission?.status])

  // Update streaming state from mission status
  useEffect(() => {
    if (!planningMission) return
    const isStreaming = planningMission.status === 'running'
    if (isStreaming !== state.aiStreaming) {
      setState((prev) => ({ ...prev, aiStreaming: isStreaming }))
    }
  }, [planningMission?.status])

  // ---------------------------------------------------------------------------
  // Reconcile assignments when projects change (cascade Phase 1 → 2 → 3)
  // ---------------------------------------------------------------------------

  const prevProjectNamesRef = useRef<string>(JSON.stringify(state.projects.map((p) => p.name).sort()))

  useEffect(() => {
    const currentKey = JSON.stringify(state.projects.map((p) => p.name).sort())
    if (currentKey === prevProjectNamesRef.current) return
    prevProjectNamesRef.current = currentKey

    // Project list changed — reconcile assignments and phases
    const projectNames = new Set(state.projects.map((p) => p.name))

    setState((prev) => {
      // Remove stale project references from assignments
      const reconciled = prev.assignments.map((a) => ({
        ...a,
        projectNames: a.projectNames.filter((n) => projectNames.has(n)),
      }))

      // Add newly-added projects to the first cluster that has assignments
      // (so the user can see and re-assign them on Chart Course)
      const allAssignedNames = new Set(reconciled.flatMap((a) => a.projectNames))
      const newProjects = [...projectNames].filter((n) => !allAssignedNames.has(n))
      if (newProjects.length > 0 && reconciled.length > 0) {
        reconciled[0] = {
          ...reconciled[0],
          projectNames: [...reconciled[0].projectNames, ...newProjects],
        }
      }

      // Keep all cluster assignments (even empty) so clusters persist in Flight Plan

      // Clear phases — they'll be regenerated when user reaches Phase 2 or asks AI
      return {
        ...prev,
        assignments: reconciled,
        phases: [],
      }
    })
  }, [state.projects])

  // ---------------------------------------------------------------------------
  // Phase 1: Define Solution
  // ---------------------------------------------------------------------------

  const setDescription = useCallback((description: string) => {
    setState((prev) => ({ ...prev, description }))
  }, [])

  const setTitle = useCallback((title: string) => {
    setState((prev) => ({ ...prev, title }))
  }, [])

  const setTargetClusters = useCallback((targetClusters: string[]) => {
    setState((prev) => ({ ...prev, targetClusters }))
  }, [])

  const askAIForSuggestions = useCallback(
    (description: string, existingProjects: PayloadProject[] = []) => {
      let missionId = state.planningMissionId

      const existingContext =
        existingProjects.length > 0
          ? `\n\nAlready selected projects:\n${JSON.stringify(existingProjects.map((p) => p.name))}`
          : ''

      // Scope AI analysis to selected target clusters (if any)
      const clusterScope = state.targetClusters.length > 0
        ? `\n\nIMPORTANT — The user has scoped this mission to these specific clusters ONLY: ${JSON.stringify(state.targetClusters)}. Do NOT analyze or suggest deployments for clusters outside this list.`
        : ''

      // Include helm release info so AI knows what's already installed
      // Filter to target clusters if scoped
      const scopedReleases = state.targetClusters.length > 0
        ? (helmReleases || []).filter(r => r.cluster && state.targetClusters.includes(r.cluster))
        : helmReleases
      const helmContext = scopedReleases?.length
        ? `\n\nIMPORTANT — Cluster inspection results (helm releases already installed across clusters):\n${JSON.stringify(scopedReleases.map(r => ({ name: r.name, chart: r.chart, namespace: r.namespace, status: r.status, cluster: r.cluster })), null, 2)}\n\nFor each suggested project, check if it is already installed on the clusters. Include a "Cluster Inspection Summary" table in your analysis showing which components are Running vs Not installed on each cluster.`
        : ''

      const prompt = `You are helping plan a Kubernetes fix deployment.
User's goal: "${description}"
${clusterScope}${existingContext}${helmContext}

First, provide a brief executive analysis of the user's requirements and your recommended architecture approach. Explain what layers of the stack need to be covered (security, networking, observability, etc.) and why.

IMPORTANT: Always include a "Cluster Inspection Summary" table showing which components are already running vs not installed on each cluster. Use the helm release data above to determine installation status.

Then suggest which CNCF/Kubernetes projects to deploy to achieve this goal.

IMPORTANT: For the "reason" field of each project, include TWO things:
1. What the project does (its core function)
2. Why it was specifically chosen for THIS user's mission goal

Example reason: "Runtime threat detection that monitors syscalls and container behavior to detect anomalous activity, privilege escalation, and policy violations in real time. Chosen for this mission because production security compliance requires continuous runtime monitoring to meet audit requirements and detect zero-day threats."

Return a JSON block with this exact structure:

\`\`\`json
{
  "projects": [
    {
      "name": "falco",
      "displayName": "Falco Runtime Security",
      "reason": "Runtime threat detection that monitors syscalls and container behavior... Chosen for this mission because...",
      "category": "Security",
      "priority": "required",
      "dependencies": ["helm"],
      "maturity": "graduated",
      "difficulty": "intermediate"
    }
  ]
}
\`\`\`

Include 3-8 projects. Mark the most critical as "required" and nice-to-haves as "recommended" or "optional".
Include real CNCF projects only. Consider dependencies between projects.`

      if (!missionId) {
        missionId = startMission({
          title: 'Mission Control Planning',
          description: 'AI-assisted fix planning',
          type: 'custom',
          initialPrompt: prompt,
        })
        setState((prev) => ({
          ...prev,
          planningMissionId: missionId,
          aiStreaming: true,
        }))
      } else {
        sendMessage(missionId, prompt)
        setState((prev) => ({ ...prev, aiStreaming: true }))
      }
    },
    [state.planningMissionId, startMission, sendMessage, helmReleases]
  )

  const addProject = useCallback((project: PayloadProject) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.some((p) => p.name === project.name)
        ? prev.projects
        : [...prev.projects, project],
    }))
  }, [])

  const removeProject = useCallback((name: string) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.name !== name),
    }))
  }, [])

  const updateProjectPriority = useCallback(
    (name: string, priority: PayloadProject['priority']) => {
      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => (p.name === name ? { ...p, priority } : p)),
      }))
    },
    []
  )

  const replaceProject = useCallback(
    (oldName: string, newProject: PayloadProject) => {
      setState((prev) => {
        // Preserve the original AI-suggested name for swap tracking
        const existing = prev.projects.find((p) => p.name === oldName)
        const originalName = existing?.originalName ?? oldName
        // If swapping back to the original, clear originalName (no longer "swapped")
        const effectiveOriginalName = newProject.name === originalName ? undefined : originalName
        return {
          ...prev,
          projects: prev.projects.map((p) =>
            p.name === oldName ? { ...newProject, originalName: effectiveOriginalName } : p
          ),
          // Also update assignments to swap the project name
          assignments: prev.assignments.map((a) => ({
            ...a,
            projectNames: a.projectNames.map((n) => (n === oldName ? newProject.name : n)),
          })),
        }
      })
    },
    []
  )

  // ---------------------------------------------------------------------------
  // Phase 2: Assign Clusters
  // ---------------------------------------------------------------------------

  const askAIForAssignments = useCallback(
    (projects: PayloadProject[], clustersJson: string) => {
      if (!state.planningMissionId) return

      const prompt = `The user selected these projects for deployment:
${JSON.stringify(projects.map((p) => ({ name: p.name, displayName: p.displayName, category: p.category, dependencies: p.dependencies, priority: p.priority })), null, 2)}

Here are the available healthy clusters with their resources:
${clustersJson}

For each cluster, determine:
1. Can it handle the assigned projects? (CPU/mem/storage headroom)
2. Are prerequisites met? (helm installed, RBAC, network policies)
3. What is already installed that may conflict or integrate?
4. Any warnings or notes?

IMPORTANT: Every cluster MUST have detailed warnings/notes analyzing its readiness. Include notes about:
- Existing deployments that overlap or conflict with assigned projects
- Available resources and headroom assessment
- Prerequisites that are met or missing (helm, RBAC, network policies, storage classes)
- Integration opportunities with existing tools
- Any risks or considerations for deployment

Optimally distribute the projects across clusters. Put related projects together when possible.
Return a JSON block:

\`\`\`json
{
  "assignments": [
    {
      "clusterName": "cluster-1",
      "clusterContext": "cluster-1-context",
      "provider": "eks",
      "projectNames": ["falco", "opa"],
      "warnings": ["cert-manager already running (3 pods) — skip install", "Limited CPU headroom (35% remaining)", "Helm CLI installed — chart-based deployments ready"],
      "readiness": {
        "cpuHeadroomPercent": 35,
        "memHeadroomPercent": 60,
        "storageHeadroomPercent": 80,
        "overallScore": 72
      }
    }
  ],
  "phases": [
    { "phase": 1, "name": "Core Infrastructure", "projectNames": ["cert-manager", "opa"], "estimatedSeconds": 120 },
    { "phase": 2, "name": "Security", "projectNames": ["falco", "trivy"], "estimatedSeconds": 180 }
  ],
  "warnings": ["Cross-cluster networking may require manual configuration"]
}
\`\`\`

Order phases by dependency — prerequisites first. Each phase completes before the next starts.`

      sendMessage(state.planningMissionId, prompt)
      setState((prev) => ({ ...prev, aiStreaming: true }))
    },
    [state.planningMissionId, sendMessage]
  )

  /** Move a project from one cluster to another (for drag-and-drop in blueprint) */
  const moveProjectToCluster = useCallback(
    (projectName: string, fromCluster: string, toCluster: string) => {
      if (fromCluster === toCluster) return
      setState((prev) => ({
        ...prev,
        assignments: prev.assignments.map((a) => {
          if (a.clusterName === fromCluster) {
            return { ...a, projectNames: a.projectNames.filter((n) => n !== projectName) }
          }
          if (a.clusterName === toCluster) {
            return { ...a, projectNames: a.projectNames.includes(projectName)
              ? a.projectNames
              : [...a.projectNames, projectName] }
          }
          return a
        }),
      }))
    },
    []
  )

  const setAssignment = useCallback(
    (clusterName: string, projectName: string, assigned: boolean) => {
      setState((prev) => {
        const assignments = [...prev.assignments]
        const idx = assignments.findIndex((a) => a.clusterName === clusterName)
        if (idx >= 0) {
          const existing = assignments[idx]
          assignments[idx] = {
            ...existing,
            projectNames: assigned
              ? [...existing.projectNames, projectName]
              : existing.projectNames.filter((n) => n !== projectName),
          }
        } else if (assigned) {
          assignments.push({
            clusterName,
            clusterContext: clusterName,
            provider: 'kubernetes',
            projectNames: [projectName],
            warnings: [],
            readiness: {
              cpuHeadroomPercent: 50,
              memHeadroomPercent: 50,
              storageHeadroomPercent: 50,
              overallScore: 50,
            },
          })
        }
        return { ...prev, assignments }
      })
    },
    []
  )

  // ---------------------------------------------------------------------------
  // Phase navigation
  // ---------------------------------------------------------------------------

  const setPhase = useCallback((phase: WizardPhase) => {
    setState((prev) => ({ ...prev, phase }))
  }, [])

  const setOverlay = useCallback((overlay: OverlayMode) => {
    setState((prev) => ({ ...prev, overlay }))
  }, [])

  const setDeployMode = useCallback((deployMode: 'phased' | 'yolo') => {
    setState((prev) => ({ ...prev, deployMode }))
  }, [])

  const setDryRun = useCallback((isDryRun: boolean) => {
    setState((prev) => ({ ...prev, isDryRun }))
  }, [])

  // ---------------------------------------------------------------------------
  // Launch
  // ---------------------------------------------------------------------------

  const updateLaunchProgress = useCallback((progress: PhaseProgress[]) => {
    setState((prev) => ({ ...prev, launchProgress: progress }))
  }, [])

  const setGroundControlDashboardId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, groundControlDashboardId: id }))
  }, [])

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    lastParsedContentRef.current = ''
    setState(makeInitialState())
  }, [])

  // Detect installed projects via helm releases + cluster namespaces
  const { installedProjects, installedOnCluster } = useMemo(() => {
    const installed = new Set<string>()
    const perCluster = new Map<string, Set<string>>() // projectName → Set<clusterName>
    if (!state.projects.length) return { installedProjects: installed, installedOnCluster: perCluster }

    // Namespace aliases — projects commonly deployed in shared namespaces
    const NS_ALIASES: Record<string, string[]> = {
      monitoring: ['prometheus', 'grafana', 'alertmanager', 'thanos'],
      observability: ['prometheus', 'grafana', 'alertmanager', 'jaeger', 'tempo'],
      logging: ['fluent-bit', 'fluentd', 'loki', 'fluentbit'],
      security: ['falco', 'kyverno', 'opa', 'trivy'],
      ingress: ['nginx', 'traefik', 'haproxy', 'ingress-nginx'],
      'gatekeeper-system': ['opa', 'open-policy-agent', 'opa-gatekeeper'],
    }

    // Build per-cluster name sets from helm releases
    const clusterNames = new Map<string, Set<string>>()
    helmReleases?.forEach(r => {
      const cName = r.cluster || '_unknown'
      if (!clusterNames.has(cName)) clusterNames.set(cName, new Set())
      const names = clusterNames.get(cName)!
      names.add(r.name.toLowerCase())
      if (r.chart) names.add(r.chart.toLowerCase().replace(/-\d+.*$/, ''))
      if (r.namespace) names.add(r.namespace.toLowerCase())
    })

    // Add cluster namespaces + expand aliases
    clusters?.forEach(c => {
      if (!clusterNames.has(c.name)) clusterNames.set(c.name, new Set())
      const names = clusterNames.get(c.name)!
      c.namespaces?.forEach(ns => {
        const lower = ns.toLowerCase()
        names.add(lower)
        const aliased = NS_ALIASES[lower]
        if (aliased) aliased.forEach(a => names.add(a))
      })
    })

    // Match projects against each cluster's known names
    for (const project of state.projects) {
      const pName = project.name.toLowerCase()
      for (const [clusterName, names] of clusterNames) {
        const found = Array.from(names).some(n =>
          n === pName || n.includes(pName) || pName.includes(n)
        )
        if (found) {
          installed.add(project.name)
          if (!perCluster.has(project.name)) perCluster.set(project.name, new Set())
          perCluster.get(project.name)!.add(clusterName)
        }
      }
    }
    return { installedProjects: installed, installedOnCluster: perCluster }
  }, [helmReleases, clusters, state.projects])

  // ---------------------------------------------------------------------------
  // Auto-assign: deterministic local algorithm (no AI)
  // ---------------------------------------------------------------------------

  const autoAssignProjects = useCallback(
    (availableClusters: Array<{ name: string; context?: string; distribution?: string; cpuCores?: number; memoryGB?: number; storageGB?: number; cpuUsageCores?: number; cpuRequestsCores?: number; memoryUsageGB?: number; memoryRequestsGB?: number }>) => {
      if (availableClusters.length === 0 || state.projects.length === 0) return

      // Category groups — projects in the same group have affinity
      const CATEGORY_GROUPS: Record<string, string> = {
        Security: 'security',
        'Runtime Security': 'security',
        'Secrets Management': 'security',
        'Policy Engine': 'security',
        Observability: 'observability',
        Monitoring: 'observability',
        Logging: 'observability',
        Tracing: 'observability',
        Networking: 'networking',
        'Service Mesh': 'networking',
        Ingress: 'networking',
        Storage: 'storage',
        'Backup & Recovery': 'storage',
      }

      // Score each cluster for resource headroom (0-100)
      const clusterScores = new Map<string, number>()
      for (const c of availableClusters) {
        const cpuTotal = c.cpuCores ?? 0
        const cpuUsed = c.cpuUsageCores ?? c.cpuRequestsCores ?? 0
        const memTotal = c.memoryGB ?? 0
        const memUsed = c.memoryUsageGB ?? c.memoryRequestsGB ?? 0
        const cpuFree = cpuTotal > 0 ? ((cpuTotal - cpuUsed) / cpuTotal) * 100 : 50
        const memFree = memTotal > 0 ? ((memTotal - memUsed) / memTotal) * 100 : 50
        clusterScores.set(c.name, (cpuFree + memFree) / 2)
      }

      // Track how many projects each cluster gets (for load balancing)
      const clusterLoad = new Map<string, number>()
      availableClusters.forEach(c => clusterLoad.set(c.name, 0))

      // Track category → preferred cluster (affinity)
      const categoryCluster = new Map<string, string>()

      // Build assignments map
      const newAssignments = new Map<string, string[]>()
      availableClusters.forEach(c => newAssignments.set(c.name, []))

      // Sort projects: required first, then recommended, then optional
      const priorityOrder = { required: 0, recommended: 1, optional: 2 }
      const sortedProjects = [...state.projects].sort(
        (a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1)
      )

      for (const project of sortedProjects) {
        const pName = project.name
        const group = CATEGORY_GROUPS[project.category] ?? project.category.toLowerCase()

        // If already installed on a cluster, assign there and skip
        const installedClusters = installedOnCluster.get(pName)
        if (installedClusters && installedClusters.size > 0) {
          // Don't add to newAssignments — it's already installed
          continue
        }

        // Score each cluster for this project
        let bestCluster = availableClusters[0].name
        let bestScore = -Infinity

        for (const c of availableClusters) {
          let score = clusterScores.get(c.name) ?? 50

          // Category affinity: strong preference to co-locate same-group projects
          if (categoryCluster.has(group) && categoryCluster.get(group) === c.name) {
            score += 30
          }

          // Dependency affinity: prefer cluster where dependencies are assigned
          for (const dep of project.dependencies ?? []) {
            const depAssigned = newAssignments.get(c.name)
            if (depAssigned?.includes(dep)) {
              score += 25
            }
          }

          // Load balancing penalty: slightly penalize clusters with more projects
          const load = clusterLoad.get(c.name) ?? 0
          score -= load * 8

          if (score > bestScore) {
            bestScore = score
            bestCluster = c.name
          }
        }

        // Assign
        newAssignments.get(bestCluster)!.push(pName)
        clusterLoad.set(bestCluster, (clusterLoad.get(bestCluster) ?? 0) + 1)

        // Record category affinity
        if (!categoryCluster.has(group)) {
          categoryCluster.set(group, bestCluster)
        }
      }

      // Build assignment objects
      setState(prev => {
        const assignments: ClusterAssignment[] = availableClusters.map(c => {
          const existing = prev.assignments.find(a => a.clusterName === c.name)
          return {
            clusterName: c.name,
            clusterContext: c.context ?? c.name,
            provider: c.distribution ?? 'kubernetes',
            projectNames: newAssignments.get(c.name) ?? [],
            warnings: existing?.warnings ?? [],
            readiness: existing?.readiness ?? {
              cpuHeadroomPercent: Math.round(clusterScores.get(c.name) ?? 50),
              memHeadroomPercent: Math.round(clusterScores.get(c.name) ?? 50),
              storageHeadroomPercent: 50,
              overallScore: Math.round(clusterScores.get(c.name) ?? 50),
            },
          }
        })
        return { ...prev, assignments }
      })
    },
    [state.projects, installedOnCluster]
  )

  return {
    state,
    installedProjects,
    installedOnCluster,
    // Phase 1
    setDescription,
    setTitle,
    setTargetClusters,
    askAIForSuggestions,
    addProject,
    removeProject,
    updateProjectPriority,
    replaceProject,
    // Phase 2
    askAIForAssignments,
    autoAssignProjects,
    setAssignment,
    moveProjectToCluster,
    // Navigation
    setPhase,
    setOverlay,
    setDeployMode,
    setDryRun,
    // Launch
    updateLaunchProgress,
    setGroundControlDashboardId,
    // Planning mission
    planningMission,
    // Reset
    reset,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merge AI-suggested projects with existing ones.
 * On refinement: replace the list with AI's new suggestions, but preserve
 * user customizations (originalName from swaps, manual priority changes).
 * Keep manually-added projects (category === 'Custom') that AI didn't mention.
 */
function mergeProjects(
  existing: PayloadProject[],
  incoming: PayloadProject[]
): PayloadProject[] {
  const existingMap = new Map(existing.map((p) => [p.name, p]))
  const result: PayloadProject[] = []

  for (const p of incoming) {
    const prev = existingMap.get(p.name)
    if (prev) {
      // Preserve user customizations (originalName, priority if changed)
      result.push({ ...p, originalName: prev.originalName })
    } else {
      result.push(p)
    }
  }

  // Keep manually-added projects that AI didn't include
  const incomingNames = new Set(incoming.map((p) => p.name))
  for (const p of existing) {
    if (p.category === 'Custom' && !incomingNames.has(p.name)) {
      result.push(p)
    }
  }

  return result
}
