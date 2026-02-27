import { describe, it, expect } from 'vitest'
import { matchIndexSync, type ClusterIssue } from '@/lib/missions/indexMatcher'
import type { KBMissionEntry } from '@/hooks/useConsoleKBIndex'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<KBMissionEntry> = {}): KBMissionEntry {
  return {
    path: 'troubleshoot/generic.json',
    title: 'Generic Mission',
    description: 'A generic troubleshooting mission',
    category: 'troubleshooting',
    tags: [],
    cncfProjects: [],
    targetResourceKinds: [],
    difficulty: 'beginner',
    issueTypes: [],
    type: 'troubleshoot',
    ...overrides,
  }
}

function makeIssue(overrides: Partial<ClusterIssue> = {}): ClusterIssue {
  return {
    type: 'CrashLoopBackOff',
    resource: 'my-pod',
    namespace: 'default',
    cluster: 'prod',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchIndexSync', () => {
  it('gives high score when issueType matches exactly (CrashLoopBackOff)', () => {
    const entries = [makeEntry({ issueTypes: ['CrashLoopBackOff'] })]
    const issues = [makeIssue({ type: 'CrashLoopBackOff' })]

    const results = matchIndexSync(entries, issues, [], [])

    expect(results).toHaveLength(1)
    // ISSUE_TYPE_MATCH = 50, CATEGORY_MATCH = 5 (troubleshooting + issues present)
    expect(results[0].score).toBeGreaterThanOrEqual(50)
    expect(results[0].reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('CrashLoopBackOff')]),
    )
    expect(results[0].matchedIssue).toBeDefined()
  })

  it('matches issueType case-insensitively', () => {
    const entries = [makeEntry({ issueTypes: ['crashloopbackoff'] })]
    const issues = [makeIssue({ type: 'CrashLoopBackOff' })]

    const results = matchIndexSync(entries, issues, [], [])

    expect(results).toHaveLength(1)
    expect(results[0].score).toBeGreaterThanOrEqual(50)
  })

  it('CNCF project match adds 30 points', () => {
    const entries = [makeEntry({
      cncfProjects: ['istio'],
      category: 'networking', // no troubleshooting bonus
    })]
    const issues: ClusterIssue[] = []

    const results = matchIndexSync(entries, issues, ['istio'], [])

    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(30)
    expect(results[0].reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('istio')]),
    )
  })

  it('resource kind match adds 20 points', () => {
    const entries = [makeEntry({
      targetResourceKinds: ['Deployment'],
      category: 'operations',
    })]

    const results = matchIndexSync(entries, [], [], ['Deployment'])

    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(20)
    expect(results[0].reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('Deployment')]),
    )
  })

  it('tag overlap adds points', () => {
    const entries = [makeEntry({
      tags: ['crash', 'pod'],
      category: 'general',
    })]
    // Tags are matched against issue terms (type, resource, namespace lowercased)
    const issues = [makeIssue({ type: 'crash', resource: 'pod-abc', namespace: 'default' })]

    const results = matchIndexSync(entries, issues, [], [])

    expect(results).toHaveLength(1)
    // TAG_MATCH = 10 per tag (max 3), plus potentially CATEGORY_MATCH
    expect(results[0].reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('Tags match')]),
    )
  })

  it('returns null for entries below threshold (score < 20)', () => {
    const entries = [makeEntry({
      category: 'general', // no troubleshooting bonus
      tags: [],
      issueTypes: [],
      cncfProjects: [],
      targetResourceKinds: [],
    })]
    const issues = [makeIssue()]

    const results = matchIndexSync(entries, issues, [], [])

    // Score would be at most CATEGORY_MATCH (5) which is < 20 threshold
    expect(results).toHaveLength(0)
  })

  it('results sorted by score descending', () => {
    const entries = [
      makeEntry({
        path: 'low.json',
        title: 'Low Score',
        targetResourceKinds: ['Pod'],
        category: 'operations',
      }),
      makeEntry({
        path: 'high.json',
        title: 'High Score',
        issueTypes: ['CrashLoopBackOff'],
        cncfProjects: ['istio'],
        targetResourceKinds: ['Pod'],
      }),
    ]
    const issues = [makeIssue()]

    const results = matchIndexSync(entries, issues, ['istio'], ['Pod'])

    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].mission.title).toBe('High Score')
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })

  it('deduplicates by path', () => {
    const entries = [
      makeEntry({ path: 'same.json', issueTypes: ['CrashLoopBackOff'] }),
      makeEntry({ path: 'same.json', issueTypes: ['OOMKilled'] }),
    ]
    const issues = [
      makeIssue({ type: 'CrashLoopBackOff' }),
      makeIssue({ type: 'OOMKilled' }),
    ]

    const results = matchIndexSync(entries, issues, [], [])

    expect(results).toHaveLength(1)
    expect(results[0].mission.path).toBe('same.json')
  })

  it('empty issues array returns no matches when no other signals', () => {
    const entries = [makeEntry({ category: 'general' })]

    const results = matchIndexSync(entries, [], [], [])

    expect(results).toHaveLength(0)
  })

  it('empty entries array returns empty results', () => {
    const issues = [makeIssue()]

    const results = matchIndexSync([], issues, ['istio'], ['Pod'])

    expect(results).toHaveLength(0)
  })

  it('multiple matching criteria stack scores', () => {
    const entries = [makeEntry({
      issueTypes: ['CrashLoopBackOff'],
      cncfProjects: ['istio'],
      targetResourceKinds: ['Pod'],
    })]
    const issues = [makeIssue({ type: 'CrashLoopBackOff' })]

    const results = matchIndexSync(entries, issues, ['istio'], ['Pod'])

    expect(results).toHaveLength(1)
    // 50 (issue) + 30 (cncf) + 20 (kind) + 5 (troubleshooting category) = 105
    expect(results[0].score).toBeGreaterThanOrEqual(100)
  })

  it('troubleshooting category bonus when issues present', () => {
    const troubleshoot = makeEntry({
      path: 'ts.json',
      category: 'troubleshooting',
      targetResourceKinds: ['Pod'],
    })
    const other = makeEntry({
      path: 'other.json',
      category: 'operations',
      targetResourceKinds: ['Pod'],
    })
    const issues = [makeIssue()]

    const tsResults = matchIndexSync([troubleshoot], issues, [], ['Pod'])
    const otherResults = matchIndexSync([other], issues, [], ['Pod'])

    // troubleshooting entry should score 5 higher
    expect(tsResults[0].score).toBe(otherResults[0].score + 5)
  })

  it('does not give troubleshooting bonus when no issues', () => {
    const entries = [makeEntry({
      category: 'troubleshooting',
      targetResourceKinds: ['Pod'],
    })]

    const results = matchIndexSync(entries, [], [], ['Pod'])

    // 20 (kind), NO category bonus because issues.length === 0
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(20)
  })

  it('CNCF project match is case-insensitive', () => {
    const entries = [makeEntry({ cncfProjects: ['Prometheus'], category: 'monitoring' })]

    const results = matchIndexSync(entries, [], ['prometheus'], [])

    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(30)
  })

  it('resource kind match is case-insensitive', () => {
    const entries = [makeEntry({ targetResourceKinds: ['deployment'], category: 'ops' })]

    const results = matchIndexSync(entries, [], [], ['Deployment'])

    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(20)
  })
})
