import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Define dynamic mock states in module scope
let mockAgentConnected = true
let mockPermissionAllowed = true
const mockDrillToNamespace = vi.fn()
const mockDrillToCluster = vi.fn()
const mockDrillToDeployment = vi.fn()
const mockDrillToReplicaSet = vi.fn()
const mockDrillToConfigMap = vi.fn()
const mockDrillToSecret = vi.fn()
const mockDrillToServiceAccount = vi.fn()
const mockDrillToPVC = vi.fn()
const mockCloseDrillDown = vi.fn()
const mockStartMission = vi.fn()
const mockShowToast = vi.fn()
const mockCheckKeyAndRun = vi.fn().mockImplementation((fn: () => void) => fn())

// Setup internal hook outputs for useAsyncData / usePodData
let mockIssues = ['CrashLoopBackOff']
let mockPodDiagnosis: any = {
  kind: 'crash-loop',
  currentStateReason: 'CrashLoopBackOff',
}
let mockDescribeOutput: string | null = 'mock-describe-output'
let mockDescribeLoading = false
let mockDescribeError: string | null = null

let mockLogsOutput: string | null = 'mock-logs-output'
let mockLogsLoading = false
let mockLogsError: string | null = null

let mockEventsOutput: string | null = 'mock-events-output'
let mockEventsLoading = false
let mockEventsError: string | null = null

let mockYamlOutput: string | null = `
apiVersion: v1
kind: Pod
metadata:
  name: pod1
  namespace: ns1
`
let mockYamlLoading = false
let mockYamlError: string | null = null

let mockPodStatusOutput: string | null = 'mock-pod-status-output'
let mockPodStatusLoading = false
let mockPodStatusError: string | null = null

// Setup AI analysis mock states (reactive via component state in mock)
let mockAiAnalysisData: string | null = null
let mockAiAnalysisLoading = false
let mockAiAnalysisError: string | null = null
const mockRefetchAiAnalysis = vi.fn()

// Setup usePodActions mock states (reactive via component state in mock)
const mockHandleDeletePod = vi.fn()
const mockFetchRelatedResources = vi.fn()
let mockDeletingPod = false
let mockDeleteError: string | null = null
let mockShowDeletePodConfirm = false
const mockSetShowDeletePodConfirm = vi.fn()

// -------------------------------------------------------------
// The 18 Canonical Mocks (extended/configured with dynamic vars)
// -------------------------------------------------------------

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, options?: any) => {
    if (key === 'drilldown.confirmDelete.managedPod') return `managed-delete-msg-${options?.name}`
    if (key === 'drilldown.confirmDelete.unmanagedPod') return `unmanaged-delete-msg-${options?.name}`
    return key
  }, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: mockAgentConnected }),
}))

vi.mock('../../../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({ status: 'connected', inCluster: false }),
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToNamespace: mockDrillToNamespace,
    drillToCluster: mockDrillToCluster,
    drillToDeployment: mockDrillToDeployment,
    drillToReplicaSet: mockDrillToReplicaSet,
    drillToConfigMap: mockDrillToConfigMap,
    drillToSecret: mockDrillToSecret,
    drillToServiceAccount: mockDrillToServiceAccount,
    drillToPVC: mockDrillToPVC,
  }),
  useDrillDown: () => ({ close: mockCloseDrillDown }),
}))

vi.mock('../../../../hooks/usePermissions', () => ({
  useCanI: () => ({
    checkPermission: vi.fn().mockImplementation(() => Promise.resolve({ allowed: mockPermissionAllowed })),
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: vi.fn((...classes: any[]) => classes.filter(Boolean).join(' ')),
}))

vi.mock('../../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../cards/console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: mockCheckKeyAndRun,
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
  ApiKeyPromptModal: () => null,
}))

vi.mock('../PodDrillDown.tabs', () => ({
  usePodTabs: () => ({
    TABS: [
      { id: 'overview', label: 'drilldown.tabs.overview', icon: () => null },
      { id: 'logs', label: 'drilldown.tabs.logs', icon: () => null },
      { id: 'events', label: 'drilldown.tabs.events', icon: () => null },
      { id: 'yaml', label: 'drilldown.tabs.yaml', icon: () => null },
      { id: 'describe', label: 'drilldown.tabs.describe', icon: () => null },
      { id: 'exec', label: 'drilldown.tabs.exec', icon: () => null },
      { id: 'related', label: 'drilldown.tabs.related', icon: () => null },
    ],
  }),
  useContainerNames: () => ['container-1'],
}))

