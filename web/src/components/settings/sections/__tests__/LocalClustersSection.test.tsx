import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VClusterActionFeedback } from '../../../../hooks/useLocalClusterTools'
import { LocalClustersSection } from '../LocalClustersSection'

function interpolate(template: string, params?: Record<string, unknown>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => String(params?.[key] ?? ''))
}

const translations: Record<string, string> = {
  'actions.delete': 'Delete',
  'actions.dismiss': 'Dismiss',
  'settings.localClusters.title': 'Local Clusters',
  'settings.localClusters.subtitle': 'Create and manage local Kubernetes clusters',
  'settings.localClusters.createNew': 'Create New Cluster',
  'settings.localClusters.selectTool': 'Select tool...',
  'settings.localClusters.creating': 'Creating...',
  'settings.localClusters.create': 'Create',
  'settings.localClusters.noClusters': 'No local clusters found. Create one above to get started.',
  'settings.localClusters.vclusterSection': 'Virtual Clusters',
  'settings.localClusters.vclusterDesc': 'Virtual clusters running inside host Kubernetes clusters',
  'settings.localClusters.vclusterCreateNew': 'Create Virtual Cluster',
  'settings.localClusters.vclusterDefaultNamespace': 'vcluster',
  'settings.localClusters.selectHostCluster': 'Select a host cluster...',
  'settings.localClusters.vclusterNamespace': 'Namespace',
  'settings.localClusters.vclusterConnect': 'Connect',
  'settings.localClusters.vclusterDisconnect': 'Disconnect',
  'settings.localClusters.vclusterConnected': 'Connected',
  'settings.localClusters.vclusterPaused': 'Paused',
  'settings.localClusters.kubevirtSection': 'KubeVirt',
  'settings.localClusters.kubevirtDesc': 'Run virtual machines on Kubernetes clusters',
  'settings.localClusters.kubevirtNoClusters': 'No connected clusters. Connect a cluster to check for KubeVirt.',
  'settings.localClusters.kubevirtNotDetected': 'KubeVirt Not Detected',
  'settings.localClusters.kubevirtInstallHint': 'Use the guided mission to install it.',
  'settings.localClusters.kubevirtOpenMission': 'Open Install KubeVirt Mission',
  'settings.localClusters.vclusterFeedback.connect.pending': 'Connecting to vCluster "{{name}}"...',
  'settings.localClusters.vclusterFeedback.connect.success': 'Connected to vCluster "{{name}}".',
  'settings.localClusters.vclusterFeedback.connect.errorFallback': 'Failed to connect to vCluster "{{name}}".',
  'settings.localClusters.vclusterFeedback.disconnect.pending': 'Disconnecting from vCluster "{{name}}"...',
  'settings.localClusters.vclusterFeedback.disconnect.success': 'Disconnected from vCluster "{{name}}".',
  'settings.localClusters.vclusterFeedback.disconnect.errorFallback': 'Failed to disconnect from vCluster "{{name}}".',
  'settings.localClusters.vclusterFeedback.delete.pending': 'Deleting vCluster "{{name}}" from namespace "{{namespace}}"...',
  'settings.localClusters.vclusterFeedback.delete.success': 'Deleted vCluster "{{name}}" from namespace "{{namespace}}".',
  'settings.localClusters.vclusterFeedback.delete.errorFallback': 'Failed to delete vCluster "{{name}}" from namespace "{{namespace}}".',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => interpolate(translations[key] ?? key, params),
  }),
}))

vi.mock('../../../ui/Button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => <button {...props}>{children}</button>,
}))

const mockStartMission = vi.fn()
vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

vi.mock('../../../cards/console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: (fn: () => void) => fn(),
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
  ApiKeyPromptModal: () => null,
}))

let mockConnectedClusters: Array<{ name: string; context?: string; healthy?: boolean; namespaces?: string[] }> = []

vi.mock('../../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({ deduplicatedClusters: mockConnectedClusters }),
}))

