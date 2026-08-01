import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../hooks/useMarketplace', () => ({
  useAuthorProfile: () => ({
    loading: false,
    coins: 100,
    consolePRs: 5,
    marketplacePRs: 2,
  }),
}))

import { AuthorBadge } from './AuthorBadge'

describe('AuthorBadge Component', () => {
  it('exports AuthorBadge component', () => {
    expect(AuthorBadge).toBeDefined()
    expect(typeof AuthorBadge).toBe('function')
  })

  it('renders with author name only', () => {
    expect(() => {
      render(<AuthorBadge author="john" />)
    }).not.toThrow()
  })

  it('renders with github handle', () => {
    expect(() => {
      render(<AuthorBadge author="John Doe" github="johndoe" />)
    }).not.toThrow()
  })

  it('renders in compact mode', () => {
    expect(() => {
      render(<AuthorBadge author="Jane" github="jane" compact={true} />)
    }).not.toThrow()
  })
})
