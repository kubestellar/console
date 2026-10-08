// Shared types, status style maps, sort options and demo data for the
// GitHub CI monitor card. Extracted from GitHubCIMonitor.tsx (issue #24058).
import { MS_PER_SECOND, MS_PER_MINUTE, MS_PER_HOUR } from '../../../lib/constants/time'

const THIRTY_SECONDS_MS = 30 * MS_PER_SECOND
const TWO_MINUTES_MS = 2 * MS_PER_MINUTE
const FIVE_MINUTES_MS = 5 * MS_PER_MINUTE
const TEN_MINUTES_MS = 10 * MS_PER_MINUTE
const FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE
const TWENTY_MINUTES_MS = 20 * MS_PER_MINUTE
const THIRTY_MINUTES_MS = 30 * MS_PER_MINUTE
const TWO_HOURS_MS = 2 * MS_PER_HOUR

export interface GitHubCIConfig {
  repos?: string[]
}

export interface WorkflowRun {
  id: string
  name: string
  repo: string
  status: 'completed' | 'in_progress' | 'queued' | 'waiting'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'startup_failure' | 'action_required' | null
  branch: string
  event: string
  runNumber: number
  createdAt: string
  updatedAt: string
  url: string
  prNumber?: number
  prUrl?: string
}

export type SortField = 'name' | 'status' | 'repo' | 'branch'

export const CONCLUSION_BADGE: Record<string, string> = {
  success: 'bg-green-500/20 text-green-400',
  failure: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground',
  skipped: 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground',
  timed_out: 'bg-orange-500/20 text-orange-400',
  startup_failure: 'bg-red-500/20 text-red-400',
  action_required: 'bg-yellow-500/20 text-yellow-400' }

export const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  queued: 'bg-yellow-500/20 text-yellow-400',
  waiting: 'bg-purple-500/20 text-purple-400' }

export const CONCLUSION_ORDER: Record<string, number> = {
  failure: 0,
  startup_failure: 1,
  timed_out: 2,
  action_required: 3,
  cancelled: 4,
  skipped: 5,
  success: 6 }

export const SORT_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'name', label: 'Name' },
  { value: 'repo', label: 'Repo' },
  { value: 'branch', label: 'Branch' },
]

export const TITLE_DIAGNOSE = 'Diagnose with AI'

// Demo data for when GitHub API is not available
export const DEMO_WORKFLOWS: WorkflowRun[] = [
  { id: '1', name: 'CI / Build & Test', repo: 'kubestellar/kubestellar', status: 'completed', conclusion: 'success', branch: 'main', event: 'push', runNumber: 1234, createdAt: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(), updatedAt: new Date(Date.now() - MS_PER_MINUTE).toISOString(), url: '#' },
  { id: '2', name: 'CI / Lint', repo: 'kubestellar/kubestellar', status: 'completed', conclusion: 'failure', branch: 'feat/new-feature', event: 'pull_request', runNumber: 1233, createdAt: new Date(Date.now() - TEN_MINUTES_MS).toISOString(), updatedAt: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(), url: '#' },
  { id: '3', name: 'Release / Publish', repo: 'kubestellar/kubestellar', status: 'in_progress', conclusion: null, branch: 'main', event: 'workflow_dispatch', runNumber: 1232, createdAt: new Date(Date.now() - TWO_MINUTES_MS).toISOString(), updatedAt: new Date(Date.now() - THIRTY_SECONDS_MS).toISOString(), url: '#' },
  { id: '4', name: 'E2E Tests', repo: 'kubestellar/console', status: 'completed', conclusion: 'success', branch: 'main', event: 'push', runNumber: 567, createdAt: new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString(), updatedAt: new Date(Date.now() - TEN_MINUTES_MS).toISOString(), url: '#' },
  { id: '5', name: 'CI / Build & Test', repo: 'kubestellar/console', status: 'completed', conclusion: 'success', branch: 'feat/workload-monitor', event: 'pull_request', runNumber: 566, createdAt: new Date(Date.now() - TWENTY_MINUTES_MS).toISOString(), updatedAt: new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString(), url: '#' },
  { id: '6', name: 'Deploy Preview', repo: 'kubestellar/console', status: 'queued', conclusion: null, branch: 'feat/card-factory', event: 'pull_request', runNumber: 565, createdAt: new Date(Date.now() - MS_PER_MINUTE).toISOString(), updatedAt: new Date(Date.now() - THIRTY_SECONDS_MS).toISOString(), url: '#' },
  { id: '7', name: 'Security Scan', repo: 'kubestellar/kubestellar', status: 'completed', conclusion: 'timed_out', branch: 'main', event: 'schedule', runNumber: 1231, createdAt: new Date(Date.now() - MS_PER_HOUR).toISOString(), updatedAt: new Date(Date.now() - THIRTY_MINUTES_MS).toISOString(), url: '#' },
  { id: '8', name: 'Dependabot', repo: 'kubestellar/kubestellar', status: 'completed', conclusion: 'success', branch: 'dependabot/npm/react-19', event: 'pull_request', runNumber: 1230, createdAt: new Date(Date.now() - TWO_HOURS_MS).toISOString(), updatedAt: new Date(Date.now() - MS_PER_HOUR).toISOString(), url: '#' },
]
