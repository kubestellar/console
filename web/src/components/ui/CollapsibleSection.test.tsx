import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CollapsibleSection } from './CollapsibleSection'

describe('CollapsibleSection', () => {
  it('renders the title and children when open by default', () => {
    render(
      <CollapsibleSection title="Test Section">
        <div data-testid="child-content">Content</div>
      </CollapsibleSection>
    )
    
    expect(screen.getByText('Test Section')).toBeInTheDocument()
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('hides children when defaultOpen is false', () => {
    render(
      <CollapsibleSection title="Test Section" defaultOpen={false}>
        <div data-testid="child-content">Content</div>
      </CollapsibleSection>
    )
    
    expect(screen.getByText('Test Section')).toBeInTheDocument()
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
  })

  it('toggles children visibility when button is clicked', () => {
    render(
      <CollapsibleSection title="Test Section" defaultOpen={false}>
        <div data-testid="child-content">Content</div>
      </CollapsibleSection>
    )
    
    // Initially closed
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
    
    // Click to open
    fireEvent.click(screen.getByRole('button', { name: /Test Section/i }))
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
    
    // Click to close
    fireEvent.click(screen.getByRole('button', { name: /Test Section/i }))
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
  })

  it('renders a badge when provided', () => {
    render(
      <CollapsibleSection title="Test Section" badge={<span data-testid="badge-element">New!</span>}>
        <div data-testid="child-content">Content</div>
      </CollapsibleSection>
    )
    
    expect(screen.getByTestId('badge-element')).toBeInTheDocument()
    expect(screen.getByText('New!')).toBeInTheDocument()
  })
})
