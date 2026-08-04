import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../../types/stellar'
import type { GroupConfig } from './types'

// ── Mock getSolveStatus so we can steer per-notification outcomes ───────────
const getSolveStatusMock = vi.fn()
vi.mock('../lib/derive', () => ({
  getSolveStatus: (notif: unknown, solves: unknown, progress: unknown) =>
    getSolveStatusMock(notif, solves, progress),
}))

import { getGroupSubtitle } from './helpers'

// ── Test fixtures ──────────────────────────────────────────────────────────

const CRITICAL_GROUP: GroupConfig = {
  key: 'critical',
  label: 'Critical alerts',
  subtitle: 'Auto-investigation in progress',
  color: 'var(--s-critical)',
  background: 'rgba(229,73,73,0.06)',
}

const WARNING_GROUP: GroupConfig = {
  key: 'warning',
  label: 'High priority',
  subtitle: 'Investigation complete, awaiting input',
  color: 'var(--s-warning)',
  background: 'rgba(227,179,65,0.05)',
}

const INFO_GROUP: GroupConfig = {
  key: 'info',
  label: 'Info',
  subtitle: 'On-demand investigation',
  color: 'var(--s-info)',
  background: 'transparent',
}

const notif = (id: string): StellarNotification => ({ id } as StellarNotification)

// A minimal status factory. Only the fields getGroupSubtitle inspects matter.
type Phase = 'investigating' | 'root_cause' | 'solving' | 'resolved' | 'resolved_monitored' | 'escalated' | 'exhausted' | 'unknown'
const status = (isActive: boolean, phase: Phase) => ({
  label: '', color: '', percent: 0, isActive, phase,
})

beforeEach(() => {
  getSolveStatusMock.mockReset()
})

// ── warning group ──────────────────────────────────────────────────────────

describe('getGroupSubtitle / warning group', () => {
  it('returns the static high-priority instruction regardless of items', () => {
    expect(getGroupSubtitle(WARNING_GROUP, [notif('a'), notif('b')], [], {})).toBe(
      'Click investigate or dismiss',
    )
    expect(getSolveStatusMock).not.toHaveBeenCalled()
  })

  it('ignores getSolveStatus entirely for warning group (no calls)', () => {
    getSolveStatusMock.mockReturnValue(status(true, 'solving'))
    getGroupSubtitle(WARNING_GROUP, [notif('x')], [], {})
    expect(getSolveStatusMock).not.toHaveBeenCalled()
  })
})

// ── info group ─────────────────────────────────────────────────────────────

describe('getGroupSubtitle / info (and other) groups', () => {
  it('returns the group.subtitle field for info group', () => {
    expect(getGroupSubtitle(INFO_GROUP, [notif('a')], [], {})).toBe('On-demand investigation')
  })

  it('preserves whatever caller-supplied subtitle string the group carries', () => {
    const custom: GroupConfig = { ...INFO_GROUP, subtitle: 'Custom subtitle for info' }
    expect(getGroupSubtitle(custom, [], [], {})).toBe('Custom subtitle for info')
  })

  it('never invokes getSolveStatus for non-critical groups', () => {
    getSolveStatusMock.mockReturnValue(status(true, 'solving'))
    getGroupSubtitle(INFO_GROUP, [notif('x')], [], {})
    expect(getSolveStatusMock).not.toHaveBeenCalled()
  })
})

// ── critical group ─────────────────────────────────────────────────────────

