import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeploymentHeader } from './DeploymentHeader'
import type { DeploymentHeaderProps } from './DeploymentHeader'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

function setup(overrides: Partial<DeploymentHeaderProps> = {}) {
  const props: DeploymentHeaderProps = {
    cluster: 'ctx/prod',
    namespace: 'web',
    stackDepth: 1,
    agentConnected: true,
    isRefreshing: false,
    onBack: vi.fn(),
    onDrillToNamespace: vi.fn(),
    onDrillToCluster: vi.fn(),
    onRefreshAll: vi.fn(),
    onButtonLikeKeyDown: vi.fn(),
    ...overrides,
  }
  render(<DeploymentHeader {...props} />)
  return props
}

describe('DeploymentHeader', () => {
  it('renders namespace and short cluster name, without back button at depth 1', () => {
    setup()
    expect(screen.getByText('web')).toBeInTheDocument()
    expect(screen.getByTestId('cluster-badge')).toHaveTextContent('prod')
    expect(screen.queryByRole('button', { name: 'drilldown.goBack' })).not.toBeInTheDocument()
  })

  it('shows back button when stack is deeper and calls onBack', async () => {
    const props = setup({ stackDepth: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'drilldown.goBack' }))
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('invokes drill callbacks on click and forwards key events', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'drilldown.fields.namespace: web' }))
    expect(props.onDrillToNamespace).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'drilldown.fields.cluster: ctx/prod' }))
    expect(props.onDrillToCluster).toHaveBeenCalledTimes(1)
    screen.getByRole('button', { name: 'drilldown.fields.namespace: web' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(props.onButtonLikeKeyDown).toHaveBeenCalledWith(expect.anything(), props.onDrillToNamespace)
  })

  it('refreshes when agent is connected and idle', async () => {
    const props = setup()
    const refresh = screen.getByRole('button', { name: 'drilldown.deployment.refreshAll' })
    expect(refresh).toHaveAttribute('aria-disabled', 'false')
    await userEvent.click(refresh)
    expect(props.onRefreshAll).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['agent disconnected', { agentConnected: false }],
    ['refreshing', { isRefreshing: true }],
  ])('disables refresh when %s', async (_label, overrides) => {
    const props = setup(overrides)
    const refresh = screen.getByRole('button', { name: 'drilldown.deployment.refreshAll' })
    expect(refresh).toHaveAttribute('aria-disabled', 'true')
    expect(refresh).toHaveAttribute('tabindex', '-1')
    await userEvent.click(refresh)
    expect(props.onRefreshAll).not.toHaveBeenCalled()
  })
})
