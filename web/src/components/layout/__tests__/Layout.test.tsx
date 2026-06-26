/**
 * Layout Component Tests
 *
 * Tests the main Layout component exports.
 * Layout has a deep dependency tree, so we validate the export structure
 * rather than rendering (which requires 50+ mocked modules).
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'

// Layout pulls in dozens of hooks, contexts, and sub-components.
// Rather than mock everything, we verify the module shape.
vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/constants')>()
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8080',
    FETCH_DEFAULT_TIMEOUT_MS: 5000,
    MCP_HOOK_TIMEOUT_MS: 30000,
    STORAGE_KEY_TOKEN: 'kc-token',
  }
})

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  CLOSE_ANIMATION_MS: 300,
  UI_FEEDBACK_TIMEOUT_MS: 2000,
  TOAST_DISMISS_MS: 3000,
} })

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000
const ONE_MINUTE_MS = 60 * 1000
const NOW_MS = 1_700_000_000_000
const STALE_META_THRESHOLD_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  localStorage.clear()
})

describe('Layout module', () => {
  it('exports Layout and ContentLoadingSkeleton', async () => {
    const mod = await import('../Layout')
    expect(mod.ContentLoadingSkeleton).toBeDefined()
    expect(typeof mod.ContentLoadingSkeleton).toBe('function')
    // Layout is the default export
    expect(mod.default || mod.Layout).toBeDefined()
  }, IMPORT_TIMEOUT_MS)

  it('only marks stale or corrupted kc_meta entries for removal', async () => {
    const mod = await import('../Layout')

    localStorage.setItem('kc_meta:recent', JSON.stringify({
      lastSuccessfulRefresh: NOW_MS - (STALE_META_THRESHOLD_MS - ONE_MINUTE_MS),
    }))
    localStorage.setItem('kc_meta:stale', JSON.stringify({
      lastSuccessfulRefresh: NOW_MS - (STALE_META_THRESHOLD_MS + ONE_MINUTE_MS),
    }))
    localStorage.setItem('kc_meta:legacy', JSON.stringify({
      updatedAt: NOW_MS - (STALE_META_THRESHOLD_MS + ONE_MINUTE_MS),
    }))
    localStorage.setItem('kc_meta:missing-timestamp', JSON.stringify({ consecutiveFailures: 1 }))
    localStorage.setItem('kc_meta:corrupt', '{bad-json')
    localStorage.setItem('not-meta', 'keep')

    expect(mod.getStaleCacheMetaKeys(NOW_MS).sort()).toEqual([
      'kc_meta:corrupt',
      'kc_meta:legacy',
      'kc_meta:missing-timestamp',
      'kc_meta:stale',
    ])
  })
})
