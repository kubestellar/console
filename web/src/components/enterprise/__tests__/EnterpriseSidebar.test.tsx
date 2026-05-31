import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockOpenAddCardModal = vi.fn()

vi.mock('../../layout/SidebarShell', () => ({
  SidebarShell: ({ navSections, branding, onAddCard, onAddMore }: any) => (
    <div>
      <h1>{branding.title}</h1>
      <p>{branding.subtitle}</p>
      {navSections.flatMap((section: any) => section.items).map((item: any) => (
        <a key={item.id} href={item.href}>{item.label}</a>
      ))}
      <button onClick={onAddCard}>Add card</button>
      <button onClick={onAddMore}>Add more</button>
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
