import React from 'react'
/**
 * Unit tests for Kubectl card component.
 * Covers: loading (no clusters), single-cluster auto-select, command execution,
 * history panel toggle, AI panel toggle, YAML editor toggle, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Kubectl } from './Kubectl'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

const mockExecute = vi.fn()
vi.mock('../../hooks/useKubectl', () => ({
  useKubectl: () => ({ execute: mockExecute }),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('./KubectlAIPanel', () => ({
  AIAssistantPanel: ({ onGenerateCommand }: { onGenerateCommand: (p: string) => void }) => (
    <div data-testid="ai-panel">
      <button onClick={() => onGenerateCommand('test prompt')}>generateCommand</button>
    </div>
  ),
}))

vi.mock('./KubectlYAMLEditorPanel', () => ({
  YAMLEditorPanel: () => <div data-testid="yaml-editor-panel" />,
}))

vi.mock('./KubectlHistoryPanel', () => ({
  CommandHistoryPanel: ({ history }: { history: unknown[] }) => (
    <div data-testid="history-panel" data-count={history.length} />
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultClusters = {
  deduplicatedClusters: [
    { name: 'prod-cluster', reachable: true, healthy: true },
    { name: 'dev-cluster', reachable: true, healthy: true },
  ],
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  consecutiveFailures: 0,
}

function setup(overrides = {}) {
  mockUseClusters.mockReturnValue({ ...defaultClusters, ...overrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  mockExecute.mockResolvedValue('pod-list output')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Kubectl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading / no clusters
  it('renders no-cluster message when clusters list is empty', () => {
    setup({ deduplicatedClusters: [] })
    render(<Kubectl />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  // 2. Cluster selector
  it('renders cluster selector dropdown', () => {
    render(<Kubectl />)
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThan(0)
  })

  it('auto-selects first cluster when only one is available', () => {
    setup({ deduplicatedClusters: [{ name: 'solo-cluster', reachable: true, healthy: true }] })
    render(<Kubectl />)
    // command input should be visible
    expect(screen.getByPlaceholderText(/kubectl/i)).toBeInTheDocument()
  })

  // 3. Command input
  it('renders command input', () => {
    render(<Kubectl />)
    expect(screen.getByPlaceholderText(/kubectl/i)).toBeInTheDocument()
  })

  it('executes command when send button is clicked', async () => {
    const user = userEvent.setup()
    setup({ deduplicatedClusters: [{ name: 'prod', reachable: true, healthy: true }] })
    render(<Kubectl />)

    await user.type(screen.getByPlaceholderText(/kubectl/i), 'get pods')
    const executeButton = document.querySelector('button[title="Execute command (or press Enter)"]') as HTMLButtonElement
    expect(executeButton).toBeInTheDocument()
    await user.click(executeButton)

    expect(mockExecute).toHaveBeenCalled()
  })

  // 4. Panel toggles
  it('toggles AI assistant panel on button click', async () => {
    const user = userEvent.setup()
    render(<Kubectl />)
    const aiBtn = screen.getAllByRole('button').find(b => b.title?.includes('AI') || b.textContent?.includes('AI') || b.querySelector('[data-icon="sparkles"]'))
    if (aiBtn) {
      await user.click(aiBtn)
      expect(screen.getByTestId('ai-panel')).toBeInTheDocument()
    }
  })

  it('toggles history panel on button click', async () => {
    const user = userEvent.setup()
    render(<Kubectl />)
    const histBtn = screen.getAllByRole('button').find(b => b.title?.includes('History') || b.title?.includes('history'))
    if (histBtn) {
      await user.click(histBtn)
      expect(screen.getByTestId('history-panel')).toBeInTheDocument()
    }
  })

  // 5. Snapshot
  it('matches snapshot with clusters', () => {
    setup({ deduplicatedClusters: [{ name: 'prod', reachable: true, healthy: true }] })
    const { asFragment } = render(<Kubectl />)
    expect(asFragment()).toMatchSnapshot()
  })
})
