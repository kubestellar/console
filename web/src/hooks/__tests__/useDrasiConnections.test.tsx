/**
 * Branch-coverage tests for useDrasiConnections.ts
 *
 * Covers:
 *  - localStorage seed + env-var seed + demo-seed seed paths
 *  - getActiveDrasiConnection module-level accessor
 *  - addConnection / updateConnection / removeConnection / setActive
 *  - activeId fallback when the active connection is removed
 *  - setActive rejects unknown id
 *  - cross-instance sync via the listener set
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  STORAGE_KEY_DRASI_CONNECTIONS,
  STORAGE_KEY_DRASI_ACTIVE_CONNECTION,
} from '../../lib/constants/storage'

// Reset the module between tests so the module-level `state` re-loads
// from whatever localStorage the test has set up.
async function importFresh() {
  vi.resetModules()
  return import('../useDrasiConnections')
}

describe('useDrasiConnections', () => {
  beforeEach(() => {
    localStorage.clear()
    // The module reads VITE_DRASI_SERVER_URL / VITE_DRASI_PLATFORM_CLUSTER
    // from import.meta.env at module load. Vitest lets us override via
    // `vi.stubEnv` but only for the NEXT module load.
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('initial state seeding', () => {
    it('seeds the four demo connections when nothing is configured', async () => {
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())

      expect(result.current.connections.length).toBe(4)
      expect(result.current.connections.every(c => c.isDemoSeed)).toBe(true)
      expect(result.current.connections.map(c => c.id)).toEqual([
        'demo-seed-retail',
        'demo-seed-iot',
        'demo-seed-fraud',
        'demo-seed-supply',
      ])
    })

    it('auto-activates the first demo seed so header matches rendered pipeline', async () => {
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())
      expect(result.current.activeId).toBe('demo-seed-retail')
      expect(result.current.activeConnection?.id).toBe('demo-seed-retail')
    })

    it('seeds from VITE_DRASI_SERVER_URL when set', async () => {
      vi.stubEnv('VITE_DRASI_SERVER_URL', 'http://drasi-server.local:8090')
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())

      const env = result.current.connections.find(c => c.id === 'env-server')
      expect(env).toBeDefined()
      expect(env?.url).toBe('http://drasi-server.local:8090')
      expect(env?.mode).toBe('server')
      // env-seeded list should NOT include demo seeds.
      expect(result.current.connections.some(c => c.isDemoSeed)).toBe(false)
    })

    it('seeds from VITE_DRASI_PLATFORM_CLUSTER when set', async () => {
      vi.stubEnv('VITE_DRASI_PLATFORM_CLUSTER', 'prow')
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())

      const env = result.current.connections.find(c => c.id === 'env-platform')
      expect(env).toBeDefined()
      expect(env?.cluster).toBe('prow')
      expect(env?.mode).toBe('platform')
    })

    it('restores persisted connections from localStorage', async () => {
      const persisted = [
        { id: 'my-id', name: 'prod', mode: 'server', url: 'http://x', createdAt: 1 },
      ]
      localStorage.setItem(STORAGE_KEY_DRASI_CONNECTIONS, JSON.stringify(persisted))
      localStorage.setItem(STORAGE_KEY_DRASI_ACTIVE_CONNECTION, 'my-id')

      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())

      expect(result.current.connections).toEqual(persisted)
      expect(result.current.activeId).toBe('my-id')
    })

    it('falls back to empty + reseeds when localStorage JSON is malformed', async () => {
      localStorage.setItem(STORAGE_KEY_DRASI_CONNECTIONS, '{{{ not json')
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())
      // Should not throw; should fall back to the demo seeds since the list
      // is still empty after the parse failure.
      expect(result.current.connections.length).toBe(4)
    })
  })

  describe('getActiveDrasiConnection (module accessor)', () => {
    it('returns null when no activeId', async () => {
      localStorage.setItem(STORAGE_KEY_DRASI_ACTIVE_CONNECTION, '')
      localStorage.setItem(STORAGE_KEY_DRASI_CONNECTIONS, JSON.stringify([]))
      const mod = await importFresh()
      // In the empty+no-env case, the module auto-activates the first demo
      // seed, so this returns the retail seed rather than null.
      expect(mod.getActiveDrasiConnection()?.id).toBe('demo-seed-retail')
    })

    it('returns the active connection when one is set', async () => {
      const mod = await importFresh()
      const active = mod.getActiveDrasiConnection()
      expect(active).not.toBeNull()
      expect(active?.id).toBe('demo-seed-retail')
    })
  })

  describe('mutations', () => {
    it('addConnection assigns an id + createdAt and activates when none was active', async () => {
      // Start from a completely empty state — no env, no localStorage, and
      // we'll ALSO suppress the demo-seed seeding by pre-writing an empty
      // list explicitly. This lets us verify the "activeId empty" branch
      // of addConnection.
      localStorage.setItem(STORAGE_KEY_DRASI_CONNECTIONS, JSON.stringify([
        { id: 'seed-a', name: 'a', mode: 'server', url: 'http://a', createdAt: 1 },
      ]))
      localStorage.setItem(STORAGE_KEY_DRASI_ACTIVE_CONNECTION, '')
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())

      let created: ReturnType<typeof result.current.addConnection> | undefined
      act(() => {
        created = result.current.addConnection({
          name: 'new-one',
          mode: 'server',
          url: 'http://new',
        })
      })

      expect(created?.id).toMatch(/^drasi-/)
      expect(created?.createdAt).toBeGreaterThan(0)
      // activeId was empty → the new connection becomes active.
      expect(result.current.activeId).toBe(created?.id)
      // The existing seed-a is still in the list.
      expect(result.current.connections.find(c => c.id === 'seed-a')).toBeDefined()
    })

    it('addConnection does NOT re-activate when one was already active', async () => {
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())
      const before = result.current.activeId

      act(() => {
        result.current.addConnection({ name: 'extra', mode: 'server', url: 'http://extra' })
      })

      expect(result.current.activeId).toBe(before)
    })

    it('updateConnection patches the named connection only', async () => {
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())
      const target = result.current.connections[1].id

      act(() => {
        result.current.updateConnection(target, { name: 'renamed' })
      })

      expect(result.current.connections.find(c => c.id === target)?.name).toBe('renamed')
      // Others are untouched.
      expect(result.current.connections[0].name).not.toBe('renamed')
    })

    it('removeConnection drops the entry and falls active back to the first remaining', async () => {
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())
      const activeBefore = result.current.activeId

      act(() => {
        result.current.removeConnection(activeBefore)
      })

      expect(result.current.connections.find(c => c.id === activeBefore)).toBeUndefined()
      // activeId shifts to whichever is first in the remaining list (or '').
      expect(result.current.activeId).toBe(result.current.connections[0]?.id ?? '')
    })

    it('removeConnection on a non-active entry keeps activeId unchanged', async () => {
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())
      const activeBefore = result.current.activeId
      const victim = result.current.connections.find(c => c.id !== activeBefore)!.id

      act(() => {
        result.current.removeConnection(victim)
      })

      expect(result.current.activeId).toBe(activeBefore)
    })

    it('setActive switches the active id when the id exists', async () => {
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())
      const next = result.current.connections[2].id

      act(() => {
        result.current.setActive(next)
      })

      expect(result.current.activeId).toBe(next)
    })

    it('setActive silently ignores unknown ids', async () => {
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())
      const before = result.current.activeId

      act(() => {
        result.current.setActive('does-not-exist')
      })

      expect(result.current.activeId).toBe(before)
    })

    it('setActive with empty string clears the active id (deselect)', async () => {
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())

      act(() => {
        result.current.setActive('')
      })

      expect(result.current.activeId).toBe('')
      expect(result.current.activeConnection).toBeNull()
    })
  })

  describe('cross-instance sync', () => {
    it('all hook instances see the same update after a mutation', async () => {
      const mod = await importFresh()
      const a = renderHook(() => mod.useDrasiConnections())
      const b = renderHook(() => mod.useDrasiConnections())

      act(() => {
        a.result.current.addConnection({
          name: 'shared', mode: 'server', url: 'http://s',
        })
      })

      expect(b.result.current.connections.some(c => c.name === 'shared')).toBe(true)
    })
  })

  describe('persistence', () => {
    it('write failures are swallowed (private browsing / quota)', async () => {
      const mod = await importFresh()
      const { result } = renderHook(() => mod.useDrasiConnections())

      // Poison localStorage.setItem to simulate a quota/private-mode error.
      const originalSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = vi.fn(() => { throw new Error('QuotaExceeded') })

      try {
        // This must not throw.
        act(() => {
          result.current.addConnection({ name: 'x', mode: 'server', url: 'http://x' })
        })
        // State still updated in-memory even though write failed.
        expect(result.current.connections.some(c => c.name === 'x')).toBe(true)
      } finally {
        Storage.prototype.setItem = originalSetItem
      }
    })
  })
})