describe('getGroupSubtitle / critical group', () => {
  it('returns "Awaiting Stellar pickup" when items is empty', () => {
    expect(getGroupSubtitle(CRITICAL_GROUP, [], [], {})).toBe('Awaiting Stellar pickup')
    expect(getSolveStatusMock).not.toHaveBeenCalled()
  })

  it('returns "Awaiting Stellar pickup" when getSolveStatus is null for every item', () => {
    getSolveStatusMock.mockReturnValue(null)
    expect(getGroupSubtitle(CRITICAL_GROUP, [notif('a'), notif('b'), notif('c')], [], {})).toBe(
      'Awaiting Stellar pickup',
    )
    expect(getSolveStatusMock).toHaveBeenCalledTimes(3)
  })

  it('counts a single active status as "1 solving"', () => {
    getSolveStatusMock.mockReturnValueOnce(status(true, 'solving'))
    expect(getGroupSubtitle(CRITICAL_GROUP, [notif('a')], [], {})).toBe('1 solving')
  })

  it('counts a single resolved status as "1 resolved"', () => {
    getSolveStatusMock.mockReturnValueOnce(status(false, 'resolved'))
    expect(getGroupSubtitle(CRITICAL_GROUP, [notif('a')], [], {})).toBe('1 resolved')
  })

  it('counts an escalated status as "1 needs you"', () => {
    getSolveStatusMock.mockReturnValueOnce(status(false, 'escalated'))
    expect(getGroupSubtitle(CRITICAL_GROUP, [notif('a')], [], {})).toBe('1 needs you')
  })

  it('counts an exhausted status as "needs you" (same bucket as escalated)', () => {
    getSolveStatusMock.mockReturnValueOnce(status(false, 'exhausted'))
    expect(getGroupSubtitle(CRITICAL_GROUP, [notif('a')], [], {})).toBe('1 needs you')
  })

  it('joins multiple non-zero buckets with " · " in the canonical order active/resolved/escalated', () => {
    getSolveStatusMock
      .mockReturnValueOnce(status(true, 'solving'))
      .mockReturnValueOnce(status(false, 'resolved'))
      .mockReturnValueOnce(status(false, 'escalated'))
    expect(getGroupSubtitle(CRITICAL_GROUP, [notif('a'), notif('b'), notif('c')], [], {})).toBe(
      '1 solving · 1 resolved · 1 needs you',
    )
  })

  it('accumulates counts within each bucket', () => {
    getSolveStatusMock
      .mockReturnValueOnce(status(true, 'investigating')) // active++
      .mockReturnValueOnce(status(true, 'root_cause'))    // active++
      .mockReturnValueOnce(status(false, 'resolved'))     // resolved++
      .mockReturnValueOnce(status(false, 'resolved'))     // resolved++
      .mockReturnValueOnce(status(false, 'escalated'))    // escalated++
      .mockReturnValueOnce(status(false, 'exhausted'))    // escalated++
    expect(getGroupSubtitle(
      CRITICAL_GROUP,
      [notif('a'), notif('b'), notif('c'), notif('d'), notif('e'), notif('f')],
      [], {},
    )).toBe('2 solving · 2 resolved · 2 needs you')
  })

  it('active takes precedence over the phase — active + resolved phase counts as solving', () => {
    // Documenting current behaviour: isActive is checked first, so an item
    // with isActive=true never falls through to phase-based buckets.
    getSolveStatusMock.mockReturnValueOnce(status(true, 'resolved'))
    expect(getGroupSubtitle(CRITICAL_GROUP, [notif('a')], [], {})).toBe('1 solving')
  })

  it('resolved_monitored phase is NOT counted (does not match any bucket)', () => {
    getSolveStatusMock.mockReturnValueOnce(status(false, 'resolved_monitored'))
    // Neither active, nor exactly 'resolved', nor escalated/exhausted → not counted.
    expect(getGroupSubtitle(CRITICAL_GROUP, [notif('a')], [], {})).toBe('Awaiting Stellar pickup')
  })

  it('"unknown"/"investigating"/"root_cause" phases with isActive=false are not counted', () => {
    getSolveStatusMock
      .mockReturnValueOnce(status(false, 'investigating'))
      .mockReturnValueOnce(status(false, 'root_cause'))
      .mockReturnValueOnce(status(false, 'unknown'))
    expect(getGroupSubtitle(CRITICAL_GROUP, [notif('a'), notif('b'), notif('c')], [], {})).toBe(
      'Awaiting Stellar pickup',
    )
  })

  it('null status items are skipped without breaking counting of the rest', () => {
    getSolveStatusMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(status(true, 'solving'))
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(status(false, 'resolved'))
    expect(getGroupSubtitle(
      CRITICAL_GROUP,
      [notif('a'), notif('b'), notif('c'), notif('d')],
      [], {},
    )).toBe('1 solving · 1 resolved')
  })

  it('forwards solves and solveProgress through to getSolveStatus', () => {
    const solves: StellarSolve[] = [{ id: 's1' } as StellarSolve]
    const progress: Record<string, StellarSolveProgress> = { 'e1': { step: 'solving', message: '' } as StellarSolveProgress }
    getSolveStatusMock.mockReturnValue(status(true, 'solving'))
    getGroupSubtitle(CRITICAL_GROUP, [notif('e1')], solves, progress)
    expect(getSolveStatusMock).toHaveBeenCalledWith(notif('e1'), solves, progress)
  })
})
