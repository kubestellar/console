import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const emitACMMScanned = vi.fn()
const safeGetMock = vi.fn<(key: string) => string | null>(() => null)
const safeSetMock = vi.fn<(key: string, value: string) => void>()
const forceRefetch = vi.fn()

vi.mock('../../lib/analytics', () => ({
  emitACMMScanned: (...args: unknown[]) => emitACMMScanned(...args),
}))

vi.mock('../../lib/safeLocalStorage', () => ({
  safeGet: (key: string) => safeGetMock(key),
  safeSet: (key: string, value: string) => safeSetMock(key, value),
}))

vi.mock('./ACMMIntroModal', () => ({
  isACMMIntroDismissed: () => true,
}))

const scanResultFactory = () => ({
  data: { repo: 'kubestellar/console', scannedAt: '', detectedIds: [] as string[], weeklyActivity: [] },
  detectedIds: new Set<string>(),
  level: {
    level: 2,
    levelName: 'L2',
    detectedByLevel: {},
    requiredByLevel: {},
  },
  recommendations: [],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isDemoData: false,
  error: null as string | null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
  forceRefetch,
})

vi.mock('../../hooks/useCachedACMMScan', () => ({
  useCachedACMMScan: () => scanResultFactory(),
}))

import { ACMMProvider, useACMM, normalizeRepoInput, DEFAULT_REPO } from './ACMMProvider'

function Consumer() {
  const { repo, setRepo, recentRepos, clearRepo } = useACMM()
  return (
    <div>
      <span data-testid="repo">{repo}</span>
      <span data-testid="recent">{recentRepos.join(',')}</span>
      <button onClick={() => setRepo('https://github.com/foo/bar')}>set</button>
      <button onClick={() => clearRepo()}>clear</button>
    </div>
  )
}

describe('normalizeRepoInput', () => {
  it('coerces a bare github.com URL to owner/repo', () => {
    expect(normalizeRepoInput('https://github.com/owner/repo')).toBe('owner/repo')
  })

  it('coerces a .git suffixed URL to owner/repo', () => {
    expect(normalizeRepoInput('https://github.com/owner/repo.git')).toBe('owner/repo')
  })

  it('coerces a URL with a trailing path (tree/branch/subpath) to owner/repo', () => {
    expect(normalizeRepoInput('https://github.com/owner/repo/tree/main/foo')).toBe('owner/repo')
  })

  it('coerces an SSH-form URL to owner/repo', () => {
    expect(normalizeRepoInput('git@github.com:owner/repo.git')).toBe('owner/repo')
  })

  it('coerces a protocol-less host form to owner/repo', () => {
    expect(normalizeRepoInput('github.com/owner/repo')).toBe('owner/repo')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeRepoInput('  owner/repo  ')).toBe('owner/repo')
  })

  it('returns an already-bare slug unchanged', () => {
    expect(normalizeRepoInput('owner/repo')).toBe('owner/repo')
  })

  it('returns non-GitHub-looking input unchanged', () => {
    expect(normalizeRepoInput('not a valid repo!!')).toBe('not a valid repo!!')
  })

  it('returns an empty string unchanged for blank input', () => {
    expect(normalizeRepoInput('   ')).toBe('')
  })
})

describe('ACMMProvider / useACMM', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetMock.mockReturnValue(null)
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('throws when useACMM is used outside of a provider', () => {
    const BadConsumer = () => {
      useACMM()
      return null
    }
    expect(() => render(<BadConsumer />)).toThrow('useACMM must be used within an ACMMProvider')
  })

  it('defaults to DEFAULT_REPO when no URL param or localStorage value is present', () => {
    render(
      <ACMMProvider>
        <Consumer />
      </ACMMProvider>,
    )
    expect(screen.getByTestId('repo')).toHaveTextContent(DEFAULT_REPO)
  })

  it('hydrates the initial repo from localStorage via safeGet', () => {
    safeGetMock.mockImplementation((key: string) => (key === 'kubestellar-acmm-selected-repo' ? 'acme/widgets' : null))
    render(
      <ACMMProvider>
        <Consumer />
      </ACMMProvider>,
    )
    expect(screen.getByTestId('repo')).toHaveTextContent('acme/widgets')
  })

  it('normalizes and persists the repo when setRepo is called', () => {
    render(
      <ACMMProvider>
        <Consumer />
      </ACMMProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByText('set'))
    })
    expect(screen.getByTestId('repo')).toHaveTextContent('foo/bar')
    expect(safeSetMock).toHaveBeenCalledWith('kubestellar-acmm-selected-repo', 'foo/bar')
  })

  it('adds the new repo to the front of recentRepos, deduping repeats', () => {
    render(
      <ACMMProvider>
        <Consumer />
      </ACMMProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByText('set'))
    })
    const recent = screen.getByTestId('recent').textContent || ''
    expect(recent.split(',')[0]).toBe('foo/bar')
  })

  it('resets to DEFAULT_REPO when clearRepo is called', () => {
    render(
      <ACMMProvider>
        <Consumer />
      </ACMMProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByText('set'))
    })
    expect(screen.getByTestId('repo')).toHaveTextContent('foo/bar')
    act(() => {
      fireEvent.click(screen.getByText('clear'))
    })
    expect(screen.getByTestId('repo')).toHaveTextContent(DEFAULT_REPO)
  })
})
