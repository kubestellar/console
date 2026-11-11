import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BuildpackHeader } from './BuildpackHeader'

vi.mock('../../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

const style = { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }

describe('BuildpackHeader', () => {
  it('renders namespace, short cluster name and uppercased status', () => {
    render(
      <BuildpackHeader cluster="ctx/my-cluster" namespace="kpack" status="succeeded" statusStyle={style} onDrillNamespace={vi.fn()} onDrillCluster={vi.fn()} />,
    )
    expect(screen.getByText('kpack')).toBeInTheDocument()
    expect(screen.getByTestId('cluster-badge')).toHaveTextContent('my-cluster')
    const badge = screen.getByText('SUCCEEDED')
    expect(badge).toHaveClass('bg-green-500/20', 'text-green-400', 'border-green-500/30')
  })

  it('falls back to the full cluster string when the last segment is empty', () => {
    render(
      <BuildpackHeader cluster="trailing/" namespace="ns" status="failed" statusStyle={style} onDrillNamespace={vi.fn()} onDrillCluster={vi.fn()} />,
    )
    expect(screen.getByTestId('cluster-badge')).toHaveTextContent('trailing/')
  })

  it('invokes drill callbacks on click', async () => {
    const onDrillNamespace = vi.fn()
    const onDrillCluster = vi.fn()
    render(
      <BuildpackHeader cluster="c1" namespace="ns" status="building" statusStyle={style} onDrillNamespace={onDrillNamespace} onDrillCluster={onDrillCluster} />,
    )
    await userEvent.click(screen.getByText('ns'))
    expect(onDrillNamespace).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByText('Cluster:'))
    expect(onDrillCluster).toHaveBeenCalledTimes(1)
  })
})