// Additional mocks needed to fully mock AsyncData hook with state changes
vi.mock('../../../../hooks/useAsyncData', () => ({
  useAsyncData: vi.fn((fetcher: any, deps: any, options: any) => {
    if (options?.enabled === false) {
      const [data, setData] = React.useState(mockAiAnalysisData)
      const [loading, setLoading] = React.useState(mockAiAnalysisLoading)
      const [error, setError] = React.useState(mockAiAnalysisError)

      React.useEffect(() => {
        setData(mockAiAnalysisData)
      }, [mockAiAnalysisData])

      React.useEffect(() => {
        setLoading(mockAiAnalysisLoading)
      }, [mockAiAnalysisLoading])

      React.useEffect(() => {
        setError(mockAiAnalysisError)
      }, [mockAiAnalysisError])

      mockRefetchAiAnalysis.mockImplementation(() => {
        mockAiAnalysisLoading = true
        setLoading(true)
        return Promise.resolve()
      })

      return {
        data,
        loading,
        error,
        refetch: mockRefetchAiAnalysis,
      }
    }
    return { data: null, loading: false, error: null, refetch: vi.fn() }
  })
}))

// Mock Sub-hooks at the module level
vi.mock('../PodDrillDown.hooks', () => ({
  safeSet: vi.fn(),
  usePodData: () => ({
    cache: {
      describeOutput: mockDescribeOutput,
      logsOutput: mockLogsOutput,
      eventsOutput: mockEventsOutput,
      yamlOutput: mockYamlOutput,
      podStatusOutput: mockPodStatusOutput,
    },
    hasLoadedRef: { current: true },
    shouldAutoRefreshRef: { current: false },
    describeOutput: mockDescribeOutput,
    describeLoading: mockDescribeLoading,
    describeError: mockDescribeError,
    logsOutput: mockLogsOutput,
    logsLoading: mockLogsLoading,
    logsError: mockLogsError,
    eventsOutput: mockEventsOutput,
    eventsLoading: mockEventsLoading,
    eventsError: mockEventsError,
    yamlOutput: mockYamlOutput,
    yamlLoading: mockYamlLoading,
    yamlError: mockYamlError,
    podStatusOutput: mockPodStatusOutput,
    podStatusLoading: mockPodStatusLoading,
    podStatusError: mockPodStatusError,
    fetchDescribe: vi.fn(),
    fetchLogs: vi.fn(),
    fetchEvents: vi.fn(),
    fetchYaml: vi.fn(),
    fetchPodStatus: vi.fn(),
    issues: mockIssues,
    baseIssues: mockIssues,
    podDiagnosis: mockPodDiagnosis,
    status: 'Failed',
    restarts: 2,
    reason: 'CrashLoopBackOff',
    aiAnalysisFetcher: vi.fn(),
    runKubectl: vi.fn(),
    openTrackedWs: vi.fn(),
    parseWsMessage: vi.fn(),
  })
}))

vi.mock('../PodDrillDown.actions', () => ({
  usePodActions: () => {
    const [showConfirm, setShowConfirm] = React.useState(mockShowDeletePodConfirm)
    const [deleting, setDeleting] = React.useState(mockDeletingPod)
    const [deleteErr, setDeleteErr] = React.useState<string | null>(mockDeleteError)

    React.useEffect(() => {
      setShowConfirm(mockShowDeletePodConfirm)
    }, [mockShowDeletePodConfirm])

    React.useEffect(() => {
      setDeleting(mockDeletingPod)
    }, [mockDeletingPod])

    React.useEffect(() => {
      setDeleteErr(mockDeleteError)
    }, [mockDeleteError])

    mockSetShowDeletePodConfirm.mockImplementation((v) => {
      mockShowDeletePodConfirm = v
      setShowConfirm(v)
    })

    return {
      canDeletePod: mockPermissionAllowed,
      deletingPod: deleting,
      deleteError: deleteErr,
      showDeletePodConfirm: showConfirm,
      setShowDeletePodConfirm: mockSetShowDeletePodConfirm,
      handleDeletePod: mockHandleDeletePod,
      isManagedPod: true,
      relatedResources: [
        { kind: 'ReplicaSet', name: 'replicaset-1', namespace: 'ns1' },
        { kind: 'Deployment', name: 'deployment-1', namespace: 'ns1' },
      ],
      configMaps: ['cm-1'],
      secrets: ['secret-1'],
      pvcs: ['pvc-1'],
      serviceAccount: 'sa-1',
      fetchRelatedResources: mockFetchRelatedResources,
      editingLabels: false,
      setEditingLabels: vi.fn(),
      pendingLabelChanges: {},
      newLabelKey: '',
      setNewLabelKey: vi.fn(),
      newLabelValue: '',
      setNewLabelValue: vi.fn(),
      labelSaving: false,
      labelError: null,
      saveLabels: vi.fn(),
      handleLabelChange: vi.fn(),
      handleLabelRemove: vi.fn(),
      undoLabelChange: vi.fn(),
      cancelLabelEdit: vi.fn(),
      editingAnnotations: false,
      setEditingAnnotations: vi.fn(),
      pendingAnnotationChanges: {},
      newAnnotationKey: '',
      setNewAnnotationKey: vi.fn(),
      newAnnotationValue: '',
      setNewAnnotationValue: vi.fn(),
      annotationSaving: false,
      annotationError: null,
      saveAnnotations: vi.fn(),
      handleAnnotationChange: vi.fn(),
      handleAnnotationRemove: vi.fn(),
      undoAnnotationChange: vi.fn(),
      cancelAnnotationEdit: vi.fn(),
    }
  }
}))

