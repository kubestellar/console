/**
 * useMissionControl — State management hook for the Mission Control wizard.
 *
 * Manages the 3-phase wizard state, AI conversation via useMissions,
 * console-kb project index lookup, and localStorage persistence.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMissions } from '../../hooks/useMissions'
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

// ---------------------------------------------------------------------------
// Persisted state (survives page reload / accidental close)
// ---------------------------------------------------------------------------

function loadPersistedState(): Partial<MissionControlState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<MissionControlState>
  } catch {
    return null
  }
}

function persistState(state: MissionControlState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
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
    planningMissionId: persisted?.planningMissionId,
    aiStreaming: false,
    launchProgress: persisted?.launchProgress ?? [],
    groundControlDashboardId: persisted?.groundControlDashboardId,
  }
}

// ---------------------------------------------------------------------------
// JSON extraction from AI messages
// ---------------------------------------------------------------------------

/** Extract the first ```json ... ``` block from a string */
export function extractJSON<T>(text: string): T | null {
  // Try fenced JSON blocks first
  const fenced = text.match(/```json\s*\n?([\s\S]*?)```/)
  if (fenced) {
    try {
      return JSON.parse(fenced[1]) as T
    } catch {
      // fall through
    }
  }
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
  const prevMessageCountRef = useRef(0)

  // Persist on change (debounced via effect)
  useEffect(() => {
    persistState(state)
  }, [state])

  // ---------------------------------------------------------------------------
  // AI conversation monitoring
  // ---------------------------------------------------------------------------

  // Watch the planning mission for new assistant messages
  const planningMission = missions.find((m) => m.id === state.planningMissionId)

  useEffect(() => {
    if (!planningMission) return
    const assistantMsgs = planningMission.messages.filter((m) => m.role === 'assistant')
    if (assistantMsgs.length <= prevMessageCountRef.current) return
    prevMessageCountRef.current = assistantMsgs.length

    const latest = assistantMsgs[assistantMsgs.length - 1]
    if (!latest) return

    // Try to parse structured data from the latest AI message
    if (state.phase === 'define') {
      const parsed = extractJSON<{ projects?: PayloadProject[] }>(latest.content)
      if (parsed?.projects && parsed.projects.length > 0) {
        setState((prev) => ({
          ...prev,
          projects: mergeProjects(prev.projects, parsed.projects!),
          aiStreaming: false,
        }))
      }
    } else if (state.phase === 'assign') {
      const parsed = extractJSON<{
        assignments?: ClusterAssignment[]
        phases?: DeployPhase[]
        warnings?: string[]
      }>(latest.content)
      if (parsed?.assignments) {
        setState((prev) => ({
          ...prev,
          assignments: parsed.assignments!,
          phases: parsed.phases ?? prev.phases,
          aiStreaming: false,
        }))
      }
    }
  }, [planningMission?.messages.length, state.phase, state.planningMissionId])

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

      // Remove empty assignments (clusters with no projects left)
      const nonEmpty = reconciled.filter((a) => a.projectNames.length > 0)

      // Clear phases — they'll be regenerated when user reaches Phase 2 or asks AI
      return {
        ...prev,
        assignments: nonEmpty,
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

  const askAIForSuggestions = useCallback(
    (description: string, existingProjects: PayloadProject[] = []) => {
      let missionId = state.planningMissionId

      const existingContext =
        existingProjects.length > 0
          ? `\n\nAlready selected projects:\n${JSON.stringify(existingProjects.map((p) => p.name))}`
          : ''

      const prompt = `You are helping plan a Kubernetes solution deployment.
User's goal: "${description}"
${existingContext}

First, provide a brief executive analysis of the user's requirements and your recommended architecture approach. Explain what layers of the stack need to be covered (security, networking, observability, etc.) and why.

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
          description: 'AI-assisted solution planning',
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
    [state.planningMissionId, startMission, sendMessage]
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
3. Any warnings?

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
      "warnings": ["Limited CPU headroom"],
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
    prevMessageCountRef.current = 0
    setState(makeInitialState())
  }, [])

  return {
    state,
    // Phase 1
    setDescription,
    setTitle,
    askAIForSuggestions,
    addProject,
    removeProject,
    updateProjectPriority,
    replaceProject,
    // Phase 2
    askAIForAssignments,
    setAssignment,
    moveProjectToCluster,
    // Navigation
    setPhase,
    setOverlay,
    setDeployMode,
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
