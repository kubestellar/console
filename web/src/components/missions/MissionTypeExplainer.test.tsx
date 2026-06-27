import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MissionTypeExplainer } from './MissionTypeExplainer'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: vi.fn(() => true),
}))

describe('MissionTypeExplainer', () => {
  it('renders the title', () => {
    render(<MissionTypeExplainer />)
    expect(screen.getByText('How AI Missions work')).toBeInTheDocument()
  })

  it('renders all mission types', () => {
    render(<MissionTypeExplainer />)
    expect(screen.getByText('Install')).toBeInTheDocument()
    expect(screen.getByText('Fix')).toBeInTheDocument()
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
    expect(screen.getByText('Orbit')).toBeInTheDocument()
  })

  it('renders mission type descriptions', () => {
    render(<MissionTypeExplainer />)
    expect(screen.getByText(/Deploy CNCF projects/)).toBeInTheDocument()
    expect(screen.getByText(/AI diagnoses issues/)).toBeInTheDocument()
    expect(screen.getByText(/Orchestrate multi-project/)).toBeInTheDocument()
    expect(screen.getByText(/Recurring maintenance/)).toBeInTheDocument()
  })

  it('renders summary text', () => {
    render(<MissionTypeExplainer />)
    expect(screen.getByText(/Mission Control combines all types/)).toBeInTheDocument()
  })

  it('does not render in non-demo mode', () => {
    const { isDemoMode } = require('../../lib/demoMode')
    isDemoMode.mockReturnValue(false)
    const { container } = render(<MissionTypeExplainer />)
    expect(container.firstChild).toBeNull()
  })
})
