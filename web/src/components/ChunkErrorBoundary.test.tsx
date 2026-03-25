import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChunkErrorBoundary } from './ChunkErrorBoundary'

// Mock i18next so translations resolve to English strings
vi.mock('i18next', () => ({
  default: {
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common:chunkError.appUpdated': 'App Updated',
        'common:chunkError.newVersionDeployed': 'A new version was deployed. Please reload to continue.',
        'common:chunkError.reloadPage': 'Reload Page',
      }
      return translations[key] ?? key
    },
  },
}))

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

  // Safari reports module import failures with its own message pattern.
  // GA4 shows these as "TypeError: Importing a module script failed." (×12)
  // and "Importing a module script failed." (×1) — 13 of the 14 reported errors.
  it.each([
    ['Error', new Error('Importing a module script failed.')],
    ['TypeError (Safari prefix)', new TypeError('Importing a module script failed.')],
  ])('renders reload UI on Safari module script error: %s', (_label, error) => {
    const ThrowError = () => { throw error }

    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <ChunkErrorBoundary>
        <ThrowError />
      </ChunkErrorBoundary>
    )

    expect(screen.getByText('App Updated')).toBeTruthy()
    expect(screen.getByText('Reload Page')).toBeTruthy()
  })

  it('renders reload UI on safeLazy stale-export error', () => {
    const ThrowError = () => {
      throw new Error('Export "Compliance" not found in module — chunk may be stale. Reload the page to get the latest version.')
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <ChunkErrorBoundary>
        <ThrowError />
      </ChunkErrorBoundary>
    )

    expect(screen.getByText('App Updated')).toBeTruthy()
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

  it('renders loading state children without interference', () => {
    render(
      <ChunkErrorBoundary>
        <div>Loading...</div>
      </ChunkErrorBoundary>
    )
    expect(screen.getByText('Loading...')).toBeTruthy()
  })
})
