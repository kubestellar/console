/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readHistory, writeHistory, mergeIntoHistory } from '../history'
import type { HistoryBlob, WorkflowRun } from '../types'

function makeStore(data: Record<string, string> = {}) {
  const store: Record<string, string> = { ...data }
  return {
    get: vi.fn(async (key: string) => store[key] ?? null),
    set: vi.fn(async (key: string, value: string) => { store[key] = value }),
    _data: store,
  }
}

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 1000,
    repo: 'kubestellar/console',
    name: 'CI',
    workflowId: 1,
    headBranch: 'main',
    status: 'completed',
    conclusion: 'success',
    event: 'push',
    runNumber: 1,
    htmlUrl: 'https://github.com/kubestellar/console/actions/runs/1000',
    createdAt: '2026-07-01T12:00:00Z',
    updatedAt: '2026-07-01T12:05:00Z',
    ...overrides,
  }
}

// ── readHistory ─────────────────────────────────────────────────

describe('readHistory', () => {
  it('returns empty blob when store has no data', async () => {
    const store = makeStore()
    const result = await readHistory(store as any)
    expect(result.days).toEqual({})
    expect(result.updatedAt).toBe(new Date(0).toISOString())
  })

  it('returns parsed data from store', async () => {
    const blob: HistoryBlob = {
      updatedAt: '2026-07-01T00:00:00Z',
      days: {
        'kubestellar/console': {
          'CI': {
            '2026-07-01': { runId: 100, conclusion: 'success', htmlUrl: 'http://x' },
          },
        },
      },
    }
    const store = makeStore({ 'history-v1': JSON.stringify(blob) })
    const result = await readHistory(store as any)
    expect(result.updatedAt).toBe('2026-07-01T00:00:00Z')
    expect(result.days['kubestellar/console']['CI']['2026-07-01'].runId).toBe(100)
  })

  it('returns empty blob on malformed JSON', async () => {
    const store = makeStore({ 'history-v1': '{broken json' })
    const result = await readHistory(store as any)
    expect(result.days).toEqual({})
  })

  it('returns empty blob on store exception', async () => {
    const store = makeStore()
    store.get = vi.fn().mockRejectedValue(new Error('network error'))
    const result = await readHistory(store as any)
    expect(result.days).toEqual({})
  })
})

// ── writeHistory ────────────────────────────────────────────────

describe('writeHistory', () => {
  it('writes history to store', async () => {
    const store = makeStore()
    const history: HistoryBlob = {
      updatedAt: '2026-01-01T00:00:00Z',
      days: {
        'repo': { 'wf': { '2026-07-01': { runId: 1, conclusion: 'success', htmlUrl: 'x' } } },
      },
    }

    await writeHistory(store as any, history)

    expect(store.set).toHaveBeenCalledWith('history-v1', expect.any(String))
    const written = JSON.parse(store.set.mock.calls[0][1])
    expect(written.days.repo.wf['2026-07-01']).toBeDefined()
    expect(new Date(written.updatedAt).getTime()).toBeGreaterThan(0)
  })

  it('trims days older than retention window', async () => {
    const store = makeStore()
    const oldDate = '2020-01-01' // Well beyond 90 days
    const recentDate = new Date().toISOString().slice(0, 10)
    const history: HistoryBlob = {
      updatedAt: '2020-01-01T00:00:00Z',
      days: {
        'repo': {
          'wf': {
            [oldDate]: { runId: 1, conclusion: 'success', htmlUrl: 'x' },
            [recentDate]: { runId: 2, conclusion: 'success', htmlUrl: 'y' },
          },
        },
      },
    }

    await writeHistory(store as any, history)

    const written = JSON.parse(store.set.mock.calls[0][1])
    expect(written.days.repo.wf[oldDate]).toBeUndefined()
    expect(written.days.repo.wf[recentDate]).toBeDefined()
  })

  it('updates updatedAt timestamp', async () => {
    const store = makeStore()
    const history: HistoryBlob = { updatedAt: '2020-01-01T00:00:00Z', days: {} }
    const before = Date.now()

    await writeHistory(store as any, history)

    const written = JSON.parse(store.set.mock.calls[0][1])
    const writtenTime = new Date(written.updatedAt).getTime()
    expect(writtenTime).toBeGreaterThanOrEqual(before)
  })
})

// ── mergeIntoHistory ────────────────────────────────────────────