import { PodDrillDown } from '../PodDrillDown'

describe('PodDrillDown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgentConnected = true
    mockPermissionAllowed = true
    mockDeletingPod = false
    mockDeleteError = null
    mockShowDeletePodConfirm = false
    
    mockIssues = ['CrashLoopBackOff']
    mockPodDiagnosis = {
      kind: 'crash-loop',
      currentStateReason: 'CrashLoopBackOff',
    }
    
    mockDescribeOutput = 'mock-describe-output'
    mockDescribeLoading = false
    mockDescribeError = null
    
    mockLogsOutput = 'mock-logs-output'
    mockLogsLoading = false
    mockLogsError = null
    
    mockEventsOutput = 'mock-events-output'
    mockEventsLoading = false
    mockEventsError = null
    
    mockYamlOutput = `
apiVersion: v1
kind: Pod
metadata:
  name: pod1
  namespace: ns1
`
    mockYamlLoading = false
    mockYamlError = null
    
    mockPodStatusOutput = 'mock-pod-status-output'
    mockPodStatusLoading = false
    mockPodStatusError = null
    
    mockAiAnalysisData = null
    mockAiAnalysisLoading = false
    mockAiAnalysisError = null
  })

  // -------------------------------------------------------------
  // Test Suite 1: Core Metadata Display & Navigation
  // -------------------------------------------------------------
  it('renders core metadata and navigates properly', async () => {
    render(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Running' }} />)

    // Namespace element
    expect(screen.getByText('ns1')).toBeInTheDocument()
    expect(screen.getByText('drilldown.fields.namespace')).toBeInTheDocument()

    // Cluster element
    expect(screen.getByText('drilldown.fields.cluster')).toBeInTheDocument()

    // Namespace navigation
    const nsBtn = screen.getByRole('button', { name: /View namespace ns1/ })
    await userEvent.click(nsBtn)
    expect(mockDrillToNamespace).toHaveBeenCalledWith('c1', 'ns1')

    // Cluster navigation
    const clusterBtn = screen.getByRole('button', { name: /View cluster c1/ })
    await userEvent.click(clusterBtn)
    expect(mockDrillToCluster).toHaveBeenCalledWith('c1')
  })

  it('renders restarts count in header if restarts > 0', () => {
    render(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Running' }} />)
    expect(screen.getByText('drilldown.fields.restarts')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders the diagnosis panel with evidence and next steps for unhealthy states', () => {
    mockIssues = ['CrashLoopBackOff']
    mockPodDiagnosis = {
      kind: 'crash-loop',
      currentStateReason: 'CrashLoopBackOff',
    }

    render(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Failed' }} />)

    // Diagnosis section title
    expect(screen.getByText('drilldown.diagnosis.title')).toBeInTheDocument()
    expect(screen.getByText('drilldown.diagnosis.evidenceTitle')).toBeInTheDocument()
    expect(screen.getByText('drilldown.diagnosis.nextStepsTitle')).toBeInTheDocument()
    
    // Check specific evidence step rendered
    expect(screen.getByText('drilldown.diagnosis.steps.checkLogs')).toBeInTheDocument()
  })

  // -------------------------------------------------------------
  // Test Suite 2: Tab Navigation
  // -------------------------------------------------------------
  it('switches between tabs and updates aria-selected attributes', async () => {
    render(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Running' }} />)

    const logsTab = screen.getByRole('tab', { name: 'drilldown.tabs.logs' })
    const eventsTab = screen.getByRole('tab', { name: 'drilldown.tabs.events' })
    const yamlTab = screen.getByRole('tab', { name: 'drilldown.tabs.yaml' })

    // By default overview is active
    expect(screen.getByRole('tab', { name: 'drilldown.tabs.overview' })).toHaveAttribute('aria-selected', 'true')
    expect(logsTab).toHaveAttribute('aria-selected', 'false')

    // Click Logs tab
    await userEvent.click(logsTab)
    expect(logsTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'drilldown.tabs.overview' })).toHaveAttribute('aria-selected', 'false')

    // Click Events tab
    await userEvent.click(eventsTab)
    expect(eventsTab).toHaveAttribute('aria-selected', 'true')

    // Click YAML tab
    await userEvent.click(yamlTab)
    expect(yamlTab).toHaveAttribute('aria-selected', 'true')
  })

  // -------------------------------------------------------------
  // Test Suite 3: Delete Pod Flow (PodDeleteSection)
  // -------------------------------------------------------------
  it('handles the delete pod flow correctly (cancel, confirm, success, failure)', async () => {
    mockAgentConnected = true
    mockPermissionAllowed = true

    const { rerender } = render(
      <PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Failed' }} />
    )

    // Verify "Delete Pod" button is present and visible
    const deleteBtn = screen.getByRole('button', { name: /drilldown.actions.deletePod/ })
    expect(deleteBtn).toBeInTheDocument()
    expect(deleteBtn).toBeEnabled()

    // Clicking "Delete Pod" opens modal
    await userEvent.click(deleteBtn)
    expect(mockSetShowDeletePodConfirm).toHaveBeenCalledWith(true)

    // Re-render to propagate the true showConfirm state
    rerender(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Failed' }} />)

    // The modal elements should render
    expect(screen.getByText('managed-delete-msg-pod1')).toBeInTheDocument()

    // Test clicking Cancel
    const dialog1 = screen.getByRole('dialog')
    const cancelBtn = within(dialog1).getByRole('button', { name: 'common.cancel' })
    await userEvent.click(cancelBtn)
    expect(mockSetShowDeletePodConfirm).toHaveBeenCalledWith(false)

    // Re-open modal to test confirm flow
    mockShowDeletePodConfirm = true
    rerender(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Failed' }} />)

    // Test clicking Confirm Delete
    const dialog2 = screen.getByRole('dialog')
    const confirmBtn = within(dialog2).getByRole('button', { name: 'drilldown.actions.deletePod' })
    await userEvent.click(confirmBtn)
    expect(mockSetShowDeletePodConfirm).toHaveBeenCalledWith(false)
    expect(mockHandleDeletePod).toHaveBeenCalled()
  })

  it('displays delete error message if delete action has errors', () => {
    mockAgentConnected = true
    mockPermissionAllowed = true
    mockDeleteError = 'Failed to delete pod: API server rejected request'

    render(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Failed' }} />)

    expect(screen.getByText('Failed to delete pod: API server rejected request')).toBeInTheDocument()
  })

  // -------------------------------------------------------------
  // Test Suite 4: AI Analysis Panel Interactions (PodAiAnalysis)
  // -------------------------------------------------------------
  it('handles AI troubleshooting flow correctly', async () => {
    mockAgentConnected = true
    mockAiAnalysisData = null
    mockAiAnalysisLoading = false
    mockAiAnalysisError = null

    const { rerender } = render(
      <PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Failed' }} />
    )

    // Before triggering, diagnosis block is not shown
    expect(screen.queryByText('drilldown.ai.aiDiagnosis')).not.toBeInTheDocument()

    // Analyze button should be present
    const diagnoseBtn = screen.getByRole('button', { name: 'drilldown.actions.diagnose' })
    expect(diagnoseBtn).toBeInTheDocument()

    // Click Analyze triggers hook refetch
    await userEvent.click(diagnoseBtn)
    expect(mockRefetchAiAnalysis).toHaveBeenCalled()

    // Mock Loading state
    mockAiAnalysisLoading = true
    rerender(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Failed' }} />)
    expect(screen.getByText('Analyzing pod status, events, logs, owner resources...')).toBeInTheDocument()

    // Mock Success state
    mockAiAnalysisLoading = false
    mockAiAnalysisData = 'Root cause: Out of memory exit. Evidence: exitCode 137. Fix: Increase limit.'
    rerender(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Failed' }} />)

    // Results panel should show output
    expect(screen.getByText('drilldown.ai.aiDiagnosis')).toBeInTheDocument()
    expect(screen.getByText(/Root cause: Out of memory/)).toBeInTheDocument()

    // Re-analyze button should now show
    expect(screen.getByRole('button', { name: 'drilldown.actions.reAnalyze' })).toBeInTheDocument()
  })

  it('handles AI analysis error states', () => {
    mockAgentConnected = true
    mockAiAnalysisLoading = false
    mockAiAnalysisError = 'No AI provider configured. Please configure an AI provider in Settings.'

    render(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Failed' }} />)

    expect(screen.getByText('No AI provider configured. Please configure an AI provider in Settings.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.retry' })).toBeInTheDocument()
  })

  // -------------------------------------------------------------
  // Test Suite 5: Error States
  // -------------------------------------------------------------
  it('renders meaningful error state if status section retrieval fails', () => {
    mockPodStatusError = 'Agent disconnected unexpectedly'

    render(<PodDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1', status: 'Running' }} />)

    expect(screen.getByText('Agent disconnected unexpectedly')).toBeInTheDocument()
  })
})
