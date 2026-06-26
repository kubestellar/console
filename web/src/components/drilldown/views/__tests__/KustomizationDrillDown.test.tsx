/**
 * RTL interaction tests for KustomizationDrillDown (#15406, Part of #4189).
 */
import './drilldown-interaction-mocks'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import {
  mockDrillToDeployment,
  mockRunKubectl,
  renderWithDrillDown,
} from './drilldown-interaction-helpers'

vi.mock('../../../../hooks/useDrillDown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useDrillDown')>()
  return {
    ...actual,
    useDrillDownActions: () => ({
      drillToNamespace: vi.fn(),
      drillToCluster: vi.fn(),
      drillToPod: vi.fn(),
      drillToDeployment: mockDrillToDeployment,
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

import { KustomizationDrillDown } from '../KustomizationDrillDown'

const BASE_DATA = {
  cluster: 'cluster-a',
  namespace: 'flux-system',
  kustomization: 'apps',
  status: 'Ready',
  path: './clusters/prod',
  interval: '10m',
  sourceRef: { kind: 'GitRepository', name: 'flux-system' },
  lastAppliedRevision: 'main@sha1:abc123',
  suspended: false,
}

const KUSTOMIZATION_JSON = {
  metadata: { name: 'apps', namespace: 'flux-system' },
  status: {
    inventory: {
      entries: [{ id: 'default_my-deploy_apps_Deployment', v: 'apps/v1' }],
    },
    conditions: [
      { type: 'Ready', status: 'True', reason: 'ReconciliationSucceeded', message: 'Applied' },
    ],
  },
}

describe('KustomizationDrillDown interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunKubectl.mockResolvedValue(JSON.stringify(KUSTOMIZATION_JSON))
  })

  it('renders synced status badge and source reference on overview', () => {
    renderWithDrillDown(<KustomizationDrillDown data={BASE_DATA} />)

    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Source: GitRepository/flux-system')).toBeInTheDocument()
    expect(screen.getByText('Source Reference')).toBeInTheDocument()
    expect(screen.getByText('GitRepository')).toBeInTheDocument()
    expect(screen.getAllByText('flux-system').length).toBeGreaterThanOrEqual(1)
  })

  it('renders failed status styling when reconciliation failed', () => {
    renderWithDrillDown(
      <KustomizationDrillDown data={{ ...BASE_DATA, status: 'Failed' }} />,
    )

    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('renders suspended badge when kustomization is suspended', () => {
    renderWithDrillDown(
      <KustomizationDrillDown data={{ ...BASE_DATA, status: 'Ready', suspended: true }} />,
    )

    expect(screen.getAllByText('Suspended').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Yes')).toBeInTheDocument()
  })

  it('drills to deployment when an applied resource row is clicked', async () => {
    renderWithDrillDown(<KustomizationDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Resources \(1\)/ })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Resources \(1\)/ }))

    await waitFor(() => {
      expect(screen.getByText('my-deploy')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('my-deploy'))

    expect(mockDrillToDeployment).toHaveBeenCalledWith('cluster-a', 'default', 'my-deploy')
  })
})
