import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { HelmHeader } from './HelmHeader'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

const statusStyle = { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }

function renderHeader(cluster = 'ctx/prod-cluster') {
  const drillToNamespace = vi.fn()
  const drillToCluster = vi.fn()
  render(
    <HelmHeader
      cluster={cluster}
      namespace="monitoring"
      releaseStatus="deployed"
      statusStyle={statusStyle}
      drillToNamespace={drillToNamespace}
      drillToCluster={drillToCluster}
    />,
  )
  return { drillToNamespace, drillToCluster }
}

describe('HelmHeader', () => {
  it('renders namespace and uppercased status with style classes', () => {
    renderHeader()
    expect(screen.getByText('monitoring')).toBeInTheDocument()
    const badge = screen.getByText('DEPLOYED')
    expect(badge).toHaveClass('bg-green-500/20', 'text-green-400', 'border-green-500/30')
  })

  it('shows only the last segment of the cluster path', () => {
    renderHeader()
    expect(screen.getByTestId('cluster-badge')).toHaveTextContent('prod-cluster')
  })

  it('drills to namespace on click', async () => {
    const { drillToNamespace, drillToCluster } = renderHeader()
    await userEvent.click(screen.getByText('monitoring'))
    expect(drillToNamespace).toHaveBeenCalledWith('ctx/prod-cluster', 'monitoring')
    expect(drillToCluster).not.toHaveBeenCalled()
  })

  it('drills to cluster on click', async () => {
    const { drillToNamespace, drillToCluster } = renderHeader()
    await userEvent.click(screen.getByTestId('cluster-badge'))
    expect(drillToCluster).toHaveBeenCalledWith('ctx/prod-cluster')
    expect(drillToNamespace).not.toHaveBeenCalled()
  })
})
