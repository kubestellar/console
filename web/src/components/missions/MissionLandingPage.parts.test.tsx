import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardMockup, SectionBadge } from './MissionLandingPage.parts'

describe('DashboardMockup', () => {
  it('renders without crashing', () => {
    const { container } = render(<DashboardMockup />)
    expect(container.firstChild).toBeInTheDocument()
  })
})

describe('SectionBadge', () => {
  it('renders the provided label', () => {
    render(<SectionBadge present={true} label="Steps" />)
    expect(screen.getByText('Steps')).toBeInTheDocument()
  })

  it('applies present styling when present is true', () => {
    render(<SectionBadge present={true} label="Steps" />)
    expect(screen.getByText('Steps').closest('span')).toHaveClass('text-green-400/70')
  })

  it('applies absent styling when present is false', () => {
    render(<SectionBadge present={false} label="Tags" />)
    expect(screen.getByText('Tags').closest('span')).toHaveClass('text-foreground/15')
  })
})
