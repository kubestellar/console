import { describe, expect, it } from 'vitest'

import type { MissionExport } from './types'
import { matchInstallIntent } from './intentMatcher'

function makeMission(overrides: Partial<MissionExport> = {}): MissionExport {
  return {
    version: 'kc-mission-v1',
    name: 'install-kuberay',
    title: 'Install KubeRay',
    description: 'Install KubeRay on Kubernetes',
    type: 'deploy',
    tags: [],
    missionClass: 'install',
    steps: [],
    ...overrides,
  }
}

describe('matchInstallIntent', () => {
  it('matches install intents by mission name', () => {
    const mission = makeMission({ name: 'install-kuberay' })

    expect(matchInstallIntent('install kuberay', [mission])).toEqual(mission)
  })

  it('matches alternative install verbs', () => {
    const vaultMission = makeMission({ name: 'install-vault', title: 'Install Vault' })
    const lokiMission = makeMission({ name: 'install-loki', title: 'Install Loki' })

    expect(matchInstallIntent('set up vault', [vaultMission, lokiMission])).toEqual(vaultMission)
    expect(matchInstallIntent('deploy loki', [vaultMission, lokiMission])).toEqual(lokiMission)
  })

  it('matches case insensitively', () => {
    const mission = makeMission({ name: 'install-kuberay' })

    expect(matchInstallIntent('INSTALL KUBERAY', [mission])).toEqual(mission)
  })

  it('ignores leading articles in the requested project name', () => {
    const mission = makeMission({ name: 'install-kuberay-operator', title: 'Install KubeRay Operator' })

    expect(matchInstallIntent('install the kuberay operator', [mission])).toEqual(mission)
  })

  it('returns null for non-install text', () => {
    const mission = makeMission()

    expect(matchInstallIntent('show me cluster health', [mission])).toBeNull()
  })

  it('matches by cncfProject when the mission name differs', () => {
    const mission = makeMission({
      name: 'ray-operator-install',
      cncfProject: 'kuberay',
      title: 'Install Ray Operator',
    })

    expect(matchInstallIntent('install kuberay', [mission])).toEqual(mission)
  })

  it('matches by title containing the slug', () => {
    const mission = makeMission({
      name: 'platform-ray-stack',
      title: 'Install KubeRay Operator Stack',
    })

    expect(matchInstallIntent('add kuberay', [mission])).toEqual(mission)
  })

  it('matches by tags when the mission name uses an alias', () => {
    const mission = makeMission({
      name: 'install-open-policy-agent-opa',
      title: 'Install Open Policy Agent (OPA)',
      tags: ['opa', 'policy'],
    })

    expect(matchInstallIntent('install opa', [mission])).toEqual(mission)
  })
})
