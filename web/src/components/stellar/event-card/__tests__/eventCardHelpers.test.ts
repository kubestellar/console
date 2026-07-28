/**
 * Unit tests for web/src/components/stellar/event-card/eventCardHelpers.ts.
 *
 * These pure helpers back the Stellar EventCard action UI: they derive which
 * hint chips ("investigate", "restart", "scale", "solve") show up on a given
 * notification, build the natural-language prompt the mission agent runs, and
 * parse resource identifiers out of the `dedupeKey` scheme. A regression in
 * any of them silently changes what a user's AI agent actually does when they
 * click an action chip, so lock every branch in.
 *
 * Filed by quality agent (ACMM L4/L6 — full mode) — coverage-gap advisory.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { StellarNotification } from '../../../../types/stellar'
import {
  REVERSIBLE_ACTION_TYPES,
  HINT_TO_ACTION_TYPE,
  ACTION_CONFIG,
  formatCountdownShort,
  extractResourceName,
  isCompletedReversibleAction,
  buildRollbackPrompt,
  buildActionPrompt,
  deriveActionHints,
} from '../eventCardHelpers'

// Minimal factory — every field the helpers touch is overridable, the rest
// have safe defaults so tests only mention the parts they care about.
function makeNotification(overrides: Partial<StellarNotification> = {}): StellarNotification {
  return {
    id: 'n1',
    type: 'event',
    severity: 'info',
    title: '',
    body: '',
    read: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as StellarNotification
}

describe('REVERSIBLE_ACTION_TYPES', () => {
  it('lists exactly ScaleDeployment and RestartDeployment', () => {
    expect(REVERSIBLE_ACTION_TYPES).toEqual(['ScaleDeployment', 'RestartDeployment'])
  })
})

describe('HINT_TO_ACTION_TYPE', () => {
  it('maps restart/scale to their *Deployment action types', () => {
    expect(HINT_TO_ACTION_TYPE.restart).toBe('RestartDeployment')
    expect(HINT_TO_ACTION_TYPE.scale).toBe('ScaleDeployment')
  })

  it('leaves investigate/solve identity-mapped', () => {
    expect(HINT_TO_ACTION_TYPE.investigate).toBe('investigate')
    expect(HINT_TO_ACTION_TYPE.solve).toBe('solve')
  })

  it('has no unexpected entries (guards accidental additions)', () => {
    expect(Object.keys(HINT_TO_ACTION_TYPE).sort()).toEqual(
      ['investigate', 'restart', 'scale', 'solve'].sort(),
    )
  })
})

describe('ACTION_CONFIG', () => {
  it('has an entry for every hint in HINT_TO_ACTION_TYPE', () => {
    for (const hint of Object.keys(HINT_TO_ACTION_TYPE)) {
      expect(ACTION_CONFIG[hint]).toBeDefined()
      expect(ACTION_CONFIG[hint].labelKey).toMatch(/^stellar\.eventCard\.actions\./)
      expect(typeof ACTION_CONFIG[hint].icon).toBe('string')
      expect(ACTION_CONFIG[hint].color).toMatch(/^var\(--s-/)
    }
  })
})

describe('formatCountdownShort', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "now" when the target is in the past', () => {
    expect(formatCountdownShort(Date.now() - 5000)).toBe('now')
  })

  it('returns "now" when the target equals the current time (ms === 0)', () => {
    expect(formatCountdownShort(Date.now())).toBe('now')
  })

  it('returns seconds-only for delays under one minute', () => {
    expect(formatCountdownShort(Date.now() + 45 * 1000)).toBe('45s')
  })

  it('formats sub-second remainders by flooring seconds', () => {
    // 999 ms rounds down to 0 seconds
    expect(formatCountdownShort(Date.now() + 999)).toBe('0s')
  })

  it('returns "Nm Ns" for delays under one hour', () => {
    // 2 minutes and 30 seconds
    expect(formatCountdownShort(Date.now() + (2 * 60 + 30) * 1000)).toBe('2m 30s')
  })

  it('returns "Nm 0s" at whole-minute boundaries', () => {
    expect(formatCountdownShort(Date.now() + 5 * 60 * 1000)).toBe('5m 0s')
  })

  it('returns "Nh Nm" for delays of one hour or more', () => {
    // 3 hours and 15 minutes
    expect(formatCountdownShort(Date.now() + (3 * 60 * 60 + 15 * 60) * 1000)).toBe('3h 15m')
  })

  it('returns "Nh 0m" at whole-hour boundaries', () => {
    expect(formatCountdownShort(Date.now() + 2 * 60 * 60 * 1000)).toBe('2h 0m')
  })
})

describe('extractResourceName', () => {
  it('returns "" when dedupeKey is missing', () => {
    expect(extractResourceName(makeNotification())).toBe('')
  })

  it('returns "" when dedupeKey is empty string', () => {
    expect(extractResourceName(makeNotification({ dedupeKey: '' }))).toBe('')
  })

  it('parses the name segment from a bare cluster:namespace:name:reason key (offset+2)', () => {
    // Backend format: "<cluster>:<namespace>:<name>:<reason>" (pkg/api/handlers/stellar/handler.go)
    expect(
      extractResourceName(makeNotification({ dedupeKey: 'prod:default:my-app-1:CrashLoopBackOff' })),
    ).toBe('my-app-1')
  })

  it('parses the name segment from an `ev:` prefixed key (offset shifts by one)', () => {
    expect(
      extractResourceName(
        makeNotification({ dedupeKey: 'ev:prod:default:my-app-1:CrashLoopBackOff' }),
      ),
    ).toBe('my-app-1')
  })

  it('returns "" when a bare key is too short (fewer than 3 segments)', () => {
    expect(extractResourceName(makeNotification({ dedupeKey: 'prod:default' }))).toBe('')
  })

  it('returns "" when an ev-prefixed key is too short (fewer than 4 segments)', () => {
    expect(extractResourceName(makeNotification({ dedupeKey: 'ev:prod:default' }))).toBe('')
  })

  it('picks the offset+2 segment even when extra trailing segments are present', () => {
    expect(
      extractResourceName(
        makeNotification({ dedupeKey: 'ev:prod:default:my-app:reason:extra:more' }),
      ),
    ).toBe('my-app')
  })

  it('supports empty-string name segments (parts.length still qualifies)', () => {
    // "ev::::" splits into ['ev','','','',''] — offset 1, index 3 is ''
    expect(extractResourceName(makeNotification({ dedupeKey: 'ev::::' }))).toBe('')
  })
})

describe('isCompletedReversibleAction', () => {
  it('returns false when type is not "action"', () => {
    expect(
      isCompletedReversibleAction(
        makeNotification({ type: 'event', title: 'Action completed ScaleDeployment' }),
      ),
    ).toBe(false)
  })

  it('returns false when title does not start with "Action completed"', () => {
    expect(
      isCompletedReversibleAction(
        makeNotification({ type: 'action', title: 'ScaleDeployment happened' }),
      ),
    ).toBe(false)
  })

  it('returns true when the title contains a reversible action type', () => {
    expect(
      isCompletedReversibleAction(
        makeNotification({ type: 'action', title: 'Action completed ScaleDeployment' }),
      ),
    ).toBe(true)
  })

  it('returns true when only the body contains the reversible action type', () => {
    expect(
      isCompletedReversibleAction(
        makeNotification({
          type: 'action',
          title: 'Action completed',
          body: 'Ran RestartDeployment on my-app',
        }),
      ),
    ).toBe(true)
  })

  it('returns false when title starts with "Action completed" but no reversible type appears anywhere', () => {
    expect(
      isCompletedReversibleAction(
        makeNotification({
          type: 'action',
          title: 'Action completed CordonNode',
          body: 'Cordoned worker-1',
        }),
      ),
    ).toBe(false)
  })

  it('is case-sensitive (does not match lowercased action type)', () => {
    // Guard: catches accidental toLowerCase() in a future refactor
    expect(
      isCompletedReversibleAction(
        makeNotification({ type: 'action', title: 'Action completed scaledeployment' }),
      ),
    ).toBe(false)
  })
})

describe('buildRollbackPrompt', () => {
  it('mentions the matched action type and namespace/cluster when title has it', () => {
    const p = buildRollbackPrompt(
      makeNotification({
        type: 'action',
        title: 'Action completed ScaleDeployment',
        namespace: 'default',
        cluster: 'prod',
      }),
    )
    expect(p).toBe('Undo the last ScaleDeployment on default/prod — restore previous state')
  })

  it('omits the namespace prefix when notification.namespace is missing', () => {
    const p = buildRollbackPrompt(
      makeNotification({
        type: 'action',
        title: 'Action completed RestartDeployment',
        cluster: 'prod',
      }),
    )
    expect(p).toBe('Undo the last RestartDeployment on prod — restore previous state')
  })

  it('finds the action type in the body when the title does not contain it', () => {
    const p = buildRollbackPrompt(
      makeNotification({
        type: 'action',
        title: 'Action completed',
        body: 'ran RestartDeployment successfully',
        cluster: 'edge',
      }),
    )
    expect(p).toBe('Undo the last RestartDeployment on edge — restore previous state')
  })

  it('checks ScaleDeployment before RestartDeployment (loop order matters when both match)', () => {
    const p = buildRollbackPrompt(
      makeNotification({
        type: 'action',
        title: 'ScaleDeployment and RestartDeployment both happened',
        cluster: 'prod',
      }),
    )
    // ScaleDeployment is REVERSIBLE_ACTION_TYPES[0], so it wins the loop
    expect(p).toContain('Undo the last ScaleDeployment')
  })

  it('falls back to the generic "Undo the last action on <cluster>" when no reversible type matches', () => {
    const p = buildRollbackPrompt(
      makeNotification({
        type: 'action',
        title: 'Action completed CordonNode',
        cluster: 'prod',
      }),
    )
    expect(p).toBe('Undo the last action on prod')
  })
})

describe('buildActionPrompt', () => {
  const base = makeNotification({
    title: 'my-app CrashLoopBackOff',
    cluster: 'prod',
    namespace: 'default',
  })

  it('builds an investigate prompt', () => {
    const p = buildActionPrompt('investigate', base)
    expect(p).toBe(
      "Investigate my-app CrashLoopBackOff on cluster prod. Pull the logs and tell me what's wrong.",
    )
  })

  it('builds a restart prompt', () => {
    const p = buildActionPrompt('restart', base)
    expect(p).toBe(
      "Restart the affected deployment for my-app CrashLoopBackOff on cluster prod. What's the safest approach?",
    )
  })

  it('builds a scale prompt', () => {
    const p = buildActionPrompt('scale', base)
    expect(p).toBe(
      'Should we scale the deployment for my-app CrashLoopBackOff on cluster prod? What replica count makes sense?',
    )
  })

  it('builds a multi-step solve prompt that includes cluster, namespace, and all five steps', () => {
    const p = buildActionPrompt('solve', base)
    expect(p).toContain('Solve this issue end-to-end on cluster prod in namespace default: my-app CrashLoopBackOff.')
    expect(p).toContain('Step 1:')
    expect(p).toContain('Step 2:')
    expect(p).toContain('Step 3:')
    expect(p).toContain('Step 4:')
    expect(p).toContain('Step 5:')
    expect(p).toContain("Don't ask me — act.")
  })

  it('falls back to a generic prompt for unknown hints', () => {
    const p = buildActionPrompt('rollback', base)
    expect(p).toBe('Help me with "rollback" for my-app CrashLoopBackOff on cluster prod.')
  })

  it('omits the cluster clause when cluster is empty', () => {
    const n = makeNotification({ title: 'x', cluster: '' })
    expect(buildActionPrompt('investigate', n)).toBe(
      "Investigate x. Pull the logs and tell me what's wrong.",
    )
  })

  it('omits the namespace clause in solve when namespace is empty', () => {
    const n = makeNotification({ title: 'x', cluster: 'c', namespace: '' })
    const p = buildActionPrompt('solve', n)
    expect(p).toContain('Solve this issue end-to-end on cluster c: x.')
    expect(p).not.toContain('in namespace')
  })
})

describe('deriveActionHints', () => {
  it('returns [] when the notification is not an event', () => {
    expect(deriveActionHints(makeNotification({ type: 'action', severity: 'critical' }))).toEqual([])
  })

  it('returns [] when the event has already been read', () => {
    expect(
      deriveActionHints(makeNotification({ type: 'event', read: true, severity: 'critical' })),
    ).toEqual([])
  })

  it('uses preset actionHints and appends solve when it is not already present', () => {
    expect(
      deriveActionHints(
        makeNotification({ actionHints: ['investigate', 'restart'], severity: 'info' }),
      ),
    ).toEqual(['investigate', 'restart', 'solve'])
  })

  it('does not double-append solve when the preset already includes it', () => {
    expect(
      deriveActionHints(makeNotification({ actionHints: ['solve', 'investigate'], severity: 'info' })),
    ).toEqual(['solve', 'investigate'])
  })

  it('falls through to title/severity checks when actionHints is an empty array', () => {
    // Guard: `.length > 0` branch — [] should NOT short-circuit
    expect(
      deriveActionHints(
        makeNotification({ actionHints: [], title: 'pod CrashLoopBackOff', severity: 'info' }),
      ),
    ).toEqual(['investigate', 'restart', 'solve'])
  })

  it('recognises CrashLoopBackOff titles (case-insensitive)', () => {
    expect(deriveActionHints(makeNotification({ title: 'pod crashloopbackoff' }))).toEqual([
      'investigate',
      'restart',
      'solve',
    ])
    expect(deriveActionHints(makeNotification({ title: 'CrashLoopBackOff' }))).toEqual([
      'investigate',
      'restart',
      'solve',
    ])
  })

  it('recognises OOMKill titles', () => {
    expect(deriveActionHints(makeNotification({ title: 'container oomkilled' }))).toEqual([
      'investigate',
      'restart',
      'solve',
    ])
  })

  it('recognises FailedScheduling titles', () => {
    expect(deriveActionHints(makeNotification({ title: 'pod failedscheduling' }))).toEqual([
      'investigate',
      'scale',
      'solve',
    ])
  })

  it('recognises FailedMount titles as investigate-only', () => {
    expect(deriveActionHints(makeNotification({ title: 'volume failedmount' }))).toEqual([
      'investigate',
      'solve',
    ])
  })

  it('recognises generic "failed" and "backoff" titles as investigate-only', () => {
    expect(deriveActionHints(makeNotification({ title: 'image pull backoff' }))).toEqual([
      'investigate',
      'solve',
    ])
    expect(deriveActionHints(makeNotification({ title: 'health check failed' }))).toEqual([
      'investigate',
      'solve',
    ])
  })

  it('prefers the CrashLoopBackOff branch over lower-priority "backoff" match', () => {
    // 'crashloopbackoff' contains 'backoff' — order of branch evaluation matters
    expect(deriveActionHints(makeNotification({ title: 'my-app crashloopbackoff' }))).toEqual([
      'investigate',
      'restart',
      'solve',
    ])
  })

  it('for unmatched titles: severity=critical yields investigate+restart+solve', () => {
    expect(
      deriveActionHints(makeNotification({ title: 'something odd', severity: 'critical' })),
    ).toEqual(['investigate', 'restart', 'solve'])
  })

  it('for unmatched titles: severity=warning yields investigate+solve', () => {
    expect(
      deriveActionHints(makeNotification({ title: 'something odd', severity: 'warning' })),
    ).toEqual(['investigate', 'solve'])
  })

  it('for unmatched titles: severity=info yields [] (no solve appended)', () => {
    // base.length === 0 short-circuits before the solve-append
    expect(
      deriveActionHints(makeNotification({ title: 'something odd', severity: 'info' })),
    ).toEqual([])
  })
})
