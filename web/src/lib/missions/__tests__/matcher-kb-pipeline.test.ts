/**
 * Mission Matcher — KB Pipeline Coverage
 *
 * Tests for three scoring paths in matchMissionsToCluster that are untested
 * in matcher.test.ts:
 *
 * 1. RESOURCE_TO_PROJECTS transitive expansion — installed resources like
 *    "prometheus-operator" should expand into related keywords (alertmanager,
 *    grafana, thanos) so missions tagged with those terms are also surfaced.
 *
 * 2. ISSUE_TO_CATEGORIES scoring — cluster issues like "CrashLoopBackOff"
 *    map to fix categories (troubleshoot, debugging, pod-restart) and should
 *    boost missions whose tags or category match those fix categories —
 *    even when the mission description does not contain the issue text.
 *
 * 3. Engagement metadata + matchPercent normalisation — popular missions
 *    (high reactions/comments) receive a baseline score boost, and
 *    matchPercent is correctly normalised relative to the top scorer.
 *
 * These paths correspond directly to the mission-control KB lookup step:
 *   user cluster state → matcher → ranked KB runbooks → agent prompt
 */

import { describe, it, expect } from 'vitest'
import { matchMissionsToCluster } from '../matcher'
import type { MissionExport } from '../types'

function makeMission(overrides: Partial<MissionExport> = {}): MissionExport {
  return {
    version: 'kc-mission-v1',
    title: 'Test Mission',
    description: 'A test mission',
    type: 'deploy',
    tags: [],
    steps: [{ title: 'Step 1', description: 'Do something' }],
    ...overrides,
  }
}

// ── 1. RESOURCE_TO_PROJECTS transitive expansion ──────────────────────────

