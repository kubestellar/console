/**
 * MissionContentContext unit tests
 *
 * Covers: context creation, provider rendering, and hook error handling.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MissionContentProvider, useMissionContentContext } from '../MissionContentContext'
import type { MissionContentContextValue } from '../MissionContentContext'

describe('MissionContentContext', () => {
  const mockContextValue: MissionContentContextValue = {
    searchPanel: {
      activeTab: 'recommended',
      searchQuery: '',
      tokenError: null,
      missionFetchError: null,
      loadingRecommendations: false,
      searchProgress: { step: '', detail: '', found: 0, scanned: 0 },
      hasCluster: false,
      recommendations: [],
      filteredRecommendations: [],
      installerMissions: [],
      filteredInstallers: [],
      loadingInstallers: false,
      installerSearch: '',
      onInstallerSearchChange: () => {},
      installerCategoryFilter: '',
      onInstallerCategoryFilterChange: () => {},
      installerMaturityFilter: '',
      onInstallerMaturityFilterChange: () => {},
      fixerMissions: [],
      filteredFixers: [],
      loadingFixers: false,
      fixerSearch: '',
      onFixerSearchChange: () => {},
      fixerTypeFilter: '',
      onFixerTypeFilterChange: () => {},
    },
    filePanel: {
      selectedPath: null,
      selectedNode: null,
      viewMode: 'list',
      onToggleNode: () => {},
      onSelectNode: () => {},
      onClearSelectedPath: () => {},
    },
    content: {
      loading: false,
      selectedMission: null,
      rawContent: null,
      showRaw: false,
      setShowRaw: () => {},
      isMissionLoading: false,
      missionContentError: null,
      unstructuredContent: null,
      isScanning: false,
      scanResult: null,
      showImproveDialog: false,
      setShowImproveDialog: () => {},
      directoryEntries: [],
      selectNode: async () => {},
      selectCardMission: async () => {},
      handleImport: async () => {},
      handleImportDirectoryEntry: async () => {},
      handleScanComplete: () => {},
      handleScanDismiss: () => {},
      handleCopyLink: async () => false,
      clearSelectedMission: () => {},
      resetContentView: () => {},
    },
    filteredEntries: [],
  }

  it('provides context value to children', () => {
    const TestConsumer = () => {
      const context = useMissionContentContext()
      return <div data-testid="consumer">{context.searchPanel.activeTab}</div>
    }

    const { getByTestId } = render(
      <MissionContentProvider {...mockContextValue}>
        <TestConsumer />
      </MissionContentProvider>
    )

    expect(getByTestId('consumer')).toHaveTextContent('recommended')
  })

  it('throws error when useMissionContentContext is used outside provider', () => {
    const TestComponent = () => {
      useMissionContentContext()
      return null
    }

    // Suppress console.error for this test
    const consoleError = console.error
    console.error = () => {}

    expect(() => render(<TestComponent />)).toThrow(
      'useMissionContentContext must be used within a MissionContentProvider'
    )

    console.error = consoleError
  })

  it('renders children when provider is mounted', () => {
    const { getByTestId } = render(
      <MissionContentProvider {...mockContextValue}>
        <div data-testid="child">Test Child</div>
      </MissionContentProvider>
    )

    expect(getByTestId('child')).toBeInTheDocument()
  })
})
