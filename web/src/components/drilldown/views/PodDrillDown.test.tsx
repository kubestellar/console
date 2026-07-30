import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Box } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { PodDrillDown } from './PodDrillDown'

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: false }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToNamespace: vi.fn(),
    drillToCluster: vi.fn(),
    drillToDeployment: vi.fn(),
    drillToReplicaSet: vi.fn(),
    drillToConfigMap: vi.fn(),
    drillToSecret: vi.fn(),
    drillToServiceAccount: vi.fn(),
    drillToPVC: vi.fn(),
  }),
}))

vi.mock('../../../lib/safeLazy', () => ({
  safeLazy: () => () => null,
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('../../cards/console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: vi.fn(),
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
    errorMessage: null,
  }),
  ApiKeyPromptModal: () => null,
}))

vi.mock('../../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({ status: 'connected', inCluster: false }),
}))

vi.mock('../../../hooks/useAsyncData', () => ({
  useAsyncData: () => ({ data: null, loading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('./PodStatusSection', () => ({
  PodStatusSection: () => <div>Pod status section</div>,
}))

vi.mock('./PodLogsSection', () => ({
  PodLogsSection: () => <div>Pod logs section</div>,
}))

vi.mock('./PodEventsSection', () => ({
  PodEventsSection: () => <div>Pod events section</div>,
}))

vi.mock('./PodYamlSection', () => ({
  PodYamlSection: () => <div>Pod yaml section</div>,
}))

vi.mock('./pod-drilldown/PodLabelsContext', () => ({
  PodLabelsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('./pod-drilldown/helpers', () => ({
  computeKeyValueDiffMap: () => ({}),
}))

vi.mock('./pod-drilldown', () => ({
  getIssueSeverity: () => 'warning',
  PodAiAnalysis: () => null,
  PodDeleteSection: () => null,
  setPodCache: vi.fn(),
}))

vi.mock('./PodDrillDown.hooks', () => ({
  safeSet: (target: Record<string, string>, key: string, value: string) => {
    target[key] = value
  },
  usePodData: () => ({
    cache: {},
    status: 'Running',
    restarts: 0,
    issues: [],
    openTrackedWs: vi.fn(),
    parseWsMessage: vi.fn(),
    aiAnalysisFetcher: vi.fn(async () => null),
    podDiagnosis: null,
    reason: null,
    describeOutput: '',
    logsOutput: '',
    eventsOutput: '',
    yamlOutput: '',
    podStatusOutput: 'Running',
    podStatusLoading: false,
    podStatusError: null,
    describeLoading: false,
    describeError: null,
    eventsLoading: false,
    eventsError: null,
    logsLoading: false,
    logsError: null,
    yamlLoading: false,
    yamlError: null,
    hasLoadedRef: { current: false },
    shouldAutoRefreshRef: { current: false },
    fetchPodStatus: vi.fn(async () => undefined),
    fetchDescribe: vi.fn(async () => undefined),
    fetchLogs: vi.fn(async () => undefined),
    fetchEvents: vi.fn(async () => undefined),
    fetchYaml: vi.fn(async () => undefined),
  }),
}))

vi.mock('./PodDrillDown.actions', () => ({
  usePodActions: () => ({
    relatedResources: [],
    pendingLabelChanges: {},
    pendingAnnotationChanges: {},
    configMaps: [],
    secrets: [],
    pvcs: [],
    serviceAccount: null,
    fetchRelatedResources: vi.fn(async () => undefined),
    handleRepairPod: vi.fn(),
    saveLabels: vi.fn(),
    saveAnnotations: vi.fn(),
    canDeletePod: false,
    deletingPod: false,
    deleteError: null,
    showDeletePodConfirm: false,
    setShowDeletePodConfirm: vi.fn(),
    handleDeletePod: vi.fn(),
    editingLabels: false,
    setEditingLabels: vi.fn(),
    newLabelKey: '',
    setNewLabelKey: vi.fn(),
    newLabelValue: '',
    setNewLabelValue: vi.fn(),
    labelSaving: false,
    labelError: null,
    handleLabelChange: vi.fn(),
    handleLabelRemove: vi.fn(),
    undoLabelChange: vi.fn(),
    cancelLabelEdit: vi.fn(),
    editingAnnotations: false,
    setEditingAnnotations: vi.fn(),
    newAnnotationKey: '',
    setNewAnnotationKey: vi.fn(),
    newAnnotationValue: '',
    setNewAnnotationValue: vi.fn(),
    annotationSaving: false,
    annotationError: null,
    handleAnnotationChange: vi.fn(),
    handleAnnotationRemove: vi.fn(),
    undoAnnotationChange: vi.fn(),
    cancelAnnotationEdit: vi.fn(),
    relatedLoading: false,
  }),
}))

vi.mock('./PodDrillDown.tabs', () => ({
  useContainerNames: () => ['main'],
  usePodTabs: () => ({
    TABS: [{ id: 'overview', label: 'Overview', icon: Box }],
  }),
}))

describe('PodDrillDown', () => {
  it('renders the pod overview without crashing', () => {
    render(<PodDrillDown data={{ cluster: 'cluster-a', namespace: 'default', pod: 'api-pod' }} />)

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toBeInTheDocument()
    expect(screen.getByText('Pod status section')).toBeInTheDocument()
  })
})
