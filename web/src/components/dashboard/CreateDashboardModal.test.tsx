import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  Button: ({
    children,
    onClick,
    disabled,
    loading,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
  }) => (
    <button onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
}))

vi.mock('./templates', () => ({
  DASHBOARD_TEMPLATES: [],
  TEMPLATE_CATEGORIES: [],
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FOCUS_DELAY_MS: 0,
} })

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

  it('disables Create button while async onCreate is in progress', async () => {
    let resolveCreate!: () => void
    const asyncOnCreate = vi.fn(
      () => new Promise<void>((resolve) => { resolveCreate = resolve })
    )
    const onClose = vi.fn()
    vi.mocked(useDashboardHealth).mockReturnValue(mockHealthHealthy)
    render(<CreateDashboardModal isOpen={true} onClose={onClose} onCreate={asyncOnCreate} />)

    // Capture button by initial text before click
    const createBtn = screen.getByRole('button', { name: /title/i })
    fireEvent.click(createBtn)

    // Button should be disabled while async op is in progress
    await waitFor(() => {
      expect(createBtn).toBeDisabled()
    })

    resolveCreate()

    // After completion, onClose should have been called
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('disables Cancel button while async onCreate is in progress', async () => {
    let resolveCreate!: () => void
    const asyncOnCreate = vi.fn(
      () => new Promise<void>((resolve) => { resolveCreate = resolve })
    )
    const onClose = vi.fn()
    vi.mocked(useDashboardHealth).mockReturnValue(mockHealthHealthy)
    render(<CreateDashboardModal isOpen={true} onClose={onClose} onCreate={asyncOnCreate} />)

    const createBtn = screen.getByRole('button', { name: /title/i })
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(createBtn)

    // Cancel button should be disabled while async op is in progress
    await waitFor(() => {
      expect(cancelBtn).toBeDisabled()
    })

    resolveCreate()

    // After completion, onClose should have been called
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('prevents double-submission when Create is clicked rapidly', async () => {
    let resolveCreate!: () => void
    const asyncOnCreate = vi.fn(
      () => new Promise<void>((resolve) => { resolveCreate = resolve })
    )
    vi.mocked(useDashboardHealth).mockReturnValue(mockHealthHealthy)
    render(<CreateDashboardModal isOpen={true} onClose={vi.fn()} onCreate={asyncOnCreate} />)

    const createBtn = screen.getByRole('button', { name: /title/i })
    fireEvent.click(createBtn)
    fireEvent.click(createBtn)
    fireEvent.click(createBtn)

    // Despite multiple clicks, onCreate should only be called once
    await waitFor(() => {
      expect(asyncOnCreate).toHaveBeenCalledTimes(1)
    })

    resolveCreate()

    await waitFor(() => {
      expect(createBtn).not.toBeDisabled()
    })
  })
})
