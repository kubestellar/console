/**
 * RTL interaction tests for HelmReleaseDrillDown (#15406, Part of #4189).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import {
  mockDrillToDeployment,
  mockRunHelm,
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
  useDrillDownWebSocket: () => ({ runKubectl: vi.fn(), runHelm: mockRunHelm }),
}))

vi.mock('../../../../hooks/useDrillDown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useDrillDown')>()
  return {
    ...actual,
    useDrillDownActions: () => ({
      drillToNamespace: vi.fn(),
      drillToCluster: vi.fn(),
      drillToDeployment: mockDrillToDeployment,
      drillToService: vi.fn(),
    }),
    useDrillDown: () => ({ close: vi.fn() }),
  }
})

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../../../../hooks/useHelmActions', () => ({
  useHelmActions: () => ({
    rollback: vi.fn(),
    uninstall: vi.fn(),
    isLoading: false,
  }),
}))

vi.mock('../../../modals', () => ({
  AIActionBar: () => null,
  useModalAI: () => ({
    defaultAIActions: [],
    handleAIAction: vi.fn(),
    isAgentConnected: false,
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' '),
}))

vi.mock('../../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

import { HelmReleaseDrillDown } from '../HelmReleaseDrillDown'

const BASE_DATA = {
  cluster: 'cluster-a',
  namespace: 'default',
  release: 'nginx',
  chart: 'nginx',
  chartVersion: '1.2.0',
  appVersion: '1.25',
  status: 'deployed',
  revision: '2',
}

const HELM_STATUS_JSON = {
  name: 'nginx',
  namespace: 'default',
  version: 2,
  info: { status: 'deployed', last_deployed: '2026-05-02T12:00:00Z' },
  chart: { metadata: { name: 'nginx', appVersion: '1.25' } },
}

const HELM_HISTORY_JSON = [
  {
    revision: 2,
    updated: '2026-05-02T12:00:00Z',
    status: 'deployed',
    chart: 'nginx-1.2.0',
    app_version: '1.25',
    description: 'Upgrade complete',
  },
  {
    revision: 1,
    updated: '2026-05-01T12:00:00Z',
    status: 'superseded',
    chart: 'nginx-1.1.0',
    app_version: '1.24',
    description: 'Install complete',
  },
]

const HELM_MANIFEST = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
---
apiVersion: v1
kind: Service
metadata:
  name: web-svc
  namespace: default
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
  namespace: default`

function setupHelmMocks(options?: { valuesError?: boolean }) {
  mockRunHelm.mockImplementation(async (args: string[]) => {
    const joined = args.join(' ')
    if (joined.includes('status')) {
      return JSON.stringify(HELM_STATUS_JSON)
    }
    if (joined.includes('history')) {
      return JSON.stringify(HELM_HISTORY_JSON)
    }
    if (joined.includes('get') && joined.includes('values')) {
      if (options?.valuesError) {
        throw new Error('helm unavailable')
      }
      return 'replicaCount: 2'
    }
    if (joined.includes('manifest')) {
      return HELM_MANIFEST
    }
    return ''
  })
}

describe('HelmReleaseDrillDown interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupHelmMocks()
  })

  it('renders revision history when the history tab is selected', async () => {
    renderWithDrillDown(<HelmReleaseDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByText('nginx')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.history' }))

    await waitFor(() => {
      expect(screen.getByText('Upgrade complete')).toBeInTheDocument()
      expect(screen.getByText('Install complete')).toBeInTheDocument()
    })
    expect(screen.getByText('nginx-1.2.0')).toBeInTheDocument()
    expect(screen.getByText('nginx-1.1.0')).toBeInTheDocument()
  })

  it('shows an inline error message when release values cannot be loaded', async () => {
    setupHelmMocks({ valuesError: true })
    renderWithDrillDown(<HelmReleaseDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByText('nginx')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.values' }))

    await waitFor(() => {
      expect(screen.getByText('Error fetching values')).toBeInTheDocument()
    })
  })

  it('loads the full manifest resource list when the resources tab is opened', async () => {
    const manyResourceManifest = [
      ...Array.from({ length: 12 }, (_, index) => `apiVersion: v1
kind: Deployment
metadata:
  name: web-${index}
  namespace: default`),
      `apiVersion: v1
kind: Service
metadata:
  name: web-svc
  namespace: default`,
    ].join('\n---\n')

    mockRunHelm.mockImplementation(async (args: string[]) => {
      const joined = args.join(' ')
      if (joined.includes('status')) return JSON.stringify(HELM_STATUS_JSON)
      if (joined.includes('history')) return JSON.stringify(HELM_HISTORY_JSON)
      if (joined.includes('get') && joined.includes('values')) return 'replicaCount: 1'
      if (joined.includes('manifest')) return manyResourceManifest
      return ''
    })

    renderWithDrillDown(<HelmReleaseDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByText('nginx')).toBeInTheDocument()
    })
    expect(screen.queryByText('web-11')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.resources' }))

    await waitFor(() => {
      expect(screen.getByText('web-0')).toBeInTheDocument()
      expect(screen.getByText('web-11')).toBeInTheDocument()
      expect(screen.getByText('web-svc')).toBeInTheDocument()
    })
  })

  it('drills to a deployment when a manifest resource row is clicked', async () => {
    renderWithDrillDown(<HelmReleaseDrillDown data={BASE_DATA} />)

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.resources' }))

    await waitFor(() => {
      expect(screen.getByText('web')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('web').closest('div')!)

    expect(mockDrillToDeployment).toHaveBeenCalledWith('cluster-a', 'default', 'web')
  })
})
