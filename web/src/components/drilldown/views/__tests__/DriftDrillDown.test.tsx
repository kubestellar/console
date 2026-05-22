/**
 * RTL interaction tests for DriftDrillDown (#15406, Part of #4189).
 */
import './drilldown-interaction-mocks'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { mockRunKubectl, renderWithDrillDown } from './drilldown-interaction-helpers'

vi.mock('../../../../hooks/useDrillDown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useDrillDown')>()
  return {
    ...actual,
    useDrillDownActions: () => ({
      drillToNamespace: vi.fn(),
      drillToCluster: vi.fn(),
      drillToPod: vi.fn(),
      drillToDeployment: vi.fn(),
    }),
    useDrillDown: () => ({ close: vi.fn() }),
  }
})

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../../../modals', () => ({
  AIActionBar: () => null,
  useModalAI: () => ({
    defaultAIActions: [],
    handleAIAction: vi.fn(),
    isAgentConnected: false,
  }),
}))

import { DriftDrillDown } from '../DriftDrillDown'

const BASE_DATA = {
  cluster: 'cluster-a',
  namespace: 'argocd',
  status: 'Synced',
  severity: 'None',
  gitRepo: 'https://github.com/org/repo',
  gitBranch: 'main',
  gitPath: 'manifests',
  driftedResources: 0,
}

const EMPTY_KUSTOMIZATION_LIST = { items: [] }

const ARGO_OUT_OF_SYNC = {
  items: [
    {
      metadata: { name: 'guestbook', namespace: 'argocd' },
      status: {
        sync: { status: 'OutOfSync' },
        resources: [
          {
            kind: 'Deployment',
            name: 'guestbook-ui',
            namespace: 'default',
            status: 'OutOfSync',
          },
        ],
      },
    },
  ],
}

/** Mirrors DriftDrillDown runKubectl argv: ['get', <resource>, ...]. */
const KUBECTL_GET_VERB = 'get'
const KUSTOMIZATION_RESOURCE = 'kustomization'
/** Argo CD Application CRD plural (kubectl resource type, not a URL host). */
const ARGO_APPLICATIONS_RESOURCE = ['applications', 'argoproj.io'].join('.')

function isKubectlGet(args: string[], resourceType: string): boolean {
  return args[0] === KUBECTL_GET_VERB && args[1] === resourceType
}

function setupDriftMocks(withDrift: boolean) {
  mockRunKubectl.mockImplementation(async (args: string[]) => {
    if (isKubectlGet(args, KUSTOMIZATION_RESOURCE)) {
      return JSON.stringify(EMPTY_KUSTOMIZATION_LIST)
    }
    if (isKubectlGet(args, ARGO_APPLICATIONS_RESOURCE)) {
      return JSON.stringify(withDrift ? ARGO_OUT_OF_SYNC : EMPTY_KUSTOMIZATION_LIST)
    }
    return JSON.stringify(EMPTY_KUSTOMIZATION_LIST)
  })
}

describe('DriftDrillDown interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDriftMocks(false)
  })

  it('shows no drift detected on the changes tab when nothing is out of sync', async () => {
    renderWithDrillDown(<DriftDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByText('No Drift Detected')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /drilldown\.tabs\.changes/ }))

    await waitFor(() => {
      expect(screen.queryByText('Deployment/guestbook-ui')).not.toBeInTheDocument()
    })
  })

  it('lists modified resources on the changes tab when drift exists', async () => {
    setupDriftMocks(true)
    renderWithDrillDown(
      <DriftDrillDown
        data={{
          ...BASE_DATA,
          severity: 'high',
          driftedResources: 1,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /drilldown\.tabs\.changes/ }))

    await waitFor(() => {
      expect(screen.getByText('Deployment/guestbook-ui')).toBeInTheDocument()
    })
    expect(screen.getByText('Modified')).toBeInTheDocument()
  })

  it('shows selected resource context on the diff tab after choosing a drifted row', async () => {
    setupDriftMocks(true)
    renderWithDrillDown(
      <DriftDrillDown
        data={{
          ...BASE_DATA,
          severity: 'high',
          driftedResources: 1,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /drilldown\.tabs\.changes/ }))

    await waitFor(() => {
      expect(screen.getByText('Deployment/guestbook-ui')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Deployment/guestbook-ui'))
    fireEvent.click(screen.getByRole('button', { name: /drilldown\.tabs\.diffView/ }))

    await waitFor(() => {
      expect(screen.getByText('Deployment/guestbook-ui in default')).toBeInTheDocument()
    })
    expect(screen.getByText('drilldown.drift.diffNotAvailable')).toBeInTheDocument()
  })
})
