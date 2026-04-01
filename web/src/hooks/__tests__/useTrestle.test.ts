import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks - must prevent any real WebSocket/fetch activity
// ---------------------------------------------------------------------------

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], isLoading: false })),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn().mockResolvedValue({ output: '{}', exitCode: 1 }) },
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: true }),
  getDemoMode: () => true,
}))

vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(() => vi.fn()),
  registerCacheReset: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: vi.fn(async () => {}),
}))

// ---------------------------------------------------------------------------
// Tests — module-level verification (no render to avoid setInterval hang)
// ---------------------------------------------------------------------------

describe('useTrestle', () => {
  it('exports useTrestle function', async () => {
    const mod = await import('../useTrestle')
    expect(mod).toHaveProperty('useTrestle')
    expect(typeof mod.useTrestle).toBe('function')
  })

  it('exports TrestleClusterStatus type', async () => {
    // Type-level check — module should import cleanly
    const mod = await import('../useTrestle')
    expect(mod.useTrestle).toBeDefined()
  })
})
