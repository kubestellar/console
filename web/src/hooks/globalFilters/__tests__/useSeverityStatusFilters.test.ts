import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSeverityStatusFilters } from '../useSeverityStatusFilters'
import { NONE_SENTINEL, SEVERITY_LEVELS, STATUS_LEVELS } from '../constants'
import { patchFilters } from '../filterSelections'
import type { FilterSelections, FilterSelectionsAction } from '../filterSelections'
import type { SeverityLevel, StatusLevel } from '../types'

const mockEmitSeverity = vi.fn()
const mockEmitStatus = vi.fn()

vi.mock('../../../lib/analytics', () => ({
  emitGlobalSeverityFilterChanged: (n: number) => mockEmitSeverity(n),
  emitGlobalStatusFilterChanged: (n: number) => mockEmitStatus(n),
}))

function makeState(overrides: Partial<FilterSelections> = {}): FilterSelections {
  return { clusters: [], severities: [], statuses: [], distributions: [], customText: '', ...overrides }
}

// Dispatch that applies actions to `state` via patchFilters and records the result
function setup(severities: SeverityLevel[] = [], statuses: StatusLevel[] = []) {
  let state = makeState({ severities, statuses })
  const dispatch = vi.fn((action: FilterSelectionsAction) => { state = patchFilters(state, action) })
  const { result } = renderHook(() => useSeverityStatusFilters(dispatch, severities, statuses))
  return { result, dispatch, getState: () => state }
}

describe('useSeverityStatusFilters derived state', () => {
  beforeEach(() => {
    mockEmitSeverity.mockClear()
    mockEmitStatus.mockClear()
  })

  it('treats empty selections as all with full effective lists', () => {
    const { result } = setup()
    expect(result.current.isAllSeveritiesSelected).toBe(true)
    expect(result.current.isSeveritiesFiltered).toBe(false)
    expect(result.current.effectiveSelectedSeverities).toBe(SEVERITY_LEVELS)
    expect(result.current.isAllStatusesSelected).toBe(true)
    expect(result.current.isStatusesFiltered).toBe(false)
    expect(result.current.effectiveSelectedStatuses).toBe(STATUS_LEVELS)
  })

  it('treats non-empty selections as filtered with those effective lists', () => {
    const { result } = setup(['critical'], ['failed'])
    expect(result.current.isAllSeveritiesSelected).toBe(false)
    expect(result.current.isSeveritiesFiltered).toBe(true)
    expect(result.current.effectiveSelectedSeverities).toEqual(['critical'])
    expect(result.current.isAllStatusesSelected).toBe(false)
    expect(result.current.isStatusesFiltered).toBe(true)
    expect(result.current.effectiveSelectedStatuses).toEqual(['failed'])
  })
})

describe('severity actions', () => {
  beforeEach(() => {
    mockEmitSeverity.mockClear()
  })

  it('setSelectedSeverities dispatches and emits analytics with count', () => {
    const { result, getState } = setup()
    result.current.setSelectedSeverities(['low', 'info'])
    expect(getState().severities).toEqual(['low', 'info'])
    expect(mockEmitSeverity).toHaveBeenCalledWith(2)
  })

  it('toggleSeverity from "all" selects everything except the toggled one', () => {
    const { result, getState } = setup()
    result.current.toggleSeverity('critical')
    expect(getState().severities).toEqual(SEVERITY_LEVELS.filter(s => s !== 'critical'))
    expect(mockEmitSeverity).toHaveBeenCalledWith(SEVERITY_LEVELS.length - 1)
  })

  it('toggleSeverity removes a selected severity', () => {
    const { result, getState } = setup(['critical', 'low'])
    result.current.toggleSeverity('low')
    expect(getState().severities).toEqual(['critical'])
    expect(mockEmitSeverity).toHaveBeenCalledWith(1)
  })

  it('toggleSeverity adds an unselected severity', () => {
    const { result, getState } = setup(['critical'])
    result.current.toggleSeverity('low')
    expect(getState().severities).toEqual(['critical', 'low'])
  })

  it('toggleSeverity reverts to all when the last one is removed', () => {
    const { result, getState } = setup(['critical'])
    result.current.toggleSeverity('critical')
    expect(getState().severities).toEqual([])
    expect(mockEmitSeverity).toHaveBeenCalledWith(0)
  })

  it('toggleSeverity switches to all when every severity becomes selected', () => {
    const almostAll = SEVERITY_LEVELS.slice(1)
    const { result, getState } = setup(almostAll)
    result.current.toggleSeverity(SEVERITY_LEVELS[0])
    expect(getState().severities).toEqual([])
    expect(mockEmitSeverity).toHaveBeenCalledWith(0)
  })

  it('selectAllSeverities clears selection', () => {
    const { result, getState } = setup(['critical'])
    result.current.selectAllSeverities()
    expect(getState().severities).toEqual([])
  })

  it('deselectAllSeverities sets NONE_SENTINEL', () => {
    const { result, getState } = setup()
    result.current.deselectAllSeverities()
    expect(getState().severities).toEqual([NONE_SENTINEL])
  })
})

describe('status actions', () => {
  beforeEach(() => {
    mockEmitStatus.mockClear()
  })

  it('setSelectedStatuses dispatches and emits analytics with count', () => {
    const { result, getState } = setup()
    result.current.setSelectedStatuses(['running', 'bound'])
    expect(getState().statuses).toEqual(['running', 'bound'])
    expect(mockEmitStatus).toHaveBeenCalledWith(2)
  })

  it('toggleStatus from "all" selects everything except the toggled one', () => {
    const { result, getState } = setup()
    result.current.toggleStatus('failed')
    expect(getState().statuses).toEqual(STATUS_LEVELS.filter(s => s !== 'failed'))
    expect(mockEmitStatus).toHaveBeenCalledWith(STATUS_LEVELS.length - 1)
  })

  it('toggleStatus removes a selected status', () => {
    const { result, getState } = setup([], ['failed', 'running'])
    result.current.toggleStatus('running')
    expect(getState().statuses).toEqual(['failed'])
    expect(mockEmitStatus).toHaveBeenCalledWith(1)
  })

  it('toggleStatus adds an unselected status', () => {
    const { result, getState } = setup([], ['failed'])
    result.current.toggleStatus('running')
    expect(getState().statuses).toEqual(['failed', 'running'])
  })

  it('toggleStatus reverts to all when the last one is removed', () => {
    const { result, getState } = setup([], ['failed'])
    result.current.toggleStatus('failed')
    expect(getState().statuses).toEqual([])
    expect(mockEmitStatus).toHaveBeenCalledWith(0)
  })

  it('toggleStatus switches to all when every status becomes selected', () => {
    const { result, getState } = setup([], STATUS_LEVELS.slice(1))
    result.current.toggleStatus(STATUS_LEVELS[0])
    expect(getState().statuses).toEqual([])
    expect(mockEmitStatus).toHaveBeenCalledWith(0)
  })

  it('selectAllStatuses clears selection', () => {
    const { result, getState } = setup([], ['failed'])
    result.current.selectAllStatuses()
    expect(getState().statuses).toEqual([])
  })

  it('deselectAllStatuses sets NONE_SENTINEL', () => {
    const { result, getState } = setup()
    result.current.deselectAllStatuses()
    expect(getState().statuses).toEqual([NONE_SENTINEL])
  })
})
