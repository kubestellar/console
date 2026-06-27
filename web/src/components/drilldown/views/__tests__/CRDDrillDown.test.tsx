import React from 'react'
/**
 * RTL interaction tests for CRDDrillDown (#15406, Part of #4189).
 * 
 * Note: Back navigation for drill-down views is provided by DrillDownModal
 * and is tested in DrillDownModal.test.tsx (pop, goTo, close functions).
 */
import './drilldown-interaction-mocks'
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { mockRunKubectl, renderWithDrillDown } from './drilldown-interaction-helpers'

vi.mock('../../../../hooks/useDrillDown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useDrillDown')>()
  return {
    ...actual,
    useDrillDownActions: () => ({
      drillToCluster: vi.fn(),
      drillToNamespace: vi.fn(),
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

vi.mock('../../PageErrorBoundary', () => ({
  PageErrorBoundary: ({ children }: { children: ReactNode }) => children,
}))

import { CRDDrillDown } from '../CRDDrillDown'

const BASE_DATA = {
  cluster: 'cluster-a',
  crd: 'widgets.example.com',
  group: 'example.com',
  kind: 'Widget',
  scope: 'Namespaced',
}

const CRD_JSON = {
  metadata: { name: 'widgets.example.com' },
  spec: {
    versions: [
      {
        name: 'v1',
        served: true,
        storage: true,
      },
      {
        name: 'v1beta1',
        served: true,
        storage: false,
        deprecated: true,
        deprecationWarning: 'Use v1 instead',
        schema: { openAPIV3Schema: { type: 'object', properties: { spec: { type: 'object' } } } },
      },
    ],
  },
  status: {
    conditions: [{ type: 'Established', status: 'True' }],
  },
}

const INSTANCES_JSON = {
  items: [
    {
      metadata: {
        name: 'widget-a',
        namespace: 'default',
        creationTimestamp: '2026-05-01T00:00:00Z',
      },
    },
  ],
}

describe('CRDDrillDown interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) {
        return JSON.stringify(CRD_JSON)
      }
      return JSON.stringify(INSTANCES_JSON)
    })
  })

  it('renders the versions list when the versions tab is selected', async () => {
    renderWithDrillDown(<CRDDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Versions \(2\)/ })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('tab', { name: /Versions \(2\)/ }))

    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument()
      expect(screen.getByText('v1beta1')).toBeInTheDocument()
      expect(screen.getByText('Use v1 instead')).toBeInTheDocument()
    })
    expect(screen.getByText('API Versions')).toBeInTheDocument()
  })

  it('shows version-specific deprecation detail in the versions panel', async () => {
    renderWithDrillDown(<CRDDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Versions \(2\)/ })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('tab', { name: /Versions \(2\)/ }))

    await waitFor(() => {
      expect(screen.getByText('common.deprecated')).toBeInTheDocument()
      expect(screen.getByText('Use v1 instead')).toBeInTheDocument()
    })
    expect(screen.queryByText('drilldown.crd.noInstancesFound')).not.toBeInTheDocument()
  })

  it('switches to the instances tab and renders custom resource rows', async () => {
    renderWithDrillDown(<CRDDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Instances \(1\)/ })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('tab', { name: /Instances \(1\)/ }))

    await waitFor(() => {
      expect(screen.getByText('widget-a')).toBeInTheDocument()
      expect(screen.getByText('(default)')).toBeInTheDocument()
    })
    expect(screen.queryByText('API Versions')).not.toBeInTheDocument()
  })

  it('shows an inline error when CRD version fetch fails', async () => {
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) {
        throw new Error('API unavailable')
      }
      return JSON.stringify(INSTANCES_JSON)
    })

    renderWithDrillDown(<CRDDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Versions \(0\)/ })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('tab', { name: /Versions \(0\)/ }))

    await waitFor(() => {
      expect(screen.getByText('API unavailable')).toBeInTheDocument()
    })
  })
})
