import type { PayloadProject } from '../types'

export function stripMissionPlannerJson(aiContent: string): string {
  return aiContent
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim()
}

export function getCategoryCounts(projects: PayloadProject[]): Array<[string, number]> {
  const counts: Record<string, number> = {}

  for (const project of projects) {
    counts[project.category] = (counts[project.category] || 0) + 1
  }

  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

export function getPriorityCounts(projects: PayloadProject[]) {
  return {
    required: projects.filter((project) => project.priority === 'required').length,
    recommended: projects.filter((project) => project.priority === 'recommended').length,
    optional: projects.filter((project) => project.priority === 'optional').length,
  }
}

export function getTotalDependencies(projects: PayloadProject[]): number {
  return new Set(projects.flatMap((project) => project.dependencies)).size
}
