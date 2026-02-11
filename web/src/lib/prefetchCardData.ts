/**
 * Prefetch core Kubernetes data at startup so dashboard cards render instantly.
 *
 * Two tiers:
 *  1. Core data (pods, events, deployments, etc.) — all fired in parallel
 *  2. Specialty data (Prow, LLM-d) — starts 1s after core, also in parallel
 *
 * Safety:
 * - Each prefetchCache call is async and non-blocking
 * - Each fetch has built-in timeouts
 * - Failures are silently ignored (cards fall back to on-demand fetch or demo data)
 */

import { prefetchCache } from './cache'
import { coreFetchers, specialtyFetchers } from '../hooks/useCachedData'
import { isDemoMode } from './demoMode'

const SPECIALTY_DELAY_MS = 1000

interface PrefetchEntry {
  key: string
  fetcher: () => Promise<unknown>
  initial: never[]
}

const CORE_ENTRIES: PrefetchEntry[] = [
  { key: 'pods:all:all:100',         fetcher: coreFetchers.pods,             initial: [] },
  { key: 'podIssues:all:all',        fetcher: coreFetchers.podIssues,        initial: [] },
  { key: 'events:all:all:20',        fetcher: coreFetchers.events,           initial: [] },
  { key: 'deploymentIssues:all:all', fetcher: coreFetchers.deploymentIssues, initial: [] },
  { key: 'deployments:all:all',      fetcher: coreFetchers.deployments,      initial: [] },
  { key: 'services:all:all',         fetcher: coreFetchers.services,         initial: [] },
  { key: 'securityIssues:all:all',   fetcher: coreFetchers.securityIssues,   initial: [] },
  { key: 'workloads:all:all',        fetcher: coreFetchers.workloads,        initial: [] },
]

const SPECIALTY_ENTRIES: PrefetchEntry[] = [
  { key: 'prowjobs:prow:prow',                    fetcher: specialtyFetchers.prowJobs,    initial: [] },
  { key: 'llmd-servers:vllm-d,platform-eval',     fetcher: specialtyFetchers.llmdServers, initial: [] },
  { key: 'llmd-models:vllm-d,platform-eval',      fetcher: specialtyFetchers.llmdModels,  initial: [] },
]

let prefetched = false

export function prefetchCardData(): void {
  if (prefetched) return
  prefetched = true

  // In demo mode, cache hooks return synchronous demo data immediately.
  // Firing API requests would waste HTTP connections that card chunk
  // downloads need (browser limits to ~6 concurrent connections per origin).
  if (isDemoMode()) return

  // Tier 1: Core data — all in parallel
  Promise.allSettled(
    CORE_ENTRIES.map(entry =>
      prefetchCache(entry.key, entry.fetcher, entry.initial)
    )
  ).catch(() => {})

  // Tier 2: Specialty data — starts 1s after core begins
  setTimeout(() => {
    Promise.allSettled(
      SPECIALTY_ENTRIES.map(entry =>
        prefetchCache(entry.key, entry.fetcher, entry.initial)
      )
    ).catch(() => {})
  }, SPECIALTY_DELAY_MS)
}
