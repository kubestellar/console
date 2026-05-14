import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExternalLink } from '../ExternalLink'

describe('ExternalLink', () => {
  it('renders with proper security attributes', () => {
    render(
      <ExternalLink href="https://example.com">
        Click here
      </ExternalLink>
    )
    
    const link = screen.getByText('Click here')
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders with icon when showIcon is true', () => {
    const { container } = render(
      <ExternalLink href="https://example.com" showIcon>
        Click here
      </ExternalLink>
    )
    
    // Check for the ExternalLinkIcon (lucide-react renders as svg)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(
      <ExternalLink href="https://example.com" className="custom-class">
        Click here
      </ExternalLink>
    )
    
    const link = screen.getByText('Click here')
    expect(link).toHaveClass('custom-class')
  })

  it('forwards other anchor attributes', () => {
    render(
      <ExternalLink 
        href="https://example.com" 
        title="External link"
        aria-label="Navigate to example"
      >
        Click here
      </ExternalLink>
    )
    
    const link = screen.getByText('Click here')
    expect(link).toHaveAttribute('title', 'External link')
    expect(link).toHaveAttribute('aria-label', 'Navigate to example')
  })
})
