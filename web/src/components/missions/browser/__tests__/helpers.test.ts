import { describe, it, expect } from 'vitest'
import { buildDirectoryEntryNode } from '../helpers'
import type { BrowseEntry } from '../../../../lib/missions/types'
import type { TreeNode } from '../types'

describe('buildDirectoryEntryNode', () => {
  const entry: BrowseEntry = {
    name: 'Chart.yaml',
    path: 'go-binary/templates/embedded/managed-service-catalog/helm/kube-prometheus-stack/Chart.yaml',
    type: 'file',
  }

  it('preserves external repo metadata for Kubara files', () => {
    const selectedNode: TreeNode = {
      id: 'kubara/kube-prometheus-stack',
      name: 'kube-prometheus-stack',
      path: 'go-binary/templates/embedded/managed-service-catalog/helm/kube-prometheus-stack',
      type: 'directory',
      source: 'github',
      repoOwner: 'kubara-io',
      repoName: 'kubara',
    }

    expect(buildDirectoryEntryNode(entry, selectedNode, selectedNode.id)).toEqual({
      id: 'kubara/kube-prometheus-stack/Chart.yaml',
      name: 'Chart.yaml',
      path: entry.path,
      type: 'file',
      source: 'github',
      repoOwner: 'kubara-io',
      repoName: 'kubara',
      loaded: true,
    })
  })

  it('falls back to github source for existing kubara deep links', () => {
    expect(buildDirectoryEntryNode(entry, null, 'kubara/kube-prometheus-stack')).toMatchObject({
      id: entry.path,
      source: 'github',
      loaded: true,
    })
  })
})
