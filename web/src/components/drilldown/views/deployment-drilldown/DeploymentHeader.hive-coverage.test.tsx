import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeploymentHeader, type DeploymentHeaderProps } from './DeploymentHeader'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

function props(overrides: Partial<DeploymentHeaderProps> = {}): DeploymentHeaderProps {
  return {
    cluster: 'provider/prod-east',
    namespace: 'payments',
    stackDepth: 2,
    agentConnected: true,
    isRefreshing: false,
    onBack: vi.fn(),
    onDrillToNamespace: vi.fn(),
    onDrillToCluster: vi.fn(),
    onRefreshAll: vi.fn(),
    onButtonLikeKeyDown: vi.fn((event, action, disabled) => {
      if (!disabled && (event.key === 'Enter' || event.key === ' ')) action()
    }),
    ...overrides,
  }
}

describe('DeploymentHeader', () => {
  it('navigates back and drills into namespace and cluster', async () => {
    const p = props()
    render(<DeploymentHeader {...p} />)
    expect(screen.getByText('prod-east')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'drilldown.goBack' }))
    await userEvent.click(screen.getByRole('button', { name: 'drilldown.fields.namespace: payments' }))
    await userEvent.click(screen.getByRole('button', { name: 'drilldown.fields.cluster: provider/prod-east' }))
    expect(p.onBack).toHaveBeenCalledOnce()
    expect(p.onDrillToNamespace).toHaveBeenCalledOnce()
    expect(p.onDrillToCluster).toHaveBeenCalledOnce()
  })

  it('hides back at the root and forwards keyboard activation to the navigation handler', async () => {
    const p = props({ stackDepth: 1 })
    render(<DeploymentHeader {...p} />)
    expect(screen.queryByRole('button', { name: 'drilldown.goBack' })).not.toBeInTheDocument()
    screen.getByRole('button', { name: 'drilldown.fields.namespace: payments' }).focus()
    await userEvent.keyboard('{Enter}')
    screen.getByRole('button', { name: 'drilldown.fields.cluster: provider/prod-east' }).focus()
    await userEvent.keyboard(' ')
    expect(p.onDrillToNamespace).toHaveBeenCalledOnce()
    expect(p.onDrillToCluster).toHaveBeenCalledOnce()
    expect(p.onButtonLikeKeyDown).toHaveBeenCalledTimes(2)
  })

  it('refreshes by click and keyboard only when connected and not refreshing', async () => {
    const p = props()
    const { rerender } = render(<DeploymentHeader {...p} />)
    const refresh = screen.getByRole('button', { name: 'drilldown.deployment.refreshAll' })
    expect(refresh).toHaveAttribute('aria-disabled', 'false')
    expect(refresh).toHaveAttribute('tabindex', '0')
    await userEvent.click(refresh)
    refresh.focus()
    await userEvent.keyboard('{Enter}')
    expect(p.onRefreshAll).toHaveBeenCalledTimes(2)

    for (const state of [{ agentConnected: false, isRefreshing: false }, { agentConnected: true, isRefreshing: true }]) {
      rerender(<DeploymentHeader {...p} {...state} />)
      expect(refresh).toHaveAttribute('aria-disabled', 'true')
      expect(refresh).toHaveAttribute('tabindex', '-1')
      await userEvent.click(refresh)
      refresh.focus()
      await userEvent.keyboard('{Enter}')
    }
    expect(p.onRefreshAll).toHaveBeenCalledTimes(2)
  })
})
