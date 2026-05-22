/**
 * RTL interaction tests for BuildpackDrillDown (#15406, Part of #4189).
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

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

import { BuildpackDrillDown } from '../BuildpackDrillDown'

const BASE_DATA = {
  cluster: 'cluster-a',
  namespace: 'buildpacks',
  name: 'sample-app',
  status: 'succeeded',
  builder: 'paketobuildpacks/builder:base',
}

const IMAGE_JSON = {
  metadata: { name: 'sample-app', namespace: 'buildpacks', creationTimestamp: '2026-05-01T00:00:00Z' },
  spec: { builder: { image: 'paketobuildpacks/builder:base' } },
  status: {
    latestImage: 'index.docker.io/library/sample-app:latest',
    conditions: [{ type: 'Ready', status: 'True' }],
  },
}

const BUILDS_JSON = {
  items: [
    {
      metadata: { name: 'sample-app-build-1', creationTimestamp: '2026-05-02T10:00:00Z' },
      status: { conditions: [{ type: 'Succeeded', status: 'True', reason: 'Completed' }] },
    },
    {
      metadata: { name: 'sample-app-build-2', creationTimestamp: '2026-05-02T12:00:00Z' },
      status: { conditions: [{ type: 'Succeeded', status: 'False', reason: 'BuildFailed' }] },
    },
  ],
}

describe('BuildpackDrillDown interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (args[0] === 'get' && args.includes('build')) {
        return JSON.stringify(BUILDS_JSON)
      }
      if (args[0] === 'get' && args.includes('image')) {
        return JSON.stringify(IMAGE_JSON)
      }
      return ''
    })
  })

  it('renders build history with success and failed steps on the builds tab', async () => {
    renderWithDrillDown(<BuildpackDrillDown data={BASE_DATA} />)

    fireEvent.click(screen.getByRole('button', { name: 'Build History' }))

    await waitFor(() => {
      expect(screen.getByText('sample-app-build-1')).toBeInTheDocument()
      expect(screen.getByText('sample-app-build-2')).toBeInTheDocument()
    })

    const failedBadges = screen.getAllByText('Failed')
    const successBadges = screen.getAllByText('Success')
    expect(failedBadges.length).toBeGreaterThanOrEqual(1)
    expect(successBadges.length).toBeGreaterThanOrEqual(1)
    expect(failedBadges[0]).toHaveClass('text-red-400')
    expect(successBadges[0]).toHaveClass('text-green-400')
  })

  it('highlights failed status in the header when image build failed', () => {
    renderWithDrillDown(
      <BuildpackDrillDown data={{ ...BASE_DATA, status: 'failed' }} />,
    )

    expect(screen.getByText('FAILED')).toBeInTheDocument()
    expect(screen.getByText('FAILED')).toHaveClass('text-red-400')
  })

  it('switches to the builds tab and shows build step reasons', async () => {
    renderWithDrillDown(<BuildpackDrillDown data={BASE_DATA} />)

    expect(screen.queryByText('BuildFailed')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Build History' }))

    await waitFor(() => {
      expect(screen.getByText('BuildFailed')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })
  })
})
