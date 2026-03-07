import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MissionCTA } from './MissionCTA'

const mockOpenSidebar = vi.fn()

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({
    missions: [],
    openSidebar: mockOpenSidebar,
  }),
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
}))

describe('MissionCTA Component', () => {
  beforeEach(() => {
    localStorage.clear()
    mockOpenSidebar.mockClear()
  })

  it('renders the CTA when user has no missions', () => {
    render(<MissionCTA />)
    expect(screen.getByText('Try AI Missions')).toBeInTheDocument()
  })

  it('shows the Explore button', () => {
    render(<MissionCTA />)
    expect(screen.getByText('Explore')).toBeInTheDocument()
  })

  it('shows description text', () => {
    render(<MissionCTA />)
    expect(
      screen.getByText(/Guided workflows for scaling, security hardening/),
    ).toBeInTheDocument()
  })

  it('calls openSidebar when Explore is clicked', () => {
    render(<MissionCTA />)
    fireEvent.click(screen.getByText('Explore'))
    expect(mockOpenSidebar).toHaveBeenCalledOnce()
  })

  it('has a dismiss button with accessible label', () => {
    render(<MissionCTA />)
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument()
  })

  it('hides when dismiss button is clicked', () => {
    render(<MissionCTA />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText('Try AI Missions')).not.toBeInTheDocument()
  })
})
