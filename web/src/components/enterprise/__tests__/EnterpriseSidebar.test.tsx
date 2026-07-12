import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockOpenAddCardModal = vi.fn()

interface MockSidebarShellProps {
  navSections: Array<{ items: Array<{ id: string; href: string; label: string }> }>
  branding: { title: string; subtitle: string }
  onAddCard: () => void
  onAddMore: () => void
}

vi.mock('../../layout/SidebarShell', () => ({
  SidebarShell: ({ navSections, branding, onAddCard, onAddMore }: MockSidebarShellProps) => (
    <div>
      <h1>{branding.title}</h1>
      <div>{branding.subtitle}</div>
      {navSections.flatMap((section) => section.items).map((item) => (
        <a key={item.id} href={item.href}>{item.label}</a>
      ))}
      <div role="button" tabIndex={0} onClick={onAddCard}>Add card</div>
      <div role="button" tabIndex={0} onClick={onAddMore}>Add more</div>
    </div>
  ),
}))
vi.mock('../../../hooks/useDashboardContext', () => ({
  useDashboardContextOptional: () => ({ openAddCardModal: mockOpenAddCardModal }),
}))
vi.mock('../../../hooks/useSidebarConfig', () => ({
  SIDEBAR_DEFAULT_WIDTH_PX: 280,
}))

import EnterpriseSidebar from '../EnterpriseSidebar'

describe('EnterpriseSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders enterprise branding, navigation, and studio actions', async () => {
    const user = userEvent.setup()

    render(<EnterpriseSidebar />)

    expect(screen.getByText('Enterprise')).toBeInTheDocument()
    expect(screen.getByText('Compliance Portal')).toBeInTheDocument()
    expect(screen.getByText('Enterprise Home')).toBeInTheDocument()
    expect(screen.getByText('HIPAA Compliance')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add card' }))
    expect(mockOpenAddCardModal).toHaveBeenCalledWith()

    await user.click(screen.getByRole('button', { name: 'Add more' }))
    expect(mockOpenAddCardModal).toHaveBeenCalledWith('dashboards')
  })
})
