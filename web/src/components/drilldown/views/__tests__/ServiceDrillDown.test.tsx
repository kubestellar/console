import React from 'react'
/**
 * RTL interaction tests for ServiceDrillDown (#15406, Part of #4189).
 */
import './drilldown-interaction-mocks'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import {
  mockDrillToPod,
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
      drillToPod: mockDrillToPod,
      drillToDeployment: vi.fn(),
      drillToReplicaSet: vi.fn(),
      drillToConfigMap: vi.fn(),
      drillToSecret: vi.fn(),
      drillToServiceAccount: vi.fn(),
      drillToPVC: vi.fn(),
    }),
    useDrillDown: () => ({ close: vi.fn() }),
  }
})

import ServiceDrillDown from '../ServiceDrillDown'

const BASE_DATA = {
  cluster: 'cluster-a',
  namespace: 'kube-system',
  service: 'metrics-api',
  type: 'ClusterIP',
  clusterIP: '10.96.0.10',
  ports: ['443/TCP'],
  endpoints: 0,
}

const SERVICE_JSON = {
  metadata: { name: 'metrics-api', labels: { app: 'metrics' } },
  spec: {
    type: 'ClusterIP',
    clusterIP: '10.96.0.10',
    selector: { app: 'metrics' },
    ports: [{ port: 443, protocol: 'TCP' }],
  },
  status: {},
}

describe('ServiceDrillDown interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (args.includes('endpoints')) {
        return JSON.stringify({ subsets: [] })
      }
      return JSON.stringify(SERVICE_JSON)
    })
  })

  it('shows overview fields on the overview tab by default', async () => {
    renderWithDrillDown(<ServiceDrillDown data={BASE_DATA} />)

    expect(screen.getByRole('heading', { name: 'metrics-api' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('ClusterIP')).toBeInTheDocument()
    })
    expect(screen.getByText('drilldown.service.clusterIp')).toBeInTheDocument()
    expect(screen.queryByText('drilldown.service.noReadyEndpoints')).not.toBeInTheDocument()
  })

  it('switches to the endpoints tab and shows the empty endpoints state', async () => {
    renderWithDrillDown(<ServiceDrillDown data={BASE_DATA} />)

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.endpoints' }))

    await waitFor(() => {
      expect(screen.getByText('drilldown.service.noReadyEndpoints')).toBeInTheDocument()
    })
    expect(screen.queryByText('drilldown.service.ports')).not.toBeInTheDocument()
  })

  it('switches to the endpoints tab and lists ready endpoint addresses', async () => {
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (args.includes('endpoints')) {
        return JSON.stringify({
          subsets: [
            {
              addresses: [
                { ip: '10.244.1.8', nodeName: 'node-1', targetRef: { name: 'metrics-pod-0' } },
              ],
            },
          ],
        })
      }
      return JSON.stringify(SERVICE_JSON)
    })

    renderWithDrillDown(<ServiceDrillDown data={BASE_DATA} />)

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.endpoints' }))

    await waitFor(() => {
      expect(screen.getByText('10.244.1.8')).toBeInTheDocument()
    })
    expect(screen.getByText('metrics-pod-0')).toBeInTheDocument()
  })

  it('drills to a backing pod when an endpoint row is clicked', async () => {
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (args.includes('endpoints')) {
        return JSON.stringify({
          subsets: [
            {
              addresses: [{ ip: '10.244.1.8', targetRef: { name: 'metrics-pod-0' } }],
            },
          ],
        })
      }
      return JSON.stringify(SERVICE_JSON)
    })

    renderWithDrillDown(<ServiceDrillDown data={BASE_DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.endpoints' }))

    await waitFor(() => {
      expect(screen.getByText('metrics-pod-0')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('10.244.1.8'))

    expect(mockDrillToPod).toHaveBeenCalledWith('cluster-a', 'kube-system', 'metrics-pod-0')
  })
})