describe('matchMissionsToCluster — RESOURCE_TO_PROJECTS transitive expansion', () => {
  it('expands prometheus resource to boost alertmanager-tagged missions', () => {
    // "prometheus" in resources → expands to ['prometheus','alertmanager','monitoring','grafana','thanos']
    // Mission tagged "alertmanager" should be surfaced even though "alertmanager" is not literally installed
    const missions = [makeMission({ tags: ['alertmanager'], title: 'Set up Alertmanager rules' })]
    const cluster = { name: 'test', resources: ['prometheus-server'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results[0].score).toBeGreaterThan(1)
    expect(results[0].matchReasons.some(r => r.includes('alertmanager'))).toBe(true)
  })

  it('expands prometheus resource to boost grafana-tagged missions', () => {
    const missions = [makeMission({ tags: ['grafana'], title: 'Install Grafana dashboard' })]
    const cluster = { name: 'test', resources: ['prometheus-operator'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results[0].score).toBeGreaterThan(1)
  })

  it('expands cert-manager resource to boost tls and lets-encrypt missions', () => {
    const missions = [
      makeMission({ tags: ['tls'], title: 'Configure TLS termination' }),
      makeMission({ tags: ['lets-encrypt'], title: 'Issue Let\'s Encrypt certificate' }),
    ]
    const cluster = { name: 'test', resources: ['cert-manager-webhook'] }
    const results = matchMissionsToCluster(missions, cluster)
    // Both missions should score above baseline
    expect(results[0].score).toBeGreaterThan(1)
    expect(results[1].score).toBeGreaterThan(1)
  })

  it('expands istio resource to boost envoy and traffic-management missions', () => {
    const missions = [
      makeMission({ tags: ['envoy'], title: 'Tune Envoy proxy settings' }),
      makeMission({ tags: ['traffic-management'], title: 'Configure traffic routing' }),
    ]
    const cluster = { name: 'test', resources: ['istio-pilot'] }
    const results = matchMissionsToCluster(missions, cluster)
    results.forEach(r => expect(r.score).toBeGreaterThan(1))
  })

  it('expands velero resource to boost disaster-recovery missions', () => {
    const missions = [makeMission({ tags: ['disaster-recovery'], title: 'Test cluster backup restore' })]
    const cluster = { name: 'test', resources: ['velero'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results[0].score).toBeGreaterThan(1)
    expect(results[0].matchReasons.some(r => r.includes('disaster-recovery'))).toBe(true)
  })

  it('expands argocd resource to boost gitops and continuous-delivery missions', () => {
    const missions = [
      makeMission({ tags: ['gitops'], title: 'Set up GitOps pipeline' }),
      makeMission({ tags: ['continuous-delivery'], title: 'Configure CD workflow' }),
    ]
    const cluster = { name: 'test', resources: ['argocd-server'] }
    const results = matchMissionsToCluster(missions, cluster)
    results.forEach(r => expect(r.score).toBeGreaterThan(1))
  })

  it('expands keda resource to boost autoscaling missions', () => {
    const missions = [makeMission({ tags: ['autoscaling'], title: 'Scale workloads with KEDA' })]
    const cluster = { name: 'test', resources: ['keda-operator'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results[0].score).toBeGreaterThan(1)
  })

  it('expands multiple resources independently and unions the keyword sets', () => {
    // prometheus expands → grafana; argocd expands → gitops
    // A mission tagged with both should score higher than one tagged with only one
    const missionsOnlyGrafana = [makeMission({ tags: ['grafana'] })]
    const missionsBoth = [makeMission({ tags: ['grafana', 'gitops'] })]
    const cluster = { name: 'test', resources: ['prometheus-server', 'argocd-server'] }

    const onlyOne = matchMissionsToCluster(missionsOnlyGrafana, cluster)
    const both = matchMissionsToCluster(missionsBoth, cluster)
    expect(both[0].score).toBeGreaterThan(onlyOne[0].score)
  })

  it('does not boost missions for resources with no mapping entry', () => {
    // "my-custom-operator" has no RESOURCE_TO_PROJECTS entry → no expansion
    const missions = [makeMission({ tags: ['custom-project'] })]
    const cluster = { name: 'test', resources: ['my-custom-operator'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results[0].score).toBe(1) // baseline only — no expansion match
  })
})

// ── 2. ISSUE_TO_CATEGORIES scoring ───────────────────────────────────────

describe('matchMissionsToCluster — ISSUE_TO_CATEGORIES cluster issue scoring', () => {
  it('boosts troubleshoot missions via issue category when CrashLoopBackOff detected', () => {
    // CrashLoopBackOff → categories: ['troubleshoot', 'debugging', 'pod-restart']
    // A mission tagged 'troubleshoot' should get +35 from issue-category match
    const missions = [
      makeMission({ type: 'troubleshoot', tags: ['troubleshoot'], title: 'Debug crashing pods' }),
      makeMission({ type: 'deploy', tags: ['deploy'], title: 'Deploy workload' }),
    ]
    const cluster = { name: 'test', issues: ['CrashLoopBackOff detected in namespace default'] }
    const results = matchMissionsToCluster(missions, cluster)
    const troubleshoot = results.find(r => r.mission.title === 'Debug crashing pods')!
    const deploy = results.find(r => r.mission.title === 'Deploy workload')!
    expect(troubleshoot.score).toBeGreaterThan(deploy.score)
  })

  it('boosts missions tagged debugging when CrashLoopBackOff is present', () => {
    const missions = [makeMission({ tags: ['debugging'], title: 'Debugging guide' })]
    const cluster = { name: 'test', issues: ['crashloopbackoff'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results[0].score).toBeGreaterThan(1)
    expect(results[0].matchReasons.some(r => r.includes('cluster issue'))).toBe(true)
  })

  it('boosts missions tagged memory and limits when OOMKilled is present', () => {
    // OOMKilled → categories: ['resources', 'memory', 'limits', 'troubleshoot']
    const missions = [
      makeMission({ tags: ['memory'], title: 'Tune memory limits' }),
      makeMission({ tags: ['limits'], title: 'Set resource quotas' }),
    ]
    const cluster = { name: 'test', issues: ['Pod was OOMKilled'] }
    const results = matchMissionsToCluster(missions, cluster)
    results.forEach(r => expect(r.score).toBeGreaterThan(1))
  })

  it('boosts security missions when privileged container issue detected', () => {
    // 'privileged container' → ['security', 'pod-security', 'hardening']
    const missions = [
      makeMission({ tags: ['security'], title: 'Harden pod security' }),
      makeMission({ tags: ['redis'], title: 'Install Redis' }),
    ]
    const cluster = { name: 'test', issues: ['privileged container detected'] }
    const results = matchMissionsToCluster(missions, cluster)
    const security = results.find(r => r.mission.title === 'Harden pod security')!
    const redis = results.find(r => r.mission.title === 'Install Redis')!
    expect(security.score).toBeGreaterThan(redis.score)
  })

  it('boosts scheduling missions when pods are Pending', () => {
    // 'pending' → ['scheduling', 'resources', 'node-capacity']
    const missions = [makeMission({ tags: ['scheduling'], title: 'Fix node scheduling' })]
    const cluster = { name: 'test', issues: ['5 pods stuck in pending state'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results[0].score).toBeGreaterThan(1)
  })

  it('boosts network-policy missions when host network issue detected', () => {
    // 'host network' → ['security', 'network-policy', 'hardening']
    const missions = [makeMission({ tags: ['network-policy'], title: 'Enforce network policies' })]
    const cluster = { name: 'test', issues: ['pod using host network detected'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results[0].score).toBeGreaterThan(1)
  })

  it('matches issue patterns case-insensitively', () => {
    const missions = [makeMission({ tags: ['troubleshoot'] })]
    const clusterUpper = { name: 'test', issues: ['CRASHLOOPBACKOFF'] }
    const clusterLower = { name: 'test', issues: ['crashloopbackoff'] }
    const resultsUpper = matchMissionsToCluster(missions, clusterUpper)
    const resultsLower = matchMissionsToCluster(missions, clusterLower)
    expect(resultsUpper[0].score).toBe(resultsLower[0].score)
  })

  it('accumulates score from multiple simultaneous cluster issues', () => {
    // Two issues → two category sets → potentially more category boosts
    const missions = [makeMission({ tags: ['troubleshoot', 'memory'], title: 'Debug OOM crashloop' })]
    const singleIssue = { name: 'test', issues: ['CrashLoopBackOff'] }
    const dualIssue = { name: 'test', issues: ['CrashLoopBackOff', 'Pod was OOMKilled'] }

    const single = matchMissionsToCluster(missions, singleIssue)
    const dual = matchMissionsToCluster(missions, dualIssue)
    // Dual issues expand the category set → additional memory/limits tags can match
    expect(dual[0].score).toBeGreaterThanOrEqual(single[0].score)
  })

  it('does not boost non-troubleshoot missions via issue categories for deploy type', () => {
    // deploy type is excluded from the direct issue text match (+40)
    // but CAN still get category boost if tags match issue categories
    const missions = [makeMission({ type: 'deploy', tags: ['deploy'], title: 'Deploy something' })]
    const cluster = { name: 'test', issues: ['CrashLoopBackOff'] }
    const results = matchMissionsToCluster(missions, cluster)
    // 'deploy' tag not in crashloopbackoff categories → no category boost → baseline only
    expect(results[0].score).toBe(1)
  })

  it('skips null or undefined issue entries without throwing', () => {
    const missions = [makeMission({ tags: ['troubleshoot'] })]
    const cluster = { name: 'test', issues: [null as unknown as string, undefined as unknown as string, 'CrashLoopBackOff'] }
    expect(() => matchMissionsToCluster(missions, cluster)).not.toThrow()
    const results = matchMissionsToCluster(missions, cluster)
    expect(results[0].score).toBeGreaterThan(1)
  })
})

// ── 3. Engagement metadata + matchPercent normalisation ──────────────────

describe('matchMissionsToCluster — engagement scoring and matchPercent', () => {
  it('boosts missions with >= 20 reactions by 10 points', () => {
    const highEngagement = makeMission({ title: 'Popular mission', metadata: { reactions: 20, comments: 0 } as unknown as MissionExport['metadata'] })
    const noEngagement = makeMission({ title: 'Obscure mission' })
    const results = matchMissionsToCluster([highEngagement, noEngagement], null)
    const popular = results.find(r => r.mission.title === 'Popular mission')!
    const obscure = results.find(r => r.mission.title === 'Obscure mission')!
    expect(popular.score).toBe(10) // 10 engagement (minimum floor of 1 only applies when score is 0)
    expect(obscure.score).toBe(1)  // baseline only — score stayed 0, floor applied
  })

  it('gives partial boost (5 pts) for missions with 5–19 reactions', () => {
    const moderate = makeMission({ title: 'Moderate', metadata: { reactions: 5, comments: 0 } as unknown as MissionExport['metadata'] })
    const results = matchMissionsToCluster([moderate], null)
    expect(results[0].score).toBe(5) // 5 reactions boost (floor not applied — score > 0)
  })

  it('does not boost missions with fewer than 5 reactions', () => {
    const low = makeMission({ title: 'Low', metadata: { reactions: 4, comments: 0 } as unknown as MissionExport['metadata'] })
    const results = matchMissionsToCluster([low], null)
    expect(results[0].score).toBe(1) // baseline only
  })

  it('boosts missions with >= 10 comments by 5 additional points', () => {
    const active = makeMission({ title: 'Active', metadata: { reactions: 0, comments: 10 } as unknown as MissionExport['metadata'] })
    const results = matchMissionsToCluster([active], null)
    expect(results[0].score).toBe(5) // 5 comments boost (floor not applied — score > 0)
  })

  it('stacks reactions and comments boosts independently', () => {
    const viral = makeMission({ title: 'Viral', metadata: { reactions: 20, comments: 15 } as unknown as MissionExport['metadata'] })
    const results = matchMissionsToCluster([viral], null)
    expect(results[0].score).toBe(15) // 10 reactions + 5 comments (no floor, score already > 0)
  })

  it('normalises matchPercent so the top scorer always has matchPercent 100', () => {
    const missions = [
      makeMission({ tags: ['istio', 'envoy'], cncfProject: 'istio' }),  // high score
      makeMission({ tags: ['redis'] }),                                  // lower score
    ]
    const cluster = {
      name: 'test',
      resources: ['istio-proxy', 'envoy-sidecar'],
      labels: { 'istio.io/rev': 'default' },
    }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results[0].matchPercent).toBe(100)
    expect(results[1].matchPercent).toBeLessThan(100)
    expect(results[1].matchPercent).toBeGreaterThan(0)
  })

  it('gives all missions matchPercent 100 when they share the same score', () => {
    const missions = [
      makeMission({ title: 'A' }),
      makeMission({ title: 'B' }),
    ]
    // No cluster data → all score 1 → all get matchPercent 100
    const results = matchMissionsToCluster(missions, null)
    results.forEach(r => expect(r.matchPercent).toBe(100))
  })

  it('matchPercent is proportional: half-scoring mission gets ~50%', () => {
    const missions = [
      // score = 40 (two tag matches at 20 each)
      makeMission({ tags: ['istio', 'envoy'], title: 'Full match' }),
      // score = 20 (one tag match)
      makeMission({ tags: ['istio'], title: 'Half match' }),
    ]
    const cluster = { name: 'test', resources: ['istio-proxy', 'envoy-sidecar'] }
    const results = matchMissionsToCluster(missions, cluster)
    const full = results.find(r => r.mission.title === 'Full match')!
    const half = results.find(r => r.mission.title === 'Half match')!
    expect(full.matchPercent).toBe(100)
    expect(half.matchPercent).toBe(50)
  })

  it('handles missions with no metadata field without throwing', () => {
    const missions = [makeMission({ title: 'No metadata' })]
    expect(() => matchMissionsToCluster(missions, null)).not.toThrow()
    const results = matchMissionsToCluster(missions, null)
    expect(results[0].score).toBe(1)
  })
})
