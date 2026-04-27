import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../useStablePageHeight', () => ({
  useStablePageHeight: (_pageSize: number, _totalItems: number) => ({
    containerRef: { current: null },
    containerStyle: { minHeight: '200px' },
  }),
}))

import { StablePaginatedContent } from '../StablePaginatedContent'

describe('StablePaginatedContent', () => {
  it('renders children', () => {
    render(
      <StablePaginatedContent pageSize={10} totalItems={25}>
        <span data-testid="child">Hello</span>
      </StablePaginatedContent>
    )
    expect(screen.getByTestId('child')).toBeDefined()
    expect(screen.getByText('Hello')).toBeDefined()
  })

  it('applies className to wrapper div', () => {
    const { container } = render(
      <StablePaginatedContent pageSize={5} totalItems={20} className="my-class">
        <p>Content</p>
      </StablePaginatedContent>
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('my-class')
  })

  it('applies stable height style from hook', () => {
    const { container } = render(
      <StablePaginatedContent pageSize={5} totalItems={10}>
        <p>Content</p>
      </StablePaginatedContent>
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.minHeight).toBe('200px')
  })

  it('renders without className prop', () => {
    const { container } = render(
      <StablePaginatedContent pageSize={5} totalItems={10}>
        <p>Content</p>
      </StablePaginatedContent>
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.tagName).toBe('DIV')
  })
})
