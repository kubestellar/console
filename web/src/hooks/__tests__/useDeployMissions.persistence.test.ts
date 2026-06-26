/**
 * Tests for useDeployMissions.persistence — loadMissions and saveMissions
 *
 * Covers unified storage, legacy migration, log stripping, and quota errors.
 * Part of #4189 / #16030.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadMissions, saveMissions } from '../useDeployMissions.persistence'
import { MISSIONS_STORAGE_KEY } from '../useDeployMissions.types'
import {
  STORAGE_KEY_MISSIONS_ACTIVE,
  STORAGE_KEY_MISSIONS_HISTORY,
} from '../../lib/constants'
import type { DeployMission } from '../useDeployMissions.types'

const storage = new Map<string, string>()

function makeMission(overrides: Partial<DeployMission> = {}): DeployMission {
  return {
    id: 'deploy-1',
    workload: 'nginx',
    namespace: 'default',
    sourceCluster: 'cluster-a',
    targetClusters: ['cluster-a'],
    status: 'deploying',
    clusterStatuses: [
      {
        cluster: 'cluster-a',
        status: 'applying',
        replicas: 1,
        readyReplicas: 0,
        logs: ['event line'],
      },
    ],
    startedAt: Date.now(),
    ...overrides,
  }
}

function installLocalStorageSpies() {
  vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => storage.get(key) ?? null)
  vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
    storage.set(key, value)
  })
  vi.spyOn(localStorage, 'removeItem').mockImplementation((key: string) => {
    storage.delete(key)
  })
}

beforeEach(() => {
  storage.clear()
  installLocalStorageSpies()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDeployMissions.persistence', () => {
  it('loads missions from the unified storage key on init', () => {
    const missions = [makeMission({ id: 'unified-1', status: 'orbit' })]
    storage.set(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    const loaded = loadMissions()

    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('unified-1')
    expect(loaded[0].targetClusters).toEqual(['cluster-a'])
    expect(loaded[0].clusterStatuses).toHaveLength(1)
    expect(localStorage.getItem).toHaveBeenCalledWith(MISSIONS_STORAGE_KEY)
  })

  it('migrates legacy active and history keys into the unified storage key', () => {
    const active = [makeMission({ id: 'active-1', status: 'deploying' })]
    const history = [makeMission({ id: 'history-1', status: 'orbit' })]
    storage.set(STORAGE_KEY_MISSIONS_ACTIVE, JSON.stringify(active))
    storage.set(STORAGE_KEY_MISSIONS_HISTORY, JSON.stringify(history))

    const loaded = loadMissions()

    expect(loaded).toHaveLength(2)
    expect(loaded[0].id).toBe('active-1')
    expect(loaded[1].id).toBe('history-1')
    expect(storage.get(MISSIONS_STORAGE_KEY)).toBe(JSON.stringify(loaded))
  })

  it('removes legacy keys after successful migration', () => {
    storage.set(STORAGE_KEY_MISSIONS_ACTIVE, JSON.stringify([makeMission({ id: 'active-1' })]))
    storage.set(STORAGE_KEY_MISSIONS_HISTORY, JSON.stringify([makeMission({ id: 'history-1', status: 'orbit' })]))

    loadMissions()

    expect(storage.has(STORAGE_KEY_MISSIONS_ACTIVE)).toBe(false)
    expect(storage.has(STORAGE_KEY_MISSIONS_HISTORY)).toBe(false)
    expect(localStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY_MISSIONS_ACTIVE)
    expect(localStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY_MISSIONS_HISTORY)
  })

  it('does not re-migrate after legacy keys are already removed', () => {
    const unified = [makeMission({ id: 'already-unified', status: 'orbit' })]
    storage.set(MISSIONS_STORAGE_KEY, JSON.stringify(unified))

    const loaded = loadMissions()

    expect(loaded).toEqual([
      expect.objectContaining({ id: 'already-unified' }),
    ])
    expect(localStorage.getItem).toHaveBeenCalledWith(MISSIONS_STORAGE_KEY)
    expect(localStorage.getItem).not.toHaveBeenCalledWith(STORAGE_KEY_MISSIONS_ACTIVE)
    expect(localStorage.getItem).not.toHaveBeenCalledWith(STORAGE_KEY_MISSIONS_HISTORY)
    expect(localStorage.removeItem).not.toHaveBeenCalled()
  })

  it('strips logs from non-terminal missions before persisting', () => {
    saveMissions([makeMission({ status: 'deploying' })])

    expect(localStorage.setItem).toHaveBeenCalledWith(
      MISSIONS_STORAGE_KEY,
      expect.any(String),
    )
    const stored = JSON.parse(storage.get(MISSIONS_STORAGE_KEY) ?? '[]') as DeployMission[]
    expect(stored[0].clusterStatuses[0].logs).toBeUndefined()
  })

  it('preserves full logs for terminal missions on persist', () => {
    const logs = ['rollout complete', 'pod ready']
    saveMissions([
      makeMission({
        status: 'orbit',
        clusterStatuses: [{
          cluster: 'cluster-a',
          status: 'running',
          replicas: 1,
          readyReplicas: 1,
          logs,
        }],
      }),
    ])

    const stored = JSON.parse(storage.get(MISSIONS_STORAGE_KEY) ?? '[]') as DeployMission[]
    expect(stored[0].clusterStatuses[0].logs).toEqual(logs)
  })

  it('returns empty array when storage key is missing or malformed', () => {
    expect(loadMissions()).toEqual([])

    storage.set(MISSIONS_STORAGE_KEY, '{not valid json')
    expect(loadMissions()).toEqual([])
  })

  it('does not throw when localStorage.setItem throws QuotaExceededError', () => {
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      const error = new DOMException('Quota exceeded', 'QuotaExceededError')
      throw error
    })

    expect(() => saveMissions([makeMission()])).not.toThrow()
  })
})
