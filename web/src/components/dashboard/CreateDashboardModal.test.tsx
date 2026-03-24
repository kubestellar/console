import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreateDashboardModal } from './CreateDashboardModal'
import { useDashboardHealth } from '../../hooks/useDashboardHealth'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

vi.mock('../../lib/modals', () => ({
  BaseModal: Object.assign(
    ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? <div data-testid="modal">{children}</div> : null,
    {
      Header: ({ title }: { title: string }) => <div>{title}</div>,
      Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }
  ),
}))

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('./templates', () => ({
  DASHBOARD_TEMPLATES: [],
  TEMPLATE_CATEGORIES: [],
}))

vi.mock('../../lib/constants/network', () => ({
  FOCUS_DELAY_MS: 0,
}))

const mockHealthHealthy = {
  status: 'healthy' as const,
  message: 'All systems healthy',
  details: [],
  criticalCount: 0,
  warningCount: 0,
  navigateTo: undefined,
}

const mockHealthWarning = {
  status: 'warning' as const,
  message: '2 warnings',
  details: ['1 cluster degraded'],
  criticalCount: 0,
  warningCount: 2,
  navigateTo: '/alerts',
}

vi.mock('../../hooks/useDashboardHealth', () => ({
  useDashboardHealth: vi.fn(() => mockHealthHealthy),
}))

describe('CreateDashboardModal Component', () => {
  it('exports CreateDashboardModal component', () => {
    expect(CreateDashboardModal).toBeDefined()
    expect(typeof CreateDashboardModal).toBe('function')
  })

  it('health hook is available for dashboard modal', () => {
    expect(useDashboardHealth).toBeDefined()
    expect(typeof useDashboardHealth).toBe('function')
  })

  it('hides health alert when system is healthy', () => {
    vi.mocked(useDashboardHealth).mockReturnValue(mockHealthHealthy)
    render(<CreateDashboardModal isOpen={true} onClose={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows health alert banner when system has warnings', () => {
    vi.mocked(useDashboardHealth).mockReturnValue(mockHealthWarning)
    render(<CreateDashboardModal isOpen={true} onClose={vi.fn()} onCreate={vi.fn()} />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveAttribute('aria-label', 'System health: 2 warnings')
  })
})
