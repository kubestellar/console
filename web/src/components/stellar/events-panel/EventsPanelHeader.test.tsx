import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EventsPanelHeader } from './EventsPanelHeader'

describe('EventsPanelHeader', () => {
  it('shows the unread count and clears notifications on request', () => {
    const onDismissAll = vi.fn()
    render(<EventsPanelHeader unreadCount={3} hasNotifications onDismissAll={onDismissAll} />)

    expect(screen.getByText('3 new')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'clear all' }))
    expect(onDismissAll).toHaveBeenCalledOnce()
  })

  it('hides the count and clear action when there are no notifications', () => {
    render(<EventsPanelHeader unreadCount={0} hasNotifications={false} onDismissAll={vi.fn()} />)

    expect(screen.queryByText(/new$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'clear all' })).not.toBeInTheDocument()
  })
})
