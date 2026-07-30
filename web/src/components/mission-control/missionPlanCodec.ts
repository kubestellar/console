import type { MissionControlState, PayloadProject, ClusterAssignment, DeployPhase } from './types'

interface ExportablePlan {
  v: 1
  title: string
  description: string
  notes?: string
  projects: Pick<PayloadProject, 'name' | 'displayName' | 'category' | 'priority' | 'reason' | 'dependencies'>[]
  assignments: Pick<ClusterAssignment, 'clusterName' | 'provider' | 'projectNames'>[]
  phases: DeployPhase[]
  deployMode: 'phased' | 'yolo'
  createdAt: string
}

export function encodePlan(state: MissionControlState, notes?: string): string {
  const plan: ExportablePlan = {
    v: 1,
    title: state.title,
    description: state.description,
    notes: notes || undefined,
    projects: state.projects.map(p => ({
      name: p.name,
      displayName: p.displayName,
      category: p.category,
      priority: p.priority,
      reason: p.reason,
      dependencies: p.dependencies,
    })),
    assignments: state.assignments
      .filter(a => (a.projectNames ?? []).length > 0)
      .map(a => ({
        clusterName: a.clusterName,
        provider: a.provider,
        projectNames: a.projectNames,
      })),
    phases: state.phases,
    deployMode: state.deployMode,
    createdAt: new Date().toISOString(),
  }
  return btoa(encodeURIComponent(JSON.stringify(plan)))
}

export function decodePlan(encoded: string): ExportablePlan | null {
  try {
    const json = decodeURIComponent(atob(encoded))
    const plan = JSON.parse(json) as ExportablePlan
    if (plan.v !== 1 || !plan.title || !Array.isArray(plan.projects)) return null
    return plan
  } catch {
    return null
  }
}

export function planToState(plan: ExportablePlan): Partial<MissionControlState> {
  return {
    title: plan.title,
    description: plan.description,
    projects: plan.projects.map(p => ({
      ...p,
      dependencies: p.dependencies || [],
    })) as PayloadProject[],
    assignments: plan.assignments.map(a => ({
      ...a,
      clusterContext: a.clusterName,
      projectNames: a.projectNames || [],
      warnings: [],
      readiness: { cpuHeadroomPercent: 0, memHeadroomPercent: 0, storageHeadroomPercent: 0, overallScore: 0 },
    })) as ClusterAssignment[],
    phases: plan.phases,
    deployMode: plan.deployMode,
    phase: 'blueprint' as const,
  }
}

export type { ExportablePlan }
