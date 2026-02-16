import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton } from './Skeleton'

describe('Skeleton Component', () => {
  it('renders with default props', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild).toBeTruthy()
  })

  it('applies text variant by default', () => {
    const { container } = render(<Skeleton />)
    const skeleton = container.firstChild as HTMLElement
    expect(skeleton.className).toContain('rounded')
  })

  it('applies circular variant', () => {
    const { container } = render(<Skeleton variant="circular" />)
    const skeleton = container.firstChild as HTMLElement
    expect(skeleton.className).toContain('rounded-full')
  })

  it('applies rectangular variant', () => {
    const { container } = render(<Skeleton variant="rectangular" />)
    const skeleton = container.firstChild as HTMLElement
    expect(skeleton.className).toContain('rounded-none')
  })

  it('applies rounded variant', () => {
    const { container } = render(<Skeleton variant="rounded" />)
    const skeleton = container.firstChild as HTMLElement
    expect(skeleton.className).toContain('rounded-lg')
  })

  it('shows refresh icon when showRefresh is true', () => {
    const { container } = render(<Skeleton showRefresh />)
    const refreshIcon = container.querySelector('svg')
    expect(refreshIcon).toBeTruthy()
  })

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="custom-class" />)
    const skeleton = container.firstChild as HTMLElement
    expect(skeleton.className).toContain('custom-class')
  })

  it('applies custom width and height', () => {
    const { container } = render(<Skeleton width={100} height={50} />)
    const skeleton = container.firstChild as HTMLElement
    expect(skeleton.style.width).toBe('100px')
    expect(skeleton.style.height).toBe('50px')
  })
})
