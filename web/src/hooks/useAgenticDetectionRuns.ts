/**
 * useAgenticDetectionRuns — fetch detection run data from issue #15554.
 *
 * This hook fetches data about agentic workflow runs where threat
 * detection flagged problems (parse errors, agent failures, etc.).
 */
import { createCachedHook } from '@/lib/cache'

const FETCH_TIMEOUT_MS = 10_000

export interface DetectionRun {
  conclusion: string
  reason: string
  workflowUrl: string
  runId: string
  commentedAt: string
  commentUrl: string
}

export interface DetectionRunsData {
  runs: DetectionRun[]
  issueUrl: string
  totalCount: number
  source: string
  cachedAt: string
  isDemoData: boolean
}

const INITIAL_DATA: DetectionRunsData = {
  runs: [],
  issueUrl: '',
  totalCount: 0,
  source: '',
  cachedAt: new Date().toISOString(),
  isDemoData: false,
}

const DEMO_DATA: DetectionRunsData = {
  runs: [
    {
      conclusion: 'warning',
      reason: 'parse_error',
      workflowUrl: 'https://github.com/kubestellar/console/actions/runs/25864572226',
      runId: '25864572226',
      commentedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      commentUrl: 'https://github.com/kubestellar/console/issues/15554#issuecomment-12345',
    },
    {
      conclusion: 'warning',
      reason: 'threat_detected',
      workflowUrl: 'https://github.com/kubestellar/console/actions/runs/25864572225',
      runId: '25864572225',
      commentedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      commentUrl: 'https://github.com/kubestellar/console/issues/15554#issuecomment-12344',
    },
    {
      conclusion: 'failure',
      reason: 'agent_failure',
      workflowUrl: 'https://github.com/kubestellar/console/actions/runs/25864572224',
      runId: '25864572224',
      commentedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      commentUrl: 'https://github.com/kubestellar/console/issues/15554#issuecomment-12343',
    },
  ],
  issueUrl: 'https://github.com/kubestellar/console/issues/15554',
  totalCount: 3,
  source: 'demo',
  cachedAt: new Date().toISOString(),
  isDemoData: true,
}

async function fetchDetectionRuns(): Promise<DetectionRunsData> {
  const resp = await fetch('/api/agentic/detection-runs', {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }
  return resp.json()
}

export const useAgenticDetectionRuns = createCachedHook<DetectionRunsData>({
  key: 'agentic-detection-runs',
  initialData: INITIAL_DATA,
  fetcher: fetchDetectionRuns,
  demoData: DEMO_DATA,
  category: 'default',
  persist: true,
})
