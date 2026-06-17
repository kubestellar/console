import { describe, it, expect } from 'vitest'
import type { WorkerRequest, WorkerResponse } from '../workerMessages'
import { makeWorkerRequestId, makeWorkerKey } from './worker.helpers'

describe('worker dispatch handlers', () => {
  it('supports dispatchable worker request variants', () => {
    const id = makeWorkerRequestId(7)
    const key = makeWorkerKey('services')
    const requests: WorkerRequest[] = [
      { id, type: 'get', key },
      { id: id + 1, type: 'setPreference', key: 'theme', value: 'dark' },
      { id: id + 2, type: 'getStats' },
    ]

    expect(requests.map(r => r.type)).toEqual(['get', 'setPreference', 'getStats'])
  })

  it('supports worker result and ready response dispatch types', () => {
    const result: WorkerResponse = { id: makeWorkerRequestId(), type: 'result', value: { ok: true } }
    const ready: WorkerResponse = { id: -1, type: 'ready' }

    expect(result.type).toBe('result')
    expect(ready.type).toBe('ready')
  })
})
