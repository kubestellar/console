import { validateMissionExport } from '../../lib/missions/types'
import type { MissionExport } from '../../lib/missions/types'
import { FETCH_TIMEOUT_MS } from './MissionLandingPage.constants'

// ⚠️ PERFORMANCE CRITICAL — DO NOT CHANGE WITHOUT TESTING WITH CHROME CDP ⚠️
//
// This section uses smart prefix routing to resolve mission slugs to file
// paths with 1-2 requests instead of the previous 13-directory brute-force.
// The old approach fired 13 parallel requests (12 returning 404) and took
// 10-20 seconds on cold cache. The current approach resolves in <2s.
//
// The MissionLandingPage route is also intentionally OUTSIDE the heavy
// dashboard provider stack (see App.tsx LightweightShell) to avoid loading
// 1.8MB of dashboard JS. Changing the route structure in App.tsx will
// regress this. Always verify with:
//   1. Clear browser cache via CDP: Network.clearBrowserCache
//   2. Navigate to /missions/install-karmada
//   3. Check: jsChunks < 20, totalJsKB < 300, apiCalls <= 3, pageLoadMs < 3000

/**
 * Get the most likely file paths for a mission slug based on its prefix.
 * install-* → cncf-install/ or platform-install/
 * platform-* → platform-install/
 * Others → try slug as a subdirectory hint in cncf-generated/
 */
export function getPreferredPaths(slug: string): string[] {
  if (slug.startsWith('install-')) {
    return [
      `fixes/cncf-install/${slug}.json`,
      `fixes/platform-install/${slug}.json`,
    ]
  }
  if (slug.startsWith('platform-')) {
    return [`fixes/platform-install/${slug}.json`]
  }
  // For cncf-generated missions, the slug often starts with the project name
  // e.g., "karmada-1234-some-issue" → cncf-generated/karmada/karmada-1234-some-issue.json
  const projectHint = slug.split('-')[0]
  return [
    `fixes/cncf-generated/${projectHint}/${slug}.json`,
    `fixes/security/${slug}.json`,
    `fixes/troubleshoot/${slug}.json`,
    `fixes/llm-d/${slug}.json`,
    `fixes/multi-cluster/${slug}.json`,
  ]
}

/**
 * Fetch a mission by slug. Tries the most likely paths first (1-2 requests),
 * then falls back to server-side slug resolution via index.json.
 */
export async function fetchMissionBySlug(slug: string): Promise<{ mission: MissionExport; raw: string } | null> {
  // Fast path: try preferred directories based on slug prefix
  for (const path of getPreferredPaths(slug)) {
    try {
      const url = `/api/missions/file?path=${encodeURIComponent(path)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!res.ok) continue
      const raw = await res.text()
      const parsed = JSON.parse(raw)
      const result = validateMissionExport(parsed)
      if (result.valid) return { mission: result.data, raw }
    } catch {
      continue
    }
  }

  // Fallback: search index.json for missions in unexpected directories
  try {
    const res = await fetch('/api/missions/file?path=fixes/index.json', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.ok) {
      const index = await res.json() as { missions?: Array<{ path: string }> }
      const match = (index.missions || []).find((m) => {
        const filename = (m.path || '').split('/').pop() || ''
        return filename.replace('.json', '') === slug
      })
      if (match) {
        const fileRes = await fetch(`/api/missions/file?path=${encodeURIComponent(match.path)}`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (fileRes.ok) {
          const raw = await fileRes.text()
          const parsed = JSON.parse(raw)
          const result = validateMissionExport(parsed)
          if (result.valid) return { mission: result.data, raw }
        }
      }
    }
  } catch {
    // Fallback exhausted
  }

  return null
}
