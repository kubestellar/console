/**
 * Tests for SectionLayout component.
 *
 * Covers:
 * - Renders children
 * - Shows description when provided
 * - Hides description when not provided
 * - Shows footer when provided
 * - Hides footer when not provided
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionLayout } from '../SectionLayout'

describe('SectionLayout', () => {
  it('renders children', () => {
    render(
      <SectionLayout>
        <div data-testid="child">Hello World</div>
      </SectionLayout>
    )
    expect(screen.getByTestId('child')).toBeTruthy()
    expect(screen.getByText('Hello World')).toBeTruthy()
  })

  it('renders description when provided', () => {
    render(
      <SectionLayout description="Browse and add cards to your dashboard.">
        <div>Content</div>
      </SectionLayout>
    )
    expect(screen.getByText('Browse and add cards to your dashboard.')).toBeTruthy()
  })

  it('does not render description when not provided', () => {
    const { container } = render(
      <SectionLayout>
        <div>Content</div>
      </SectionLayout>
    )
    // The description paragraph should not exist
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs.length).toBe(0)
  })

  it('renders footer when provided', () => {
    render(
      <SectionLayout footer={<button>Add 3 cards</button>}>
        <div>Content</div>
      </SectionLayout>
    )
    expect(screen.getByText('Add 3 cards')).toBeTruthy()
  })

  it('does not render footer border when footer is not provided', () => {
    const { container } = render(
      <SectionLayout>
        <div>Content</div>
      </SectionLayout>
    )
    // The border-t footer wrapper should not exist
    const footerDiv = container.querySelector('.border-t.border-border')
    expect(footerDiv).toBeNull()
  })

  it('renders both description and footer together', () => {
    render(
      <SectionLayout
        description="Section description text"
        footer={<span>Footer content</span>}
      >
        <div>Main content</div>
      </SectionLayout>
    )
    expect(screen.getByText('Section description text')).toBeTruthy()
    expect(screen.getByText('Main content')).toBeTruthy()
    expect(screen.getByText('Footer content')).toBeTruthy()
  })

  it('wraps children in a scrollable container', () => {
    const { container } = render(
      <SectionLayout>
        <div>Scrollable content</div>
      </SectionLayout>
    )
    const scrollable = container.querySelector('.overflow-y-auto')
    expect(scrollable).toBeTruthy()
  })
})
