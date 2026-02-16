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
const BACKGROUND_DELAY_MS = 5000
const PREFETCH_CONCURRENCY = 2

interface PrefetchEntry {
  key: string
  fetcher: () => Promise<unknown>
  initial: never[]
}

const PRIORITY_ENTRIES: PrefetchEntry[] = [
  { key: 'pods:all:all:100',         fetcher: coreFetchers.pods,             initial: [] },
  { key: 'podIssues:all:all',        fetcher: coreFetchers.podIssues,        initial: [] },
  { key: 'events:all:all:20',        fetcher: coreFetchers.events,           initial: [] },
  { key: 'deploymentIssues:all:all', fetcher: coreFetchers.deploymentIssues, initial: [] },
]

const CORE_ENTRIES: PrefetchEntry[] = [
  { key: 'deployments:all:all',      fetcher: coreFetchers.deployments,      initial: [] },
  { key: 'services:all:all',         fetcher: coreFetchers.services,         initial: [] },
  { key: 'workloads:all:all',        fetcher: coreFetchers.workloads,        initial: [] },
]

const BACKGROUND_ENTRIES: PrefetchEntry[] = [
  { key: 'securityIssues:all:all',   fetcher: coreFetchers.securityIssues,   initial: [] },
]

const SPECIALTY_ENTRIES: PrefetchEntry[] = [
  { key: 'prowjobs:prow:prow',                    fetcher: specialtyFetchers.prowJobs,    initial: [] },
  { key: 'llmd-servers:vllm-d,platform-eval',     fetcher: specialtyFetchers.llmdServers, initial: [] },
  { key: 'llmd-models:vllm-d,platform-eval',      fetcher: specialtyFetchers.llmdModels,  initial: [] },
]

let prefetched = false

async function runPrefetchQueue(entries: PrefetchEntry[]): Promise<void> {
  if (entries.length === 0) return

  let cursor = 0
  const workers = Array.from({ length: Math.min(PREFETCH_CONCURRENCY, entries.length) }, async () => {
    while (cursor < entries.length) {
      const current = entries[cursor++]
      try {
        await prefetchCache(current.key, current.fetcher, current.initial)
      } catch {
        // Ignore individual prefetch failures — cards will fetch on demand.
      }
    }
  })

  await Promise.all(workers)
}

export function prefetchCardData(): void {
  if (prefetched) return
  prefetched = true

  // In demo mode, cache hooks return synchronous demo data immediately.
  // Firing API requests would waste HTTP connections that card chunk
  // downloads need (browser limits to ~6 concurrent connections per origin).
  if (isDemoMode()) return

  // Tier 1: Priority data for initial dashboard cards.
  runPrefetchQueue(PRIORITY_ENTRIES).catch(() => {})

  // Tier 2: Core data after priority warm-up.
  setTimeout(() => {
    runPrefetchQueue(CORE_ENTRIES).catch(() => {})
  }, 400)

  // Tier 3: Heavy fetchers in background (security scans can be expensive).
  setTimeout(() => {
    runPrefetchQueue(BACKGROUND_ENTRIES).catch(() => {})
  }, BACKGROUND_DELAY_MS)

  // Tier 4: Specialty data — starts after core prefetch begins.
  setTimeout(() => {
    runPrefetchQueue(SPECIALTY_ENTRIES).catch(() => {})
  }, SPECIALTY_DELAY_MS)
}
