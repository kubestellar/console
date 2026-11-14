import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HelmActionFeedbackBanner, HelmConfirmActionBanner } from '../HelmActionBanner'
import { HelmHeader } from '../HelmHeader'
import { HelmOverviewPanel } from '../HelmOverviewPanel'
import { HelmReleaseHistoryTable } from '../HelmReleaseHistoryTable'
import type { HelmHistory, HelmOverviewPanelProps, HelmRelease, HelmReleaseHistoryTableProps } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { count?: number }) => options?.count === undefined ? key : `${key}:${options.count}` }),
}))

const release: HelmRelease = {
  name: 'web', namespace: 'apps', revision: '3', updated: '2026-01-02T12:00:00Z',
  status: 'deployed', chart: 'web-chart', app_version: '1.2',
}
const history: HelmHistory[] = [1, 3, 2].map(revision => ({
  revision, updated: '2026-01-02T12:00:00Z', status: revision === 3 ? 'deployed' : 'superseded',
  chart: `chart-${revision}`, app_version: '1.2', description: `description-${revision}`,
}))

function historyProps(): HelmReleaseHistoryTableProps {
  return { historyLoading: false, releaseHistory: history, releaseInfo: release, releaseRevision: '2', helmActionLoading: false, onConfirmRollback: vi.fn() }
}

function overviewProps(): HelmOverviewPanelProps {
  return {
    releaseName: 'web', releaseInfo: release, releaseRevision: '2', releaseHistory: history,
    parsedResources: [], onResourceClick: vi.fn(), onShowMoreResources: vi.fn(),
    helmActionLoading: false, onConfirmUninstall: vi.fn(),
  }
}

