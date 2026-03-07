import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdopterNudge } from './AdopterNudge'

// Mock dependencies
vi.mock('../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: true }),
}))

vi.mock('../../lib/demoMode', () => ({
  isNetlifyDeployment: false,
}))

vi.mock('../../lib/analytics', () => ({
  emitAdopterNudgeShown: vi.fn(),
  emitAdopterNudgeActioned: vi.fn(),
  emitConversionStep: vi.fn(),
}))

const NUDGE_DELAY_DAYS = 3
const MS_PER_DAY = 86_400_000

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn((key: string) => {
    if (key === 'kc-adopter-nudge-dismissed') return null
    if (key === 'kc-hints-suppressed') return null
    // Simulate first agent connection well in the past
    if (key === 'kc-first-agent-connect') {
      return String(Date.now() - (NUDGE_DELAY_DAYS + 1) * MS_PER_DAY)
    }
    return null
  }),
  safeSetItem: vi.fn(),
}))

describe('AdopterNudge Component', () => {
  it('renders the nudge when conditions are met', () => {
    render(<AdopterNudge />)
    expect(screen.getByText('Enjoying KubeStellar Console?')).toBeInTheDocument()
  })

  it('shows the add organization button', () => {
    render(<AdopterNudge />)
    expect(screen.getByText('Add your organization')).toBeInTheDocument()
  })

  it('has a dismiss button with accessible label', () => {
    render(<AdopterNudge />)
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument()
  })

  it('hides when dismiss button is clicked', () => {
    render(<AdopterNudge />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText('Enjoying KubeStellar Console?')).not.toBeInTheDocument()
  })

  it('opens adopters URL when add org is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<AdopterNudge />)
    fireEvent.click(screen.getByText('Add your organization'))
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('ADOPTERS.MD'),
      '_blank',
      expect.any(String),
    )
    openSpy.mockRestore()
  })
})
