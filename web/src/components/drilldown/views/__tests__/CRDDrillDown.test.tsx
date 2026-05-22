/**
 * RTL interaction tests for CRDDrillDown (#15406, Part of #4189).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import {
  mockRunKubectl,
  mockUseTranslation,
  renderWithDrillDown,
} from './drilldown-interaction-helpers'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => false,
  getDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => false,
  default: () => false,
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => true,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => false,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
  emitDrillDownOpened: vi.fn(),
  emitDrillDownClosed: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => mockUseTranslation(),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: true }),
}))

vi.mock('../../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: mockRunKubectl, runHelm: vi.fn() }),
}))

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
  PageErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' '),
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