describe('HelmReleaseHistoryTable', () => {
  it('shows loading instead of history, then an empty state', () => {
    const props = historyProps()
    const { container, rerender } = render(<HelmReleaseHistoryTable {...props} historyLoading />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('chart-3')).not.toBeInTheDocument()
    rerender(<HelmReleaseHistoryTable {...props} releaseHistory={[]} />)
    expect(screen.getByText('drilldown.helm.noHistory')).toBeInTheDocument()
  })

  it('sorts revisions without mutating history and requests rollback only for older revisions', () => {
    const props = historyProps()
    render(<HelmReleaseHistoryTable {...props} />)
    expect(screen.getAllByText(/^chart-/).map(node => node.textContent)).toEqual(['chart-3', 'chart-2', 'chart-1'])
    expect(history.map(item => item.revision)).toEqual([1, 3, 2])
    expect(screen.queryByTitle('Roll back to revision 3')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Roll back to revision 2'))
    expect(props.onConfirmRollback).toHaveBeenCalledWith(2)
  })

  it('uses the fallback revision and disables rollback while an action is running', () => {
    const props = historyProps()
    render(<HelmReleaseHistoryTable {...props} releaseInfo={null} helmActionLoading />)
    expect(screen.queryByTitle('Roll back to revision 2')).not.toBeInTheDocument()
    const rollback = screen.getByTitle('Roll back to revision 3')
    expect(rollback).toBeDisabled()
    fireEvent.click(rollback)
    expect(props.onConfirmRollback).not.toHaveBeenCalled()
  })
})

describe('Helm action banners', () => {
  it('renders feedback only when present and distinguishes success from failure', () => {
    const { container, rerender } = render(<HelmActionFeedbackBanner actionFeedback={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<HelmActionFeedbackBanner actionFeedback={{ success: true, message: 'Completed' }} />)
    expect(screen.getByText('Completed')).toHaveClass('text-green-400')
    rerender(<HelmActionFeedbackBanner actionFeedback={{ success: false, message: 'Failed' }} />)
    expect(screen.getByText('Failed')).toHaveClass('text-red-400')
  })

  it('confirms rollback with its revision and allows cancellation', () => {
    const onCancel = vi.fn(), onConfirmRollback = vi.fn(), onConfirmUninstall = vi.fn()
    const props = { releaseName: 'web', namespace: 'apps', helmActionLoading: false, onCancel, onConfirmRollback, onConfirmUninstall }
    const { rerender } = render(<HelmConfirmActionBanner {...props} confirmAction={null} />)
    expect(screen.queryByText('Confirm rollback')).not.toBeInTheDocument()
    rerender(<HelmConfirmActionBanner {...props} confirmAction={{ type: 'rollback', revision: 2, label: 'Roll back' }} />)
    expect(screen.getByText('Roll back "web" to revision 2? This will create a new revision.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirmRollback).toHaveBeenCalledWith(2)
    expect(onConfirmUninstall).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('confirms uninstall and prevents duplicate confirmation during processing', () => {
    const onConfirmUninstall = vi.fn()
    const props = { releaseName: 'web', namespace: 'apps', onCancel: vi.fn(), onConfirmRollback: vi.fn(), onConfirmUninstall, confirmAction: { type: 'uninstall' as const, label: 'Uninstall' } }
    const { rerender } = render(<HelmConfirmActionBanner {...props} helmActionLoading={false} />)
    expect(screen.getByText('Uninstall "web" from apps? This will remove all associated resources.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
    expect(onConfirmUninstall).toHaveBeenCalledOnce()
    rerender(<HelmConfirmActionBanner {...props} helmActionLoading />)
    const processing = screen.getByRole('button', { name: 'Processing...' })
    expect(processing).toBeDisabled()
    fireEvent.click(processing)
    expect(onConfirmUninstall).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})

describe('HelmHeader', () => {
  it('shows the short cluster name and navigates with the full cluster identifier', () => {
    const drillToNamespace = vi.fn(), drillToCluster = vi.fn()
    render(<HelmHeader cluster="team/prod-east" namespace="apps" releaseStatus="deployed" statusStyle={{ bg: 'bg-green-500', text: 'text-green-400', border: 'border-green-500' }} drillToNamespace={drillToNamespace} drillToCluster={drillToCluster} />)
    expect(screen.getByText('DEPLOYED')).toHaveClass('text-green-400')
    fireEvent.click(screen.getByRole('button', { name: /apps/ }))
    fireEvent.click(screen.getByRole('button', { name: /prod-east/ }))
    expect(drillToNamespace).toHaveBeenCalledWith('team/prod-east', 'apps')
    expect(drillToCluster).toHaveBeenCalledWith('team/prod-east')
  })
})

describe('HelmOverviewPanel', () => {
  it('renders release information, status, counts and resource actions', () => {
    const resources = Array.from({ length: 11 }, (_, index) => ({ kind: index === 0 ? 'Deployment' : index === 1 ? 'Service' : 'ConfigMap', name: `resource-${index}`, namespace: 'apps' }))
    const props = { ...overviewProps(), parsedResources: resources }
    render(<HelmOverviewPanel {...props} />)
    expect(screen.getByRole('heading', { name: 'web' })).toBeInTheDocument()
    expect(screen.getByLabelText('Status: deployed')).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.chart: web-chart')).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.appVersion: 1.2')).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.revision: 3')).toBeInTheDocument()
    expect(screen.getByText(`drilldown.helm.updated: ${new Date(release.updated).toLocaleString()}`)).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.revisions').parentElement).toHaveTextContent('3')
    expect(screen.getByText('common.deployments').parentElement).toHaveTextContent('1')
    expect(screen.getByText('common.services').parentElement).toHaveTextContent('1')
    expect(screen.getByText('drilldown.helm.totalResources').parentElement).toHaveTextContent('11')
    fireEvent.click(screen.getByRole('button', { name: /Deployment:\s*resource-0/ }))
    expect(props.onResourceClick).toHaveBeenCalledWith(resources[0])
    expect(screen.queryByText('resource-10')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'labels.moreItems:1' }))
    expect(props.onShowMoreResources).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'drilldown.helm.uninstallRelease' }))
    expect(props.onConfirmUninstall).toHaveBeenCalledOnce()
  })

  it('uses fallback metadata, hides empty resources and disables uninstall during actions', () => {
    const props = overviewProps()
    render(<HelmOverviewPanel {...props} releaseInfo={null} releaseHistory={null} helmActionLoading />)
    expect(screen.getByText('drilldown.helm.chart: common.loading')).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.revision: 2')).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.revisions').parentElement).toHaveTextContent('-')
    expect(screen.queryByText('drilldown.helm.deployedResources')).not.toBeInTheDocument()
    const uninstall = screen.getByRole('button', { name: 'drilldown.helm.uninstallRelease' })
    expect(uninstall).toBeDisabled()
    fireEvent.click(uninstall)
    expect(props.onConfirmUninstall).not.toHaveBeenCalled()
  })

  it.each([['pending-install', 'pending'], ['pending-upgrade', 'pending'], ['failed', 'failed'], ['unknown', 'deployed']])('shows %s status as %s', (status, expected) => {
    render(<HelmOverviewPanel {...overviewProps()} releaseInfo={{ ...release, status }} />)
    expect(screen.getByLabelText(`Status: ${expected}`)).toBeInTheDocument()
  })
})
