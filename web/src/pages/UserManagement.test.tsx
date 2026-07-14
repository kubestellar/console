import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/cards/UserManagement', () => ({
  UserManagement: () => <div data-testid="user-management-card">UserManagement Card</div>,
}))

import { UserManagementPage } from './UserManagement'

describe('UserManagementPage', () => {
  it('renders the UserManagement card', () => {
    render(<UserManagementPage />)
    expect(screen.getByTestId('user-management-card')).toBeInTheDocument()
  })

  it('wraps the card in a full-height container', () => {
    const { container } = render(<UserManagementPage />)
    expect(container.querySelector('.min-h-full.p-6')).toBeInTheDocument()
  })

  it('wraps the card in the styled border container', () => {
    const { container } = render(<UserManagementPage />)
    expect(container.querySelector('.rounded-xl.border')).toBeInTheDocument()
  })
})
