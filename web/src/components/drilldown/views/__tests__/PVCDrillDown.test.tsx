/**
 * RTL interaction tests for PVCDrillDown (#15406, Part of #4189).
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

import PVCDrillDown from '../PVCDrillDown'

const BOUND_DATA = {
  cluster: 'cluster-a',
  namespace: 'default',
  pvc: 'data-vol',
  status: 'Bound',
  capacity: '10Gi',
  accessModes: ['ReadWriteOnce'],
  storageClass: 'fast-ssd',
  volumeName: 'pvc-uid-abc',
}

const PENDING_DATA = {
  ...BOUND_DATA,
  status: 'Pending',
  volumeName: '',
}

const BOUND_PVC_JSON = {
  metadata: { name: 'data-vol', namespace: 'default' },
  spec: {
    accessModes: ['ReadWriteOnce'],
    storageClassName: 'fast-ssd',
    volumeName: 'pvc-uid-abc',
    volumeMode: 'Filesystem',
  },
  status: {
    phase: 'Bound',
    capacity: { storage: '10Gi' },
  },
}

const PENDING_PVC_JSON = {
  ...BOUND_PVC_JSON,
  spec: {
    accessModes: ['ReadWriteOnce'],
    storageClassName: 'fast-ssd',
    volumeMode: 'Filesystem',
  },
  status: {
    phase: 'Pending',
    capacity: { storage: '10Gi' },
  },
}

describe('PVCDrillDown interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders bound PVC capacity and access modes with green status styling', async () => {
    mockRunKubectl.mockResolvedValue(JSON.stringify(BOUND_PVC_JSON))
    renderWithDrillDown(<PVCDrillDown data={BOUND_DATA} />)

    expect(screen.getByRole('heading', { name: 'data-vol' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('Bound').length).toBeGreaterThanOrEqual(1)
    })

    const statusBadges = screen.getAllByText('Bound')
    expect(statusBadges[0]).toHaveClass('text-green-400')
    expect(screen.getByText('10Gi')).toBeInTheDocument()
    expect(screen.getByText('ReadWriteOnce')).toBeInTheDocument()
    expect(screen.getByText('fast-ssd')).toBeInTheDocument()
    expect(screen.getByText('pvc-uid-abc')).toBeInTheDocument()
  })

  it('renders pending PVC with yellow status styling and unbound volume', async () => {
    mockRunKubectl.mockResolvedValue(JSON.stringify(PENDING_PVC_JSON))
    renderWithDrillDown(<PVCDrillDown data={PENDING_DATA} />)

    await waitFor(() => {
      expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1)
    })

    const statusBadges = screen.getAllByText('Pending')
    expect(statusBadges[0]).toHaveClass('text-yellow-400')
    expect(screen.getByText('Unbound')).toBeInTheDocument()
    expect(screen.getByText('10Gi')).toBeInTheDocument()
    expect(screen.getByText('ReadWriteOnce')).toBeInTheDocument()
  })

  it('switches to the describe tab and loads kubectl describe output', async () => {
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (args.includes('describe')) {
        return 'Name: data-vol\nStatus: Bound'
      }
      return JSON.stringify(BOUND_PVC_JSON)
    })

    renderWithDrillDown(<PVCDrillDown data={BOUND_DATA} />)

    fireEvent.click(screen.getByRole('button', { name: /^(drilldown\.describe|Describe)$/i }))

    await waitFor(() => {
      expect(screen.getByText(/Name: data-vol/)).toBeInTheDocument()
    })
  })
})