describe('mergeIntoHistory', () => {
  let history: HistoryBlob

  beforeEach(() => {
    history = { updatedAt: '2026-07-01T00:00:00Z', days: {} }
  })

  it('adds a new run to empty history', () => {
    const run = makeRun()
    mergeIntoHistory(history, [run])

    expect(history.days['kubestellar/console']['CI']['2026-07-01']).toEqual({
      runId: 1000,
      conclusion: 'success',
      htmlUrl: 'https://github.com/kubestellar/console/actions/runs/1000',
    })
  })

  it('newer run (higher ID) replaces older run for same day', () => {
    history.days = {
      'kubestellar/console': {
        'CI': {
          '2026-07-01': { runId: 500, conclusion: 'failure', htmlUrl: 'old' },
        },
      },
    }

    const newerRun = makeRun({ id: 1500, conclusion: 'success' })
    mergeIntoHistory(history, [newerRun])

    expect(history.days['kubestellar/console']['CI']['2026-07-01'].runId).toBe(1500)
    expect(history.days['kubestellar/console']['CI']['2026-07-01'].conclusion).toBe('success')
  })

  it('older run (lower ID) does NOT replace existing entry', () => {
    history.days = {
      'kubestellar/console': {
        'CI': {
          '2026-07-01': { runId: 2000, conclusion: 'success', htmlUrl: 'newer' },
        },
      },
    }

    const olderRun = makeRun({ id: 500, conclusion: 'failure' })
    mergeIntoHistory(history, [olderRun])

    expect(history.days['kubestellar/console']['CI']['2026-07-01'].runId).toBe(2000)
  })

  it('handles multiple repos in the same batch', () => {
    const run1 = makeRun({ repo: 'kubestellar/console', name: 'CI' })
    const run2 = makeRun({ repo: 'kubestellar/docs', name: 'Build', id: 2000 })
    mergeIntoHistory(history, [run1, run2])

    expect(history.days['kubestellar/console']['CI']).toBeDefined()
    expect(history.days['kubestellar/docs']['Build']).toBeDefined()
  })

  it('handles multiple workflows in the same repo', () => {
    const run1 = makeRun({ name: 'CI', id: 100 })
    const run2 = makeRun({ name: 'Release', id: 200 })
    mergeIntoHistory(history, [run1, run2])

    expect(history.days['kubestellar/console']['CI']).toBeDefined()
    expect(history.days['kubestellar/console']['Release']).toBeDefined()
  })

  it('handles multiple days for the same workflow', () => {
    const run1 = makeRun({ createdAt: '2026-07-01T10:00:00Z', id: 100 })
    const run2 = makeRun({ createdAt: '2026-07-02T10:00:00Z', id: 200 })
    mergeIntoHistory(history, [run1, run2])

    expect(history.days['kubestellar/console']['CI']['2026-07-01']).toBeDefined()
    expect(history.days['kubestellar/console']['CI']['2026-07-02']).toBeDefined()
  })

  it('converts null conclusion with in_progress status to "in_progress"', () => {
    const run = makeRun({ conclusion: null, status: 'in_progress' })
    mergeIntoHistory(history, [run])

    expect(history.days['kubestellar/console']['CI']['2026-07-01'].conclusion).toBe('in_progress')
  })

  it('converts null conclusion with queued status to "in_progress"', () => {
    const run = makeRun({ conclusion: null, status: 'queued' })
    mergeIntoHistory(history, [run])

    expect(history.days['kubestellar/console']['CI']['2026-07-01'].conclusion).toBe('in_progress')
  })

  it('keeps null conclusion when status is completed', () => {
    const run = makeRun({ conclusion: null, status: 'completed' })
    mergeIntoHistory(history, [run])

    expect(history.days['kubestellar/console']['CI']['2026-07-01'].conclusion).toBeNull()
  })

  it('skips runs with empty createdAt (dayKey returns empty string)', () => {
    const run = makeRun({ createdAt: '' })
    mergeIntoHistory(history, [run])

    // Empty dayKey returns '' which is falsy, so it should be skipped
    const repo = history.days['kubestellar/console']
    if (repo) {
      const wf = repo['CI']
      if (wf) {
        expect(wf['']).toBeUndefined()
      }
    }
  })

  it('handles empty runs array', () => {
    mergeIntoHistory(history, [])
    expect(history.days).toEqual({})
  })

  it('processes batch of runs in order', () => {
    const runs = [
      makeRun({ id: 100, createdAt: '2026-07-01T08:00:00Z', conclusion: 'failure' }),
      makeRun({ id: 200, createdAt: '2026-07-01T12:00:00Z', conclusion: 'success' }),
      makeRun({ id: 300, createdAt: '2026-07-01T16:00:00Z', conclusion: 'failure' }),
    ]
    mergeIntoHistory(history, runs)

    // Last one (id=300) should win since it has the highest ID
    expect(history.days['kubestellar/console']['CI']['2026-07-01'].runId).toBe(300)
    expect(history.days['kubestellar/console']['CI']['2026-07-01'].conclusion).toBe('failure')
  })
})
