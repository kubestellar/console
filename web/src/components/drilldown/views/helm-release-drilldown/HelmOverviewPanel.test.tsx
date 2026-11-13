import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { HelmOverviewPanel } from './HelmOverviewPanel'
import type { HelmOverviewPanelProps, HelmRelease, ParsedResource } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => (opts?.count !== undefined ? `${key}:${opts.count}` : key),
  }),
}))

const releaseInfo: HelmRelease = {
  name: 'app', namespace: 'default', revision: '4', updated: '2024-03-01T00:00:00Z',
  status: 'deployed', chart: 'app-1.2.0', app_version: '1.2.0',
}

const resources: ParsedResource[] = [
  { kind: 'Deployment', name: 'web', namespace: 'default' },
  { kind: 'Service', name: 'web-svc', namespace: 'default' },
  { kind: 'ConfigMap', name: 'cfg', namespace: 'default' },
]

function renderPanel(overrides: Partial<HelmOverviewPanelProps> = {}) {
  const props: HelmOverviewPanelProps = {
    releaseName: 'my-release',
    releaseInfo,
    releaseHistory: null,
    parsedResources: resources,
    onResourceClick: vi.fn(),
    onShowMoreResources: vi.fn(),
    helmActionLoading: false,
    onConfirmUninstall: vi.fn(),
    ...overrides,
  }
  render(<HelmOverviewPanel {...props} />)
  return props
}

describe('HelmOverviewPanel', () => {
  it('renders release name, chart and revision from releaseInfo', () => {
    renderPanel()
    expect(screen.getByText('my-release')).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.chart: app-1.2.0')).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.revision: 4')).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.appVersion: 1.2.0')).toBeInTheDocument()
  })

  it('prefers explicit chart and app version props', () => {
    renderPanel({ chartName: 'custom-chart', chartVersion: '9', appVersion: '9.9' })
    expect(screen.getByText('drilldown.helm.chart: custom-chart')).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.appVersion: 9.9')).toBeInTheDocument()
  })

  it('falls back when releaseInfo is missing', () => {
    renderPanel({ releaseInfo: null, releaseRevision: '7' })
    expect(screen.getByText('drilldown.helm.chart: common.loading')).toBeInTheDocument()
    expect(screen.getByText('drilldown.helm.revision: 7')).toBeInTheDocument()
    expect(screen.queryByText(/drilldown.helm.appVersion/)).not.toBeInTheDocument()
    expect(screen.queryByText(/drilldown.helm.updated/)).not.toBeInTheDocument()
  })

  it('defaults revision to 1 when none is available', () => {
    renderPanel({ releaseInfo: null })
    expect(screen.getByText('drilldown.helm.revision: 1')).toBeInTheDocument()
  })

  it('shows the updated timestamp when present', () => {
    renderPanel()
    expect(screen.getByText(/drilldown.helm.updated:/)).toBeInTheDocument()
  })

  it.each([
    ['deployed', 'Status: deployed'],
    ['pending-install', 'Status: pending'],
    ['pending-upgrade', 'Status: pending'],
    ['failed', 'Status: failed'],
    ['unknown-state', 'Status: deployed'],
  ])('maps helm status %s to %s', (status, label) => {
    renderPanel({ releaseInfo: { ...releaseInfo, status } })
    expect(screen.getByLabelText(label)).toBeInTheDocument()
  })

  it('shows resource counts and dash for missing history', () => {
    renderPanel()
    expect(screen.getByText('-')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows revision count when history exists', () => {
    renderPanel({
      releaseHistory: [
        { revision: 1, updated: '', status: 'superseded', chart: 'c', app_version: '1', description: '' },
        { revision: 2, updated: '', status: 'deployed', chart: 'c', app_version: '1', description: '' },
      ],
    })
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('calls onResourceClick with the clicked resource', async () => {
    const props = renderPanel()
    await userEvent.click(screen.getByText('web-svc'))
    expect(props.onResourceClick).toHaveBeenCalledWith(resources[1])
  })

  it('hides deployed resources section when there are none', () => {
    renderPanel({ parsedResources: [] })
    expect(screen.queryByText('drilldown.helm.deployedResources')).not.toBeInTheDocument()
  })

  it('limits chips to 10 and offers show more', async () => {
    const many: ParsedResource[] = Array.from({ length: 12 }, (_, i) => ({
      kind: 'ConfigMap', name: `cm-${i}`, namespace: 'default',
    }))
    const props = renderPanel({ parsedResources: many })
    expect(screen.queryByText('cm-10')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('labels.moreItems:2'))
    expect(props.onShowMoreResources).toHaveBeenCalledTimes(1)
  })

  it('does not show more button for 10 or fewer resources', () => {
    renderPanel()
    expect(screen.queryByText(/labels.moreItems/)).not.toBeInTheDocument()
  })

  it('triggers uninstall and respects loading state', async () => {
    const props = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'drilldown.helm.uninstallRelease' }))
    expect(props.onConfirmUninstall).toHaveBeenCalledTimes(1)
  })

  it('disables uninstall while an action is loading', () => {
    renderPanel({ helmActionLoading: true })
    expect(screen.getByRole('button', { name: 'drilldown.helm.uninstallRelease' })).toBeDisabled()
  })
})
