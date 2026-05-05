import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiGet = vi.fn()

vi.mock('../../../../lib/api', () => ({
  api: {
    get: apiGet,
  },
}))

import { fetchNodeFileContent, fetchTreeChildren } from '../treeFetchers'
import type { TreeNode } from '../types'

const KUBARA_CHART_PATH = 'go-binary/templates/embedded/managed-service-catalog/helm/kube-prometheus-stack'

function createKubaraNode(overrides: Partial<TreeNode>): TreeNode {
  return {
    id: 'kubara/kube-prometheus-stack',
    name: 'kube-prometheus-stack',
    path: KUBARA_CHART_PATH,
    type: 'directory',
    source: 'github',
    repoOwner: 'kubara-io',
    repoName: 'kubara',
    loaded: false,
    ...overrides,
  }
}

describe('treeFetchers kubara recursion guard', () => {
  beforeEach(() => {
    apiGet.mockReset()
  })

  it('loads nested kubara template folders from GitHub instead of synthesizing another templates folder', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          name: 'external-secrets.yaml',
          path: `${KUBARA_CHART_PATH}/templates/external-secrets.yaml`,
          type: 'file',
          size: 123,
        },
        {
          name: 'namespace.yaml',
          path: `${KUBARA_CHART_PATH}/templates/namespace.yaml`,
          type: 'file',
          size: 456,
        },
      ],
    })

    const children = await fetchTreeChildren(createKubaraNode({
      id: 'kubara/kube-prometheus-stack/templates',
      name: 'templates',
      path: `${KUBARA_CHART_PATH}/templates`,
    }))

    expect(apiGet).toHaveBeenCalledWith(
      `/api/github/repos/kubara-io/kubara/contents/${KUBARA_CHART_PATH}/templates`
    )
    expect(children.map((child) => child.name)).toEqual(['external-secrets.yaml', 'namespace.yaml'])
    expect(children.some((child) => child.name === 'templates')).toBe(false)
  })

  it('fetches nested kubara template file content from GitHub', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        content: btoa('kind: Namespace\nmetadata:\n  name: monitoring\n'),
        encoding: 'base64',
      },
    })

    const content = await fetchNodeFileContent(createKubaraNode({
      id: 'kubara/kube-prometheus-stack/templates/namespace.yaml',
      name: 'namespace.yaml',
      path: `${KUBARA_CHART_PATH}/templates/namespace.yaml`,
      type: 'file',
      loaded: true,
    }))

    expect(apiGet).toHaveBeenCalledWith(
      `/api/github/repos/kubara-io/kubara/contents/${KUBARA_CHART_PATH}/templates/namespace.yaml`
    )
    expect(content).toContain('kind: Namespace')
  })
})