vi.mock('../../../../lib/modals', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('../../../../lib/analytics', () => ({
  emitLocalClusterCreated: vi.fn(),
}))

const dismissVClusterActionFeedback = vi.fn()

type MockHookState = ReturnType<typeof buildHookState>

let mockHookState: MockHookState

function buildHookState(feedback: VClusterActionFeedback | null = null) {
  return {
    installedTools: [{ name: 'vcluster', installed: true, version: '0.21.0' }],
    clusters: [],
    isLoading: false,
    isCreating: false,
    isDeleting: null,
    error: null,
    isConnected: true,
    isDemoMode: false,
    clusterProgress: null,
    dismissProgress: vi.fn(),
    createCluster: vi.fn(),
    deleteCluster: vi.fn(),
    clusterLifecycle: vi.fn(),
    refresh: vi.fn(),
    vclusterInstances: [
      { name: 'dev-tenant', namespace: 'vcluster', status: 'Running', connected: false },
    ],
    vclusterClusterStatus: [],
    isVClustersLoading: false,
    vclustersError: null,
    checkVClusterOnCluster: vi.fn(),
    isConnecting: null,
    isDisconnecting: null,
    vclusterActionFeedback: feedback,
    dismissVClusterActionFeedback,
    createVCluster: vi.fn(),
    connectVCluster: vi.fn(),
    disconnectVCluster: vi.fn(),
    deleteVCluster: vi.fn(),
    fetchVClusters: vi.fn(),
  }
}

vi.mock('../../../../hooks/useLocalClusterTools', () => ({
  useLocalClusterTools: () => mockHookState,
}))

function renderSection() {
  return render(
    <MemoryRouter>
      <LocalClustersSection />
    </MemoryRouter>,
  )
}

describe('LocalClustersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnectedClusters = []
    mockHookState = buildHookState()
  })

  it('shows pending connect feedback for vCluster actions', () => {
    mockHookState = buildHookState({ action: 'connect', name: 'dev-tenant', namespace: 'vcluster', state: 'pending' })

    renderSection()

    expect(screen.getByText('Connecting to vCluster "dev-tenant"...')).toBeTruthy()
  })

  it('shows success feedback after deleting a vCluster', () => {
    mockHookState = buildHookState({ action: 'delete', name: 'dev-tenant', namespace: 'vcluster', state: 'success' })

    renderSection()

    expect(screen.getByText('Deleted vCluster "dev-tenant" from namespace "vcluster".')).toBeTruthy()
  })

  it('shows friendly error feedback for failed vCluster connections', () => {
    mockHookState = buildHookState({
      action: 'connect',
      name: 'dev-tenant',
      namespace: 'vcluster',
      state: 'error',
      message: 'context deadline exceeded',
    })

    renderSection()

    expect(screen.getByText('The operation timed out. Check your network connection and system resources, then try again.')).toBeTruthy()
  })

  it('includes vCluster connection steps in the deploy mission prompt', () => {
    mockConnectedClusters = [{ name: 'k3d-ai', context: 'k3d-ai', healthy: true, namespaces: [] }]

    renderSection()

    fireEvent.change(screen.getByLabelText('Host Cluster'), { target: { value: 'k3d-ai' } })
    fireEvent.click(screen.getByRole('button', { name: 'Deploy vCluster to k3d-ai' }))

    expect(mockStartMission).toHaveBeenCalledWith(expect.objectContaining({
      initialPrompt: expect.stringContaining('want me to create and connect a virtual cluster now?'),
    }))
    expect(mockStartMission).toHaveBeenCalledWith(expect.objectContaining({
      initialPrompt: expect.stringContaining('Connect it so kubeconfig gets a usable vCluster context without replacing the current host context.'),
    }))
    expect(mockStartMission).toHaveBeenCalledWith(expect.objectContaining({
      initialPrompt: expect.stringContaining('Verify the vCluster context is reachable and visible to the Console cluster list.'),
    }))
  })
})
