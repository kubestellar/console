import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockDb, handleMigrate, handleSeedCache, processMessage, type MockDb } from './worker.module.shared'

/**
 * Migrate and seedCache rollback tests for worker.module.
 * Tests transaction rollback behavior on insert failures.
 */

describe('migrate / seedCache rollback via real module', () => {
  let mockDbInstance: MockDb

  beforeEach(() => {
    mockDbInstance = createMockDb()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('migrate responds with error and rolls back on insert failure', () => {
    const posted: Array<Record<string, unknown>> = []

    const origExec = mockDbInstance.exec
    const mockExec = vi.fn((sql: string, opts?: Record<string, unknown>) => {
      if (typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO cache_data')) {
        throw new Error('disk full')
      }
      return origExec(sql, opts as Parameters<typeof origExec>[1])
    })
    mockDbInstance.exec = mockExec

    processMessage(
      mockDbInstance,
      {
        id: 300,
        type: 'migrate',
        data: {
          cacheEntries: [{ key: 'k', entry: { data: 1, timestamp: 1, version: 1 } }],
          metaEntries: [],
        },
      },
      (msg) => {
        posted.push(msg)
      }
    )

    const err = posted.find(m => m.id === 300)
    expect(err!.type).toBe('error')
    expect(err!.message).toBe('disk full')

    const rollbackCall = mockExec.mock.calls.find(
      (c: unknown[]) => c[0] === 'ROLLBACK',
    )
    expect(rollbackCall).toBeDefined()
  })

  it('seedCache responds with error and rolls back on insert failure', () => {
    const posted: Array<Record<string, unknown>> = []

    const origExec2 = mockDbInstance.exec
    const mockExec2 = vi.fn((sql: string, opts?: Record<string, unknown>) => {
      if (typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO cache_data')) {
        throw new Error('io error')
      }
      return origExec2(sql, opts as Parameters<typeof origExec2>[1])
    })
    mockDbInstance.exec = mockExec2

    processMessage(
      mockDbInstance,
      {
        id: 301,
        type: 'seedCache',
        entries: [{ key: 'k', entry: { data: 1, timestamp: 1, version: 1 } }],
      },
      (msg) => {
        posted.push(msg)
      }
    )

    const err = posted.find(m => m.id === 301)
    expect(err!.type).toBe('error')
    expect(err!.message).toBe('io error')

    const rollbackCall = mockExec2.mock.calls.find(
      (c: unknown[]) => c[0] === 'ROLLBACK',
    )
    expect(rollbackCall).toBeDefined()
  })
})
