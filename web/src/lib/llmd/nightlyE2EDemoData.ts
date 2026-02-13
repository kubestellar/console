/**
 * Demo data for the Nightly E2E Status card.
 *
 * Generates realistic workflow run history for all 10 nightly E2E guides
 * so the card renders correctly without a GitHub token.
 */

export interface NightlyWorkflowConfig {
  repo: string
  workflowFile: string
  guide: string
  platform: 'OCP' | 'GKE'
}

export interface NightlyRun {
  id: number
  status: 'completed' | 'in_progress' | 'queued'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null
  createdAt: string
  updatedAt: string
  htmlUrl: string
  runNumber: number
}

export interface NightlyGuideStatus {
  guide: string
  platform: 'OCP' | 'GKE'
  repo: string
  workflowFile: string
  runs: NightlyRun[]
  passRate: number
  trend: 'up' | 'down' | 'steady'
  latestConclusion: string | null
}

export const NIGHTLY_WORKFLOWS: NightlyWorkflowConfig[] = [
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-inference-scheduling.yaml', guide: 'Inference Scheduling', platform: 'OCP' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-pd-disaggregation.yaml', guide: 'PD Disaggregation', platform: 'OCP' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-precise-prefix-cache.yaml', guide: 'Precise Prefix Cache', platform: 'OCP' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-simulated-accelerators.yaml', guide: 'Simulated Accelerators', platform: 'OCP' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-tiered-prefix-cache.yaml', guide: 'Tiered Prefix Cache', platform: 'OCP' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-wide-ep-lws.yaml', guide: 'Wide EP + LWS', platform: 'OCP' },
  { repo: 'llm-d/llm-d-workload-variant-autoscaler', workflowFile: 'nightly-e2e-openshift.yaml', guide: 'WVA', platform: 'OCP' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-inference-scheduling-gke.yaml', guide: 'Inference Scheduling', platform: 'GKE' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-pd-disaggregation-gke.yaml', guide: 'PD Disaggregation', platform: 'GKE' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-wide-ep-lws-gke.yaml', guide: 'Wide EP + LWS', platform: 'GKE' },
]

// Seeded patterns per guide for deterministic demo data
const DEMO_PATTERNS: Record<string, ('success' | 'failure' | 'in_progress')[]> = {
  'Inference Scheduling-OCP': ['success', 'success', 'failure', 'success', 'success', 'success', 'success'],
  'PD Disaggregation-OCP': ['success', 'success', 'success', 'success', 'success', 'success', 'success'],
  'Precise Prefix Cache-OCP': ['success', 'failure', 'success', 'success', 'success', 'failure', 'success'],
  'Simulated Accelerators-OCP': ['success', 'success', 'success', 'success', 'success', 'success', 'success'],
  'Tiered Prefix Cache-OCP': ['success', 'success', 'success', 'failure', 'success', 'success', 'success'],
  'Wide EP + LWS-OCP': ['success', 'success', 'success', 'success', 'success', 'success', 'in_progress'],
  'WVA-OCP': ['success', 'failure', 'success', 'success', 'failure', 'success', 'success'],
  'Inference Scheduling-GKE': ['success', 'success', 'success', 'success', 'success', 'success', 'success'],
  'PD Disaggregation-GKE': ['failure', 'success', 'success', 'success', 'success', 'success', 'success'],
  'Wide EP + LWS-GKE': ['success', 'success', 'success', 'success', 'success', 'success', 'success'],
}

function computeTrend(runs: NightlyRun[]): 'up' | 'down' | 'steady' {
  if (runs.length < 4) return 'steady'
  const recent = runs.slice(0, 3)
  const older = runs.slice(3)
  const recentPass = recent.filter(r => r.conclusion === 'success').length / recent.length
  const olderPass = older.filter(r => r.conclusion === 'success').length / older.length
  if (recentPass > olderPass + 0.1) return 'up'
  if (recentPass < olderPass - 0.1) return 'down'
  return 'steady'
}

function computePassRate(runs: NightlyRun[]): number {
  const completed = runs.filter(r => r.status === 'completed')
  if (completed.length === 0) return 0
  return Math.round((completed.filter(r => r.conclusion === 'success').length / completed.length) * 100)
}

export function generateDemoNightlyData(): NightlyGuideStatus[] {
  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000

  return NIGHTLY_WORKFLOWS.map((wf, wfIdx) => {
    const key = `${wf.guide}-${wf.platform}`
    const pattern = DEMO_PATTERNS[key] ?? ['success', 'success', 'success', 'success', 'success', 'success', 'success']

    const runs: NightlyRun[] = pattern.map((result, i) => {
      const createdAt = new Date(now - (i * DAY_MS) - (2 * 60 * 60 * 1000)) // 2am each night
      const duration = result === 'in_progress' ? 0 : (30 + Math.random() * 30) * 60 * 1000 // 30-60 min
      const updatedAt = result === 'in_progress' ? new Date() : new Date(createdAt.getTime() + duration)

      return {
        id: 10000 + wfIdx * 100 + i,
        status: result === 'in_progress' ? 'in_progress' : 'completed',
        conclusion: result === 'in_progress' ? null : result,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        htmlUrl: `https://github.com/${wf.repo}/actions/workflows/${wf.workflowFile}`,
        runNumber: 100 - i,
      }
    })

    return {
      guide: wf.guide,
      platform: wf.platform,
      repo: wf.repo,
      workflowFile: wf.workflowFile,
      runs,
      passRate: computePassRate(runs),
      trend: computeTrend(runs),
      latestConclusion: runs[0]?.conclusion ?? runs[0]?.status ?? null,
    }
  })
}
