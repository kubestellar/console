import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LimitedAccessWarning } from './LimitedAccessWarning'

describe('LimitedAccessWarning Component', () => {
  it('renders nothing when no conditions are met', () => {
    const { container } = render(<LimitedAccessWarning />)
    expect(container.firstChild).toBe(null)
  })

  it('displays warning icon when hasError is true', () => {
    const { container } = render(<LimitedAccessWarning hasError />)
    const icon = container.querySelector('svg')
    expect(icon).toBeTruthy()
  })

  it('shows demo data message when hasError is true', () => {
    const { getByText } = render(<LimitedAccessWarning hasError />)
    expect(getByText('Using demo data')).toBeTruthy()
  })

  it('shows custom message when provided', () => {
    const { getByText } = render(<LimitedAccessWarning message="Custom warning" />)
    expect(getByText('Custom warning')).toBeTruthy()
  })

  it('shows unreachable cluster count', () => {
    const { getByText } = render(
      <LimitedAccessWarning unreachableCount={2} totalCount={5} />
    )
    expect(getByText('2 of 5 clusters offline')).toBeTruthy()
  })
})
