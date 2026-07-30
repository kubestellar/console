import { describe, it, expect } from 'vitest'
import { composeHolisticMission } from '../composer'
import type { MissionExport } from '../types'
import type { ApiGroupMapping } from '../apiGroupMapping'

function makeInstaller(project: string, title: string): MissionExport {
  return {
    version: 'kc-mission-v1',
    title,
    description: `Install ${title}`,
    type: 'deploy',
    tags: [project],
    cncfProject: project,
    steps: [
      { title: `Add ${title} Helm repo`, description: 'Add the Helm repository' },
      { title: `Install ${title}`, description: 'Run helm install' },
    ],
  }
}

function makeUserMission(): MissionExport {
  return {
    version: 'kc-mission-v1',
    title: 'Deploy RayCluster',
    description: 'Apply custom RayCluster CR',
    type: 'deploy',
    tags: ['ray', 'ml'],
    cncfProject: 'kuberay',
    steps: [
      { title: 'Apply RayCluster', description: 'Apply the CR', yaml: 'apiVersion: ray.io/v1alpha1...' },
    ],
  }
}

const kuberayMapping: ApiGroupMapping = {
  project: 'kuberay',
  tags: ['kuberay', 'ray', 'ml'],
  installMission: 'install-kuberay.json',
  displayName: 'KubeRay',
}

const prometheusMapping: ApiGroupMapping = {
  project: 'prometheus',
  tags: ['prometheus', 'monitoring'],
  installMission: 'install-prometheus.json',
  displayName: 'Prometheus',
}

describe('composeHolisticMission', () => {
  it('prepends installer steps as prerequisites by default', () => {
    const installer = makeInstaller('kuberay', 'KubeRay')
    const result = composeHolisticMission({
      userMission: makeUserMission(),
      detectedProjects: [kuberayMapping],
      availableInstallers: [installer],
    })

    expect(result.supplementaryMissions).toHaveLength(1)
    expect(result.replacedMissions).toHaveLength(0)
    // 2 installer steps + 1 user step
    expect(result.mission.steps).toHaveLength(3)
    expect(result.mission.steps[0].title).toContain('[Prerequisite')
    expect(result.mission.steps[2].title).toBe('Apply RayCluster')
    expect(result.mission.title).toContain('Holistic')
  })

  it('replaces installer steps when replaceInstallers=true', () => {
    const installer = makeInstaller('kuberay', 'KubeRay')
    const result = composeHolisticMission({
      userMission: makeUserMission(),
      detectedProjects: [kuberayMapping],
      availableInstallers: [installer],
      replaceInstallers: true,
    })

    expect(result.replacedMissions).toHaveLength(1)
    expect(result.supplementaryMissions).toHaveLength(0)
    // Only user step
    expect(result.mission.steps).toHaveLength(1)
    expect(result.mission.steps[0].title).toBe('Apply RayCluster')
  })

  it('tracks unmatched projects (no installer available)', () => {
    const result = composeHolisticMission({
      userMission: makeUserMission(),
      detectedProjects: [kuberayMapping],
      availableInstallers: [], // no installers
    })

    expect(result.unmatchedProjects).toHaveLength(1)
    expect(result.unmatchedProjects[0].project).toBe('kuberay')
    expect(result.mission.steps).toHaveLength(1)
  })

  it('merges tags from all sources', () => {
    const installer = makeInstaller('kuberay', 'KubeRay')
    const result = composeHolisticMission({
      userMission: makeUserMission(),
      detectedProjects: [kuberayMapping],
      availableInstallers: [installer],
    })

    expect(result.mission.tags).toContain('ray')
    expect(result.mission.tags).toContain('ml')
    expect(result.mission.tags).toContain('kuberay')
  })

  it('handles multiple detected projects', () => {
    const kuberayInstaller = makeInstaller('kuberay', 'KubeRay')
    const promInstaller = makeInstaller('prometheus', 'Prometheus')

    const userMission = makeUserMission()
    userMission.steps.push({
      title: 'Apply ServiceMonitor',
      description: 'Add monitoring',
      yaml: 'apiVersion: monitoring.coreos.com/v1...',
    })

    const result = composeHolisticMission({
      userMission,
      detectedProjects: [kuberayMapping, prometheusMapping],
      availableInstallers: [kuberayInstaller, promInstaller],
    })

    expect(result.supplementaryMissions).toHaveLength(2)
    // 2 kuberay steps + 2 prometheus steps + 2 user steps
    expect(result.mission.steps).toHaveLength(6)
  })

  it('includes prerequisites from both user and installers', () => {
    const installer = makeInstaller('kuberay', 'KubeRay')
    const userMission = makeUserMission()
    userMission.prerequisites = ['Helm installed']

    const result = composeHolisticMission({
      userMission,
      detectedProjects: [kuberayMapping],
      availableInstallers: [installer],
    })

    expect(result.mission.prerequisites).toContain('Helm installed')
    expect(result.mission.prerequisites).toContain('KubeRay')
  })

  it('sets metadata.source to holistic-composed', () => {
    const result = composeHolisticMission({
      userMission: makeUserMission(),
      detectedProjects: [],
      availableInstallers: [],
    })

    expect(result.mission.metadata?.source).toBe('holistic-composed')
  })
})
