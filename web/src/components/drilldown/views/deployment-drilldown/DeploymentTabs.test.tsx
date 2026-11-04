import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Box } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { DeploymentTabs } from './DeploymentTabs'

const tabs = [
  { id: 'overview' as const, label: 'Overview', icon: Box },
  { id: 'pods' as const, label: 'Pods', icon: Box },
]

describe('DeploymentTabs', () => {
  it('marks only the active tab as selected and focusable', () => {
    render(
      <DeploymentTabs tabs={tabs} activeTab="pods" onTabChange={vi.fn()} onTabKeyDown={vi.fn()} ariaLabel="Deployment tabs" />,
    )
    expect(screen.getByRole('tablist', { name: 'Deployment tabs' })).toBeInTheDocument()
    const logs = screen.getByRole('tab', { name: 'Pods' })
    const overview = screen.getByRole('tab', { name: 'Overview' })
    expect(logs).toHaveAttribute('aria-selected', 'true')
    expect(logs).toHaveAttribute('tabindex', '0')
    expect(overview).toHaveAttribute('aria-selected', 'false')
    expect(overview).toHaveAttribute('tabindex', '-1')
    expect(overview).toHaveAttribute('aria-controls', 'deployment-panel-overview')
  })

  it('calls onTabChange on click and onTabKeyDown on key press', async () => {
    const onTabChange = vi.fn()
    const onTabKeyDown = vi.fn()
    render(
      <DeploymentTabs tabs={tabs} activeTab="overview" onTabChange={onTabChange} onTabKeyDown={onTabKeyDown} ariaLabel="t" />,
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Pods' }))
    expect(onTabChange).toHaveBeenCalledWith('pods')
    screen.getByRole('tab', { name: 'Pods' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onTabKeyDown).toHaveBeenCalled()
  })
})
