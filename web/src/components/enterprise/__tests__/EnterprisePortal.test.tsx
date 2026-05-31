import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
const mockOpenAddCardModal = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})
vi.mock('../../shared/DashboardHeader', () => ({
  DashboardHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
}))
vi.mock('../../PageErrorBoundary', () => ({
  PageErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('../../ui/RotatingTip', () => ({ RotatingTip: () => <div data-testid="rotating-tip" /> }))
vi.mock('../../ui/Button', () => ({
  Button: ({ children, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}))
vi.mock('../../../hooks/useDashboardContext', () => ({
  useDashboardContextOptional: () => ({ openAddCardModal: mockOpenAddCardModal }),
}))

import EnterprisePortal from '../EnterprisePortal'

describe('EnterprisePortal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders enterprise sections, navigation buttons, and add more action', async () => {
    const user = userEvent.setup()

    render(<EnterprisePortal />)

    expect(screen.getByText('Enterprise Compliance Portal')).toBeInTheDocument()
    expect(screen.getByText('FinTech & Regulatory')).toBeInTheDocument()
    expect(screen.getByText('Healthcare & Life Sciences')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'HIPAA Compliance' }))
    expect(mockNavigate).toHaveBeenCalledWith('/enterprise/hipaa')

    await user.click(screen.getByRole('button', { name: /Add More/i }))
    expect(mockOpenAddCardModal).toHaveBeenCalledWith('dashboards')
  })
})
