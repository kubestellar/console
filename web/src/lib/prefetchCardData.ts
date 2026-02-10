/**
 * Prefetch core Kubernetes data at startup so dashboard cards render instantly.
 *
 * Two tiers:
 *  1. Core data (pods, events, deployments, etc.) — most dashboards need these
 *  2. Specialty data (Prow, LLM-d) — niche dashboards, fetched after core completes
 *
 * Safety:
 * - Runs via requestIdleCallback — only when browser is idle
 * - 500ms stagger between fetches — no burst
 * - Each fetch has built-in timeouts
 * - Failures are silently ignored (cards fall back to on-demand fetch or demo data)
 */

import { prefetchCache } from './cache'
import { coreFetchers, specialtyFetchers } from '../hooks/useCachedData'

const STAGGER_MS = 500

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

  // Tier 1: Core data — staggered 500ms apart
  CORE_ENTRIES.forEach((entry, i) => {
    setTimeout(() => {
      prefetchCache(entry.key, entry.fetcher, entry.initial).catch(() => {})
    }, i * STAGGER_MS)
  })

  // Tier 2: Specialty data — starts after core completes
  const specialtyDelay = CORE_ENTRIES.length * STAGGER_MS + 1000
  SPECIALTY_ENTRIES.forEach((entry, i) => {
    setTimeout(() => {
      prefetchCache(entry.key, entry.fetcher, entry.initial).catch(() => {})
    }, specialtyDelay + i * STAGGER_MS)
  })
}
