import { describe, expect, it } from 'vitest'

import { getPreferredPaths } from '../MissionLandingPage.api'

describe('getPreferredPaths', () => {
  it('routes install-* slugs to cncf-install then platform-install', () => {
    expect(getPreferredPaths('install-karmada')).toEqual([
      'fixes/cncf-install/install-karmada.json',
      'fixes/platform-install/install-karmada.json',
    ])
  })

  it('routes platform-* slugs only to platform-install', () => {
    expect(getPreferredPaths('platform-kubestellar')).toEqual([
      'fixes/platform-install/platform-kubestellar.json',
    ])
  })

  it('routes other slugs by prefix into cncf-generated first, then the generic fixture buckets', () => {
    expect(getPreferredPaths('karmada-1234-issue')).toEqual([
      'fixes/cncf-generated/karmada/karmada-1234-issue.json',
      'fixes/security/karmada-1234-issue.json',
      'fixes/troubleshoot/karmada-1234-issue.json',
      'fixes/llm-d/karmada-1234-issue.json',
      'fixes/multi-cluster/karmada-1234-issue.json',
    ])
  })

  it('uses the whole slug as the "project" hint when there is no hyphen', () => {
    expect(getPreferredPaths('istio')).toEqual([
      'fixes/cncf-generated/istio/istio.json',
      'fixes/security/istio.json',
      'fixes/troubleshoot/istio.json',
      'fixes/llm-d/istio.json',
      'fixes/multi-cluster/istio.json',
    ])
  })

  it('every returned path is a fixes/*.json string', () => {
    for (const slug of ['install-x', 'platform-y', 'foo-bar-baz']) {
      for (const p of getPreferredPaths(slug)) {
        expect(p.startsWith('fixes/')).toBe(true)
        expect(p.endsWith('.json')).toBe(true)
      }
    }
  })
})
