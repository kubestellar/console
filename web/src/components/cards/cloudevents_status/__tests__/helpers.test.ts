import { describe, it, expect } from 'vitest'
import { __testables } from '../useCloudEventsStatus'

describe('CloudEvents helper functions', () => {
  it('maps source resource names to stable kinds', () => {
    expect(__testables.mapKindFromResource('pingsources')).toBe('PingSource')
    expect(__testables.mapKindFromResource('apiserversources')).toBe('ApiServerSource')
    expect(__testables.mapKindFromResource('containersources')).toBe('ContainerSource')
    expect(__testables.mapKindFromResource('unknown')).toBe('unknown')
  })

  it('derives state from Ready condition', () => {
    const readyItem = {
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    }
    const errorItem = {
      status: {
        conditions: [{ type: 'Ready', status: 'False' }],
      },
    }
    const degradedItem = {
      status: {
        conditions: [{ type: 'Ready', status: 'Unknown' }],
      },
    }

    expect(__testables.getStateFromReadyCondition(readyItem)).toBe('ready')
    expect(__testables.getStateFromReadyCondition(errorItem)).toBe('error')
    expect(__testables.getStateFromReadyCondition(degradedItem)).toBe('degraded')
  })

  it('builds count totals from Ready conditions', () => {
    const counts = __testables.buildCounts([
      { status: { conditions: [{ type: 'Ready', status: 'True' }] } },
      { status: { conditions: [{ type: 'Ready', status: 'False' }] } },
      { status: { conditions: [{ type: 'Ready', status: 'Unknown' }] } },
    ])

    expect(counts.total).toBe(3)
    expect(counts.ready).toBe(1)
    expect(counts.notReady).toBe(2)
  })
})
