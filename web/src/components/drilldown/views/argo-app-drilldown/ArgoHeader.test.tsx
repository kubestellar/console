import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Check } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { ArgoHeader } from './ArgoHeader'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

const style = { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }

function setup() {
  const drillToNamespace = vi.fn()
  const drillToCluster = vi.fn()
  render(
    <ArgoHeader
      cluster="ctx/prod-cluster"
      namespace="argocd"
      syncStatus="Synced"
      healthStatus="Healthy"
      syncStyle={{ ...style, icon: Check }}
      healthStyle={style}
      drillToNamespace={drillToNamespace}
      drillToCluster={drillToCluster}
    />,
  )
  return { drillToNamespace, drillToCluster }
}

describe('ArgoHeader', () => {
  it('renders namespace, short cluster name and statuses', () => {
    setup()
    expect(screen.getByText('argocd')).toBeInTheDocument()
    expect(screen.getByTestId('cluster-badge')).toHaveTextContent('prod-cluster')
    expect(screen.getByText('Synced')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })

  it('drills to namespace and cluster on click', async () => {
    const { drillToNamespace, drillToCluster } = setup()
    await userEvent.click(screen.getByText('argocd'))
    expect(drillToNamespace).toHaveBeenCalledWith('ctx/prod-cluster', 'argocd')
    await userEvent.click(screen.getByTestId('cluster-badge'))
    expect(drillToCluster).toHaveBeenCalledWith('ctx/prod-cluster')
  })
})
