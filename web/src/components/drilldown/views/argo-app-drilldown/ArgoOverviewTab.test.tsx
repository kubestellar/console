import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ArgoOverviewTab } from './ArgoOverviewTab'
import type { ArgoOverviewTabProps, ArgoResource } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const syncStyle = { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: () => null }
const healthStyle = { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }

const resources: ArgoResource[] = [
  { kind: 'Deployment', name: 'web', namespace: 'prod', status: 'Synced', health: 'Healthy' },
  { kind: 'Service', name: 'web-svc', namespace: 'prod', status: 'Synced' },
]

const baseProps: ArgoOverviewTabProps = {
  appName: 'guestbook',
  project: 'default',
  targetRevision: 'main',
  repoURL: 'https://github.com/argoproj/argocd-example-apps',
  path: 'guestbook',
  syncStatus: 'Synced',
  healthStatus: 'Healthy',
  syncStyle,
  healthStyle,
  appResources: resources,
  syncHistory: [{ revision: 'abc123', deployedAt: '2024-01-01T00:00:00Z', status: 'Succeeded' }],
  onResourceClick: vi.fn(),
  onShowMoreResources: vi.fn(),
}

describe('ArgoOverviewTab', () => {
  it('renders app name, project, revision and repo link', () => {
    render(<ArgoOverviewTab {...baseProps} />)
    expect(screen.getByText('guestbook')).toBeInTheDocument()
    expect(screen.getByText('Project: default')).toBeInTheDocument()
    expect(screen.getByText('Revision: main')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: baseProps.repoURL })
    expect(link).toHaveAttribute('href', baseProps.repoURL)
    expect(screen.getByText('/guestbook')).toBeInTheDocument()
  })

  it('hides optional fields and unsafe repo URLs', () => {
    render(
      <ArgoOverviewTab
        {...baseProps}
        project={undefined}
        targetRevision={undefined}
        repoURL="javascript:alert(1)"
      />,
    )
    expect(screen.queryByText(/Project:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Revision:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows resource and deployment counts', () => {
    render(<ArgoOverviewTab {...baseProps} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows dashes and no managed resources section when data is null', () => {
    render(<ArgoOverviewTab {...baseProps} appResources={null} syncHistory={null} />)
    expect(screen.getAllByText('-')).toHaveLength(2)
    expect(screen.queryByText('Managed Resources')).not.toBeInTheDocument()
  })

  it('renders status icons for out-of-sync and unhealthy apps', () => {
    const { container } = render(
      <ArgoOverviewTab {...baseProps} syncStatus="OutOfSync" healthStatus="Degraded" />,
    )
    expect(screen.getByText('Sync Status')).toBeInTheDocument()
    expect(screen.getByText('Health Status')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-triangle-alert, svg.lucide-alert-triangle')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-circle-x, svg.lucide-x-circle')).toBeInTheDocument()
  })

  it('calls onResourceClick with the clicked resource', async () => {
    const onResourceClick = vi.fn()
    render(<ArgoOverviewTab {...baseProps} onResourceClick={onResourceClick} />)
    expect(screen.getByText('Managed Resources')).toBeInTheDocument()
    await userEvent.click(screen.getByText('web-svc'))
    expect(onResourceClick).toHaveBeenCalledWith(resources[1])
  })

  it('limits to 8 resources and shows a "more" button that fires onShowMoreResources', async () => {
    const many: ArgoResource[] = Array.from({ length: 10 }, (_, i) => ({
      kind: 'ConfigMap',
      name: `cm-${i}`,
      namespace: 'prod',
      status: 'Synced',
    }))
    const onShowMoreResources = vi.fn()
    render(<ArgoOverviewTab {...baseProps} appResources={many} onShowMoreResources={onShowMoreResources} />)
    expect(screen.getByText('cm-7')).toBeInTheDocument()
    expect(screen.queryByText('cm-8')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('+2 more'))
    expect(onShowMoreResources).toHaveBeenCalledTimes(1)
  })
})
