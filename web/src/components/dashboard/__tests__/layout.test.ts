/**
 * Unit tests for dashboard/layout.ts
 *
 * Covers dashboardCollisionDetection branches for workload drags
 * (cluster-group / cluster-drop / cluster-groups-card / dashboard-drop
 * priorities and the "no match" fallback) and card-reorder drags
 * (dashboard-drop override vs closestCenter fallback).
 *
 * Run: npx vitest run src/components/dashboard/__tests__/layout.test.ts
 */
import { describe, it, expect, vi } from 'vitest'

// Mock @dnd-kit/core's collision helpers so we can drive the
// dashboardCollisionDetection strategy deterministically without
// building real DnD contexts.
const { mockClosestCenter, mockPointerWithin, mockRectIntersection } = vi.hoisted(() => ({
  mockClosestCenter: vi.fn(),
  mockPointerWithin: vi.fn(),
  mockRectIntersection: vi.fn(),
}))

vi.mock('@dnd-kit/core', () => ({
  closestCenter: (args: unknown) => mockClosestCenter(args),
  pointerWithin: (args: unknown) => mockPointerWithin(args),
  rectIntersection: (args: unknown) => mockRectIntersection(args),
}))

import {
  dashboardCollisionDetection,
  POINTER_SENSOR_ACTIVATION_DISTANCE,
} from '../layout'

type Collision = { id: string }

function workloadArgs() {
  return { active: { data: { current: { type: 'workload' } } } } as any
}

function reorderArgs() {
  return { active: { data: { current: { type: 'card' } } } } as any
}

describe('POINTER_SENSOR_ACTIVATION_DISTANCE', () => {
  it('is 3px so drags only activate after intentional pointer movement', () => {
    expect(POINTER_SENSOR_ACTIVATION_DISTANCE).toBe(3)
  })
})

describe('dashboardCollisionDetection — workload drag', () => {
  it('prefers cluster-group-* targets over other collisions', () => {
    mockPointerWithin.mockReturnValueOnce([{ id: 'cluster-groups-card' }])
    mockRectIntersection.mockReturnValueOnce([{ id: 'cluster-group-prod' }])
    const result = dashboardCollisionDetection(workloadArgs()) as Collision[]
    expect(result).toEqual([{ id: 'cluster-group-prod' }])
  })

  it('prefers cluster-drop-* targets over other collisions', () => {
    mockPointerWithin.mockReturnValueOnce([{ id: 'cluster-groups-card' }])
    mockRectIntersection.mockReturnValueOnce([{ id: 'cluster-drop-c1' }])
    const result = dashboardCollisionDetection(workloadArgs()) as Collision[]
    expect(result).toEqual([{ id: 'cluster-drop-c1' }])
  })

  it('falls back to cluster-groups-card when no cluster targets present', () => {
    mockPointerWithin.mockReturnValueOnce([{ id: 'cluster-groups-card' }])
    mockRectIntersection.mockReturnValueOnce([])
    const result = dashboardCollisionDetection(workloadArgs()) as Collision[]
    expect(result).toEqual([{ id: 'cluster-groups-card' }])
  })

  it('falls back to dashboard-drop-* when no cluster or card targets', () => {
    mockPointerWithin.mockReturnValueOnce([{ id: 'dashboard-drop-2' }])
    mockRectIntersection.mockReturnValueOnce([])
    const result = dashboardCollisionDetection(workloadArgs()) as Collision[]
    expect(result).toEqual([{ id: 'dashboard-drop-2' }])
  })

  it('falls back to create-new-dashboard drop target', () => {
    mockPointerWithin.mockReturnValueOnce([{ id: 'create-new-dashboard' }])
    mockRectIntersection.mockReturnValueOnce([])
    const result = dashboardCollisionDetection(workloadArgs()) as Collision[]
    expect(result).toEqual([{ id: 'create-new-dashboard' }])
  })

  it('returns an empty array (blocks drop) when no valid target exists', () => {
    mockPointerWithin.mockReturnValueOnce([{ id: 'some-other' }])
    mockRectIntersection.mockReturnValueOnce([{ id: 'another-thing' }])
    const result = dashboardCollisionDetection(workloadArgs()) as Collision[]
    expect(result).toEqual([])
  })

  it('deduplicates collisions that appear in both pointerWithin and rectIntersection', () => {
    // Same id in both lists — should only produce one entry, then
    // fall through to dashboard-drop resolution.
    mockPointerWithin.mockReturnValueOnce([{ id: 'dashboard-drop-1' }])
    mockRectIntersection.mockReturnValueOnce([{ id: 'dashboard-drop-1' }])
    const result = dashboardCollisionDetection(workloadArgs()) as Collision[]
    expect(result).toEqual([{ id: 'dashboard-drop-1' }])
  })
})

describe('dashboardCollisionDetection — card reorder drag', () => {
  it('routes to dashboard-drop-* when the pointer is over one', () => {
    mockPointerWithin.mockReturnValueOnce([{ id: 'dashboard-drop-3' }])
    mockClosestCenter.mockReturnValueOnce([{ id: 'card-a' }])
    const result = dashboardCollisionDetection(reorderArgs()) as Collision[]
    expect(result).toEqual([{ id: 'dashboard-drop-3' }])
  })

  it('routes to create-new-dashboard when the pointer is over it', () => {
    mockPointerWithin.mockReturnValueOnce([{ id: 'create-new-dashboard' }])
    mockClosestCenter.mockReturnValueOnce([{ id: 'card-a' }])
    const result = dashboardCollisionDetection(reorderArgs()) as Collision[]
    expect(result).toEqual([{ id: 'create-new-dashboard' }])
  })

  it('falls back to closestCenter for normal card reorders', () => {
    mockPointerWithin.mockReturnValueOnce([{ id: 'card-b' }])
    const centerResult = [{ id: 'card-a' }, { id: 'card-b' }]
    mockClosestCenter.mockReturnValueOnce(centerResult)
    const result = dashboardCollisionDetection(reorderArgs())
    expect(result).toBe(centerResult)
  })

  it('treats missing active.data.current as a reorder drag', () => {
    mockPointerWithin.mockReturnValueOnce([])
    const centerResult = [{ id: 'card-x' }]
    mockClosestCenter.mockReturnValueOnce(centerResult)
    const result = dashboardCollisionDetection({ active: { data: { current: undefined } } } as any)
    expect(result).toBe(centerResult)
  })
})
