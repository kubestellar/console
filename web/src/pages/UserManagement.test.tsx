import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../components/cards/UserManagement', () => ({
  UserManagement: () => <div data-testid="user-management-card" />,
}))

import { UserManagementPage } from './UserManagement'

describe('UserManagementPage', () => {
  it('renders the UserManagement card inside a bordered container', () => {
    const { container } = render(<UserManagementPage />)

    expect(screen.getByTestId('user-management-card')).toBeInTheDocument()

    const outer = container.firstChild as HTMLElement
    expect(outer).toHaveClass('min-h-full', 'p-6')

    const inner = outer.firstChild as HTMLElement
    expect(inner).toHaveClass('rounded-xl', 'border', 'bg-card/50')
  })
})
