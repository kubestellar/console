import React from 'react'
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

let mockTaglines: string[] = []

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'navbar.taglines') {
        return mockTaglines
      }
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

import { RotatingTagline } from '../RotatingTagline'

describe('RotatingTagline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    mockTaglines = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders nothing when no tagline sources are available', () => {
    const { container } = render(<RotatingTagline />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the localized tagline list and includes the AI tagline as a rotation candidate', () => {
    mockTaglines = ['First tagline', 'Second tagline']

    render(<RotatingTagline aiTagline="AI tagline" />)

    expect(screen.getByText('First tagline')).toBeInTheDocument()
  })

  it('rotates to the next tagline after the interval and transition delay', () => {
    mockTaglines = ['First tagline', 'Second tagline']

    render(<RotatingTagline aiTagline="AI tagline" />)

    act(() => {
      vi.advanceTimersByTime(30_000)
      vi.advanceTimersByTime(600)
    })

    expect(screen.getByText('Second tagline')).toBeInTheDocument()
  })
})
