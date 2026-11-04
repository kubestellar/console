import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ArgoGitOpsTab } from './ArgoGitOpsTab'
import type { ArgoGitOpsTabProps } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const baseProps: ArgoGitOpsTabProps = {
  appName: 'guestbook',
  namespace: 'argocd',
  syncStatus: 'Synced',
  isSyncing: false,
  syncResult: null,
  copiedField: null,
  restartTimestamp: '2024-01-01T00:00:00Z',
  onTriggerSync: vi.fn(),
  onCopy: vi.fn(),
}

describe('ArgoGitOpsTab', () => {
  it('renders titles, docs links and the restart snippet', () => {
    const { container } = render(<ArgoGitOpsTab {...baseProps} />)
    expect(screen.getByText('drilldown.argoApp.gitopsRestartTitle')).toBeInTheDocument()
    expect(screen.getByText('drilldown.argoApp.argocdDocs')).toBeInTheDocument()
    expect(screen.getByText('drilldown.argoApp.whyDeclarativeTitle')).toBeInTheDocument()
    const pre = container.querySelector('pre')
    expect(pre).toHaveTextContent('name: guestbook')
    expect(pre).toHaveTextContent('namespace: argocd')
    expect(pre).toHaveTextContent('kubectl.kubernetes.io/restartedAt: "2024-01-01T00:00:00Z"')
  })

  it('shows out-of-sync warning only when OutOfSync', () => {
    const { rerender } = render(<ArgoGitOpsTab {...baseProps} />)
    expect(screen.queryByText('drilldown.argoApp.outOfSyncWarning')).not.toBeInTheDocument()
    rerender(<ArgoGitOpsTab {...baseProps} syncStatus="OutOfSync" />)
    expect(screen.getByText('drilldown.argoApp.outOfSyncWarning')).toBeInTheDocument()
  })

  it('triggers sync with app name and namespace', async () => {
    const onTriggerSync = vi.fn()
    render(<ArgoGitOpsTab {...baseProps} onTriggerSync={onTriggerSync} />)
    await userEvent.click(screen.getByRole('button', { name: 'drilldown.argoApp.syncNow' }))
    expect(onTriggerSync).toHaveBeenCalledWith('guestbook', 'argocd')
  })

  it('disables the sync button and shows syncing label while syncing', () => {
    render(<ArgoGitOpsTab {...baseProps} isSyncing={true} />)
    expect(screen.getByRole('button', { name: 'drilldown.argoApp.syncing' })).toBeDisabled()
    // Only the "after commit" hint still references syncNow
    expect(screen.getAllByText('drilldown.argoApp.syncNow')).toHaveLength(1)
  })

  it('shows success and failure sync results', () => {
    const { rerender } = render(<ArgoGitOpsTab {...baseProps} syncResult={{ success: true }} />)
    expect(screen.getByText('drilldown.argoApp.syncSuccessMessage')).toBeInTheDocument()
    rerender(<ArgoGitOpsTab {...baseProps} syncResult={{ success: false, error: 'boom' }} />)
    expect(screen.getByText('drilldown.argoApp.syncFailedMessage')).toBeInTheDocument()
    expect(screen.queryByText('drilldown.argoApp.syncSuccessMessage')).not.toBeInTheDocument()
  })

  it('copies the restart snippet', async () => {
    const onCopy = vi.fn()
    render(<ArgoGitOpsTab {...baseProps} onCopy={onCopy} />)
    await userEvent.click(screen.getByText('drilldown.argoApp.copyButton'))
    expect(onCopy).toHaveBeenCalledWith('restart-snippet', expect.stringContaining('name: guestbook'))
  })

  it('shows the copied check icon when copiedField matches', () => {
    const { container } = render(<ArgoGitOpsTab {...baseProps} copiedField="restart-snippet" />)
    expect(container.querySelector('svg.lucide-check')).toBeInTheDocument()
  })
})
