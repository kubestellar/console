import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../../../ui/LogoWithStar', () => ({
  LogoWithStar: ({ className }: { className?: string }) => <div data-testid="logo-with-star" className={className} />,
}))

import { MissionSidebarMinimized } from '../MissionSidebarMinimized'

describe('MissionSidebarMinimized', () => {
  it('expands the sidebar when the toggle button is clicked', () => {
    const onExpand = vi.fn()

    render(
      <MissionSidebarMinimized
        onExpand={onExpand}
        activeMissionsCount={2}
        runningCount={1}
        needsAttention={3}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'missionSidebar.expandSidebar' }))

    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('shows active mission and attention counts when they are present', () => {
    render(
      <MissionSidebarMinimized
        onExpand={vi.fn()}
        activeMissionsCount={2}
        runningCount={1}
        needsAttention={3}
      />
    )

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByTestId('logo-with-star')).toBeInTheDocument()
  })

  it('omits counters when there are no active or attention-requiring missions', () => {
    render(
      <MissionSidebarMinimized
        onExpand={vi.fn()}
        activeMissionsCount={0}
        runningCount={0}
        needsAttention={0}
      />
    )

    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
