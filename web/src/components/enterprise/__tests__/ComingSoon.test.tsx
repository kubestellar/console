import type { ButtonHTMLAttributes } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useLocation: () => ({ pathname: '/enterprise/risk-heat-map' }),
    useNavigate: () => mockNavigate,
  }
})
vi.mock('../../ui/Button', () => ({
  Button: ({ children, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}))

import ComingSoon from '../ComingSoon'
import { ROUTES } from '../../../config/routes'

describe('ComingSoon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the derived title and navigates back to the portal', async () => {
    const user = userEvent.setup()

    render(<ComingSoon />)

    expect(screen.getByText('Risk Heat Map')).toBeInTheDocument()
    expect(screen.getByText('Back to Enterprise Portal')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to Enterprise Portal' }))
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.ENTERPRISE)
  })
})
