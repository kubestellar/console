import { describe, it, expect } from 'vitest'
import { matchMissionsToCluster } from '../matcher'
import type { MissionExport } from '../types'

function makeMission(overrides: Partial<MissionExport> = {}): MissionExport {
  return {
    version: '1.0',
    title: 'Test Mission',
    description: 'A test mission',
    type: 'deploy',
    tags: [],
    steps: [{ title: 'Step 1', description: 'Do something' }],
    ...overrides,
  }
}

describe('matchMissionsToCluster', () => {
  it('matches mission tags against cluster resources', () => {
    const missions = [makeMission({ tags: ['istio', 'networking'] })]
    const cluster = { name: 'test', resources: ['istio-proxy', 'envoy'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(1)
    expect(results[0].score).toBeGreaterThan(0)
    expect(results[0].matchReasons.some((r) => r.includes('istio'))).toBe(true)
  })

  it('matches CNCF project against cluster labels', () => {
    const missions = [makeMission({ cncfProject: 'prometheus' })]
    const cluster = { name: 'test', labels: { 'app.kubernetes.io/name': 'prometheus-server' } }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(30)
    expect(results[0].matchReasons[0]).toContain('CNCF project')
  })

  it('matches CNCF project against label keys', () => {
    const missions = [makeMission({ cncfProject: 'cert-manager' })]
    const cluster = { name: 'test', labels: { 'cert-manager.io/inject': 'true' } }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(30)
  })

  it('gives higher score with multiple tag matches', () => {
    const missions = [makeMission({ tags: ['istio', 'envoy'] })]
    const cluster = { name: 'test', resources: ['istio-proxy', 'envoy-sidecar'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(40) // 20 + 20
  })

  it('returns empty array when no cluster resources', () => {
    const missions = [makeMission({ tags: ['istio'] })]
    const cluster = { name: 'empty' }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(0)
  })

  it('matches troubleshoot missions against cluster issues', () => {
    const missions = [
      makeMission({
        type: 'troubleshoot',
        description: 'Fix CrashLoopBackOff in your deployment',
      }),
    ]
    const cluster = { name: 'test', issues: ['CrashLoopBackOff'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(40)
    expect(results[0].matchReasons[0]).toContain('CrashLoopBackOff')
  })

  it('does not match non-troubleshoot missions against issues', () => {
    const missions = [
      makeMission({
        type: 'deploy',
        description: 'Fix CrashLoopBackOff in your deployment',
      }),
    ]
    const cluster = { name: 'test', issues: ['CrashLoopBackOff'] }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(0)
  })

  it('matches upgrade missions against cluster version', () => {
    const missions = [
      makeMission({
        type: 'upgrade',
        description: 'Upgrade from v1.28 to v1.29',
      }),
    ]
    const cluster = { name: 'test', version: 'v1.28' }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(15)
    expect(results[0].matchReasons[0]).toContain('version')
  })

  it('boosts deploy missions matching cluster provider', () => {
    const missions = [makeMission({ type: 'deploy', tags: ['aws', 'eks'] })]
    const cluster = { name: 'test', provider: 'aws' }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(25)
    expect(results[0].matchReasons[0]).toContain('provider')
  })

  it('sorts results by score descending', () => {
    const missions = [
      makeMission({ title: 'Low', tags: ['redis'] }),
      makeMission({
        title: 'High',
        tags: ['istio', 'envoy'],
        cncfProject: 'istio',
      }),
    ]
    const cluster = {
      name: 'test',
      resources: ['redis-server', 'istio-proxy', 'envoy-sidecar'],
      labels: { 'istio.io/rev': 'default' },
    }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results.length).toBe(2)
    expect(results[0].mission.title).toBe('High')
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })

  it('returns empty results for empty missions array', () => {
    const cluster = { name: 'test', resources: ['something'] }
    const results = matchMissionsToCluster([], cluster)
    expect(results).toHaveLength(0)
  })

  it('returns no matches when cluster has no data', () => {
    const missions = [
      makeMission({ tags: ['istio'], cncfProject: 'istio' }),
      makeMission({ type: 'troubleshoot', description: 'Fix pods' }),
    ]
    const cluster = { name: 'bare-cluster' }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(0)
  })

  it('combines tag + CNCF project scores', () => {
    const missions = [
      makeMission({ tags: ['prometheus'], cncfProject: 'prometheus' }),
    ]
    const cluster = {
      name: 'test',
      resources: ['prometheus-server'],
      labels: { 'helm.sh/chart': 'prometheus-25.0' },
    }
    const results = matchMissionsToCluster(missions, cluster)
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(50) // 20 (tag) + 30 (cncf)
  })
})
