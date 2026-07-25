export const STATUS_COLORS: Record<string, string> = {
  pending: 'text-slate-500 dark:text-slate-400',
  running: 'text-amber-600 dark:text-amber-400',
  completed: 'text-green-600 dark:text-green-400',
  failed: 'text-red-600 dark:text-red-400',
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'READY TO DEPLOY',
  running: 'DEPLOYING',
  completed: 'INSTALLED',
  failed: 'FAILED',
}

export const KUBARA_HELM_REPO_URL = 'https://kubara-io.github.io/kubara'
export const KUBARA_HELM_REPO_ALIAS = 'kubara'

export function getDependencyNotes(projects: string[]): string[] {
  const notes: string[] = []
  if (projects.length === 0) return notes

  if (projects.some(p => p.toLowerCase().includes('database'))) {
    notes.push('Ensure database is healthy before deploying dependent services')
  }
  if (projects.some(p => p.toLowerCase().includes('auth'))) {
    notes.push('Authentication service should be deployed early to unblock other components')
  }
  if (projects.some(p => p.toLowerCase().includes('cache'))) {
    notes.push('Cache layer improves performance for dependent services')
  }

  return notes
}
