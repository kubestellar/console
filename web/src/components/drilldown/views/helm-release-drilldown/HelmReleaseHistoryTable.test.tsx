import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { HelmReleaseHistoryTable } from './HelmReleaseHistoryTable'
import type { HelmHistory, HelmRelease } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const history: HelmHistory[] = [
  { revision: 1, updated: '2024-01-01T00:00:00Z', status: 'superseded', chart: 'app-1.0.0', app_version: '1.0', description: 'Install complete' },
  { revision: 3, updated: '2024-03-01T00:00:00Z', status: 'deployed', chart: 'app-1.2.0', app_version: '1.2', description: 'Upgrade complete' },
  { revision: 2, updated: '2024-02-01T00:00:00Z', status: 'failed', chart: 'app-1.1.0', app_version: '1.1', description: 'Upgrade failed' },
]

const releaseInfo: HelmRelease = {
  name: 'app', namespace: 'default', revision: '3', updated: '2024-03-01T00:00:00Z',
  status: 'deployed', chart: 'app-1.2.0', app_version: '1.2',
}

function renderTable(overrides: Partial<Parameters<typeof HelmReleaseHistoryTable>[0]> = {}) {
  const onConfirmRollback = vi.fn()
  render(
    <HelmReleaseHistoryTable
      historyLoading={false}
      releaseHistory={history}
      releaseInfo={releaseInfo}
      helmActionLoading={false}
      onConfirmRollback={onConfirmRollback}
      {...overrides}
    />,
  )
  return { onConfirmRollback }
}

describe('HelmReleaseHistoryTable', () => {
  it('shows a spinner while loading', () => {
    const { container } = render(
      <HelmReleaseHistoryTable
        historyLoading
        releaseHistory={history}
        releaseInfo={releaseInfo}
        helmActionLoading={false}
        onConfirmRollback={vi.fn()}
      />,
    )
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('app-1.0.0')).not.toBeInTheDocument()
  })

  it.each([null, []])('shows empty state when history is %j', (releaseHistory) => {
    renderTable({ releaseHistory })
    expect(screen.getByText('drilldown.helm.noHistory')).toBeInTheDocument()
  })

  it('renders revisions sorted newest first', () => {
    renderTable()
    const charts = screen.getAllByText(/^app-1\./).map((el) => el.textContent)
    expect(charts).toEqual(['app-1.2.0', 'app-1.1.0', 'app-1.0.0'])
  })

  it('renders status and description for each revision', () => {
    renderTable()
    expect(screen.getByText('failed')).toBeInTheDocument()
    expect(screen.getByText('Install complete')).toBeInTheDocument()
  })

  it('hides rollback for the current revision only', () => {
    renderTable()
    expect(screen.getAllByRole('button', { name: /Rollback/ })).toHaveLength(2)
    expect(screen.queryByTitle('Roll back to revision 3')).not.toBeInTheDocument()
  })

  it('falls back to releaseRevision when releaseInfo is null', () => {
    renderTable({ releaseInfo: null, releaseRevision: '2' })
    expect(screen.queryByTitle('Roll back to revision 2')).not.toBeInTheDocument()
    expect(screen.getByTitle('Roll back to revision 3')).toBeInTheDocument()
  })

  it('calls onConfirmRollback with the revision when clicked', async () => {
    const { onConfirmRollback } = renderTable()
    await userEvent.click(screen.getByTitle('Roll back to revision 1'))
    expect(onConfirmRollback).toHaveBeenCalledWith(1)
  })

  it('disables rollback buttons while an action is running', () => {
    renderTable({ helmActionLoading: true })
    screen.getAllByRole('button', { name: /Rollback/ }).forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })
})
