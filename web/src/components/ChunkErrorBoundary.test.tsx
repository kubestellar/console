import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChunkErrorBoundary } from './ChunkErrorBoundary'

describe('ChunkErrorBoundary Component', () => {
  let reloadSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear()
    // Mock window.location.reload
    reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when no error', () => {
    render(
      <ChunkErrorBoundary>
        <div>Test Child Content</div>
      </ChunkErrorBoundary>
    )
    expect(screen.getByText('Test Child Content')).toBeTruthy()
  })

  it('renders reload UI on chunk load error', () => {
    const ThrowError = () => {
      throw new Error('Failed to fetch dynamically imported module')
    }

    // Suppress console.error and console.warn for this test
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <ChunkErrorBoundary>
        <ThrowError />
      </ChunkErrorBoundary>
    )

    expect(screen.getByText('App Updated')).toBeTruthy()
    expect(screen.getByText(/A new version was deployed/)).toBeTruthy()
    expect(screen.getByText('Reload Page')).toBeTruthy()
  })

  it('does not catch non-chunk errors', () => {
    const ThrowError = () => {
      throw new Error('Some other error')
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(
        <ChunkErrorBoundary>
          <ThrowError />
        </ChunkErrorBoundary>
      )
    }).toThrow('Some other error')
  })
})
