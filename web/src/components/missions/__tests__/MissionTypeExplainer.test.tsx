import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MissionTypeExplainer } from '../MissionTypeExplainer'

// Mock isDemoMode to control visibility
const mockIsDemoMode = vi.fn()
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

describe('MissionTypeExplainer', () => {
  beforeEach(() => {
    mockIsDemoMode.mockReset()
  })

  it('returns null when not in demo mode', () => {
    mockIsDemoMode.mockReturnValue(false)
    const { container } = render(<MissionTypeExplainer />)
    expect(container.innerHTML).toBe('')
  })

  it('renders in demo mode with expanded content', () => {
    mockIsDemoMode.mockReturnValue(true)
    render(<MissionTypeExplainer />)
    expect(screen.getByText('How AI Missions work')).toBeTruthy()
    expect(screen.getByText('Install')).toBeTruthy()
    expect(screen.getByText('Fix')).toBeTruthy()
    expect(screen.getByText('Mission Control')).toBeTruthy()
    expect(screen.getByText('Orbit')).toBeTruthy()
  })

  it('shows descriptions for each mission type when expanded', () => {
    mockIsDemoMode.mockReturnValue(true)
    render(<MissionTypeExplainer />)
    expect(screen.getByText(/Deploy CNCF projects/)).toBeTruthy()
    expect(screen.getByText(/AI diagnoses issues/)).toBeTruthy()
    expect(screen.getByText(/Orchestrate multi-project/)).toBeTruthy()
    expect(screen.getByText(/Recurring maintenance/)).toBeTruthy()
  })

  it('collapses content when toggle button is clicked', () => {
    mockIsDemoMode.mockReturnValue(true)
    render(<MissionTypeExplainer />)
    const button = screen.getByText('How AI Missions work').closest('button')!
    fireEvent.click(button)
    // After collapsing, descriptions should not be visible
    expect(screen.queryByText(/Deploy CNCF projects/)).toBeNull()
    expect(screen.queryByText(/AI diagnoses issues/)).toBeNull()
  })

  it('re-expands when toggle button is clicked again', () => {
    mockIsDemoMode.mockReturnValue(true)
    render(<MissionTypeExplainer />)
    const button = screen.getByText('How AI Missions work').closest('button')!
    fireEvent.click(button) // collapse
    fireEvent.click(button) // expand
    expect(screen.getByText(/Deploy CNCF projects/)).toBeTruthy()
  })

  it('shows summary paragraph about Mission Control', () => {
    mockIsDemoMode.mockReturnValue(true)
    render(<MissionTypeExplainer />)
    expect(screen.getByText(/Mission Control combines all types/)).toBeTruthy()
  })
})
