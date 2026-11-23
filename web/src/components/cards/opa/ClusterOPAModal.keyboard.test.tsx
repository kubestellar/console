import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClusterOPAModal } from './ClusterOPAModal'

vi.mock('../../ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

describe('OPA create policy menu keyboard navigation', () => {
  it('navigates, wraps, and closes without closing the modal', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ClusterOPAModal isOpen onClose={onClose} clusterName="test" policies={[]} violations={[]} onRefresh={vi.fn()} startMission={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Create Policy' })
    trigger.focus()
    await user.keyboard('{ArrowUp}')
    const items = screen.getAllByRole('menuitem')
    expect(items[2]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(items[2]).toHaveFocus()
    await user.keyboard('{Home}{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('activates an item with Space', async () => {
    const user = userEvent.setup()
    const startMission = vi.fn()
    const onClose = vi.fn()
    render(<ClusterOPAModal isOpen onClose={onClose} clusterName="test" policies={[]} violations={[]} onRefresh={vi.fn()} startMission={startMission} />)
    const trigger = screen.getByRole('button', { name: 'Create Policy' })
    trigger.focus()
    await user.keyboard('{ArrowDown} ')
    expect(startMission).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
