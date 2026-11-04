import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ArgoResourcesTab } from './ArgoResourcesTab'
import type { ArgoResource } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const resources: ArgoResource[] = [
  { kind: 'Deployment', name: 'web', namespace: 'prod', status: 'Synced', health: 'Healthy' },
  { kind: 'Service', name: 'web-svc', namespace: 'prod', status: 'Synced' },
]

describe('ArgoResourcesTab', () => {
  it('shows spinner and no empty message while loading', () => {
    const { container } = render(
      <ArgoResourcesTab resourcesLoading={true} appResources={resources} onResourceClick={vi.fn()} />,
    )
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('web')).not.toBeInTheDocument()
  })

  it('renders resources and only shows health badge when health is set', () => {
    render(<ArgoResourcesTab resourcesLoading={false} appResources={resources} onResourceClick={vi.fn()} />)
    expect(screen.getByText('web')).toBeInTheDocument()
    expect(screen.getByText('(prod)')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('Service')).toBeInTheDocument()
    expect(screen.getAllByText(/^(Healthy|Degraded|Unknown)$/)).toHaveLength(1)
  })

  it('calls onResourceClick with the clicked resource', async () => {
    const onResourceClick = vi.fn()
    render(<ArgoResourcesTab resourcesLoading={false} appResources={resources} onResourceClick={onResourceClick} />)
    await userEvent.click(screen.getByText('web-svc'))
    expect(onResourceClick).toHaveBeenCalledWith(resources[1])
  })

  it('shows empty state when there are no resources', () => {
    render(<ArgoResourcesTab resourcesLoading={false} appResources={[]} onResourceClick={vi.fn()} />)
    expect(screen.getByText('drilldown.argoApp.noResourcesFound')).toBeInTheDocument()
  })
})
