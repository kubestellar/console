import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { PipelineFilterProvider, usePipelineFilter } from '../PipelineFilterContext'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Track the current server repos so individual tests can override them.
let mockServerRepos: string[] = ['org/default-a', 'org/default-b']

vi.mock('../../../../hooks/useGitHubPipelines', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useGitHubPipelines')>()
  return {
    ...actual,
    // All hooks return demo / no-op values; only getPipelineRepos matters here.
    getPipelineRepos: () => mockServerRepos,
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper(props: { initialRepo?: string | null } = {}) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <PipelineFilterProvider {...props}>{children}</PipelineFilterProvider>
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineFilterContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockServerRepos = ['org/default-a', 'org/default-b']
  })

  // ── outside provider ─────────────────────────────────────────────────────

  describe('usePipelineFilter outside provider', () => {
    it('returns null when called outside PipelineFilterProvider', () => {
      const { result } = renderHook(() => usePipelineFilter())
      expect(result.current).toBeNull()
    })
  })

  // ── initial state ─────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('provides non-null context value', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      expect(result.current).not.toBeNull()
    })

    it('starts with empty selectedRepos (show-all mode)', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      expect(result.current?.selectedRepos.size).toBe(0)
    })

    it('starts with repoFilter null when nothing is selected', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      expect(result.current?.repoFilter).toBeNull()
    })

    it('exposes serverRepos from getPipelineRepos', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      expect(result.current?.serverRepos).toEqual(['org/default-a', 'org/default-b'])
    })

    it('repos equals server defaults when no customisation applied', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      expect(result.current?.repos).toEqual(['org/default-a', 'org/default-b'])
    })

    it('hasCustomization is false with no changes', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      expect(result.current?.hasCustomization).toBe(false)
    })

    it('initialRepo sets that repo into selectedRepos', () => {
      const { result } = renderHook(() => usePipelineFilter(), {
        wrapper: makeWrapper({ initialRepo: 'org/default-a' }),
      })
      expect(result.current?.selectedRepos.has('org/default-a')).toBe(true)
    })

    it('repoFilter equals initialRepo when exactly one repo is seeded', () => {
      const { result } = renderHook(() => usePipelineFilter(), {
        wrapper: makeWrapper({ initialRepo: 'org/default-a' }),
      })
      expect(result.current?.repoFilter).toBe('org/default-a')
    })
  })

  // ── toggleRepo ────────────────────────────────────────────────────────────

  describe('toggleRepo', () => {
    it('adds a repo to the selection when not present', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.toggleRepo('org/default-a') })
      expect(result.current?.selectedRepos.has('org/default-a')).toBe(true)
    })

    it('removes a repo from the selection when already present', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.toggleRepo('org/default-a') })
      act(() => { result.current?.toggleRepo('org/default-a') })
      expect(result.current?.selectedRepos.has('org/default-a')).toBe(false)
    })

    it('allows multiple repos to be selected simultaneously', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => {
        result.current?.toggleRepo('org/default-a')
        result.current?.toggleRepo('org/default-b')
      })
      expect(result.current?.selectedRepos.has('org/default-a')).toBe(true)
      expect(result.current?.selectedRepos.has('org/default-b')).toBe(true)
    })

    it('repoFilter is null when multiple repos are selected (client-side filter)', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => {
        result.current?.toggleRepo('org/default-a')
        result.current?.toggleRepo('org/default-b')
      })
      expect(result.current?.repoFilter).toBeNull()
    })

    it('repoFilter equals the single selected repo', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.toggleRepo('org/default-b') })
      expect(result.current?.repoFilter).toBe('org/default-b')
    })
  })

  // ── selectAll ─────────────────────────────────────────────────────────────

  describe('selectAll', () => {
    it('clears the selection so all repos are shown', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.toggleRepo('org/default-a') })
      act(() => { result.current?.selectAll() })
      expect(result.current?.selectedRepos.size).toBe(0)
      expect(result.current?.repoFilter).toBeNull()
    })
  })

  // ── setRepoFilter ─────────────────────────────────────────────────────────

  describe('setRepoFilter', () => {
    it('selects exactly one repo when called with a string', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.setRepoFilter('org/default-b') })
      expect(result.current?.selectedRepos.size).toBe(1)
      expect(result.current?.selectedRepos.has('org/default-b')).toBe(true)
      expect(result.current?.repoFilter).toBe('org/default-b')
    })

    it('clears the selection when called with null', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.setRepoFilter('org/default-a') })
      act(() => { result.current?.setRepoFilter(null) })
      expect(result.current?.selectedRepos.size).toBe(0)
      expect(result.current?.repoFilter).toBeNull()
    })
  })

  // ── addRepo ───────────────────────────────────────────────────────────────

  describe('addRepo', () => {
    it('adds a new user repo and makes it visible', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      let added: boolean | undefined
      act(() => { added = result.current?.addRepo('user/custom') })
      expect(added).toBe(true)
      expect(result.current?.repos).toContain('user/custom')
    })

    it('returns false when repo is already in the list', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      let added: boolean | undefined
      act(() => { added = result.current?.addRepo('org/default-a') })
      expect(added).toBe(false)
    })

    it('returns false for strings without a slash', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      let added: boolean | undefined
      act(() => { added = result.current?.addRepo('noslash') })
      expect(added).toBe(false)
      expect(result.current?.repos).not.toContain('noslash')
    })

    it('returns false for empty string', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      let added: boolean | undefined
      act(() => { added = result.current?.addRepo('') })
      expect(added).toBe(false)
    })

    it('sets hasCustomization to true after adding a repo', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.addRepo('user/custom') })
      expect(result.current?.hasCustomization).toBe(true)
    })
  })

  // ── removeRepo ────────────────────────────────────────────────────────────

  describe('removeRepo', () => {
    it('hides a server-default repo (moves it to hiddenRepos)', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.removeRepo('org/default-a') })
      expect(result.current?.repos).not.toContain('org/default-a')
      expect(result.current?.hiddenRepos).toContain('org/default-a')
    })

    it('permanently deletes a user-added repo', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.addRepo('user/custom') })
      act(() => { result.current?.removeRepo('user/custom') })
      expect(result.current?.repos).not.toContain('user/custom')
      expect(result.current?.hiddenRepos).not.toContain('user/custom')
    })

    it('also removes the repo from the current selection', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.toggleRepo('org/default-a') })
      act(() => { result.current?.removeRepo('org/default-a') })
      expect(result.current?.selectedRepos.has('org/default-a')).toBe(false)
    })

    it('sets hasCustomization to true after hiding a server repo', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.removeRepo('org/default-b') })
      expect(result.current?.hasCustomization).toBe(true)
    })
  })

  // ── restoreRepo ───────────────────────────────────────────────────────────

  describe('restoreRepo', () => {
    it('unhides a previously hidden server-default repo', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.removeRepo('org/default-a') })
      expect(result.current?.hiddenRepos).toContain('org/default-a')

      act(() => { result.current?.restoreRepo('org/default-a') })
      expect(result.current?.hiddenRepos).not.toContain('org/default-a')
      expect(result.current?.repos).toContain('org/default-a')
    })
  })

  // ── resetToDefaults ───────────────────────────────────────────────────────

  describe('resetToDefaults', () => {
    it('removes user-added repos', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.addRepo('user/custom') })
      act(() => { result.current?.resetToDefaults() })
      expect(result.current?.repos).not.toContain('user/custom')
    })

    it('restores previously hidden server repos', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.removeRepo('org/default-a') })
      act(() => { result.current?.resetToDefaults() })
      expect(result.current?.repos).toContain('org/default-a')
    })

    it('clears the current selection', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.toggleRepo('org/default-b') })
      act(() => { result.current?.resetToDefaults() })
      expect(result.current?.selectedRepos.size).toBe(0)
    })

    it('sets hasCustomization back to false', () => {
      const { result } = renderHook(() => usePipelineFilter(), { wrapper: makeWrapper() })
      act(() => { result.current?.addRepo('user/custom') })
      act(() => { result.current?.resetToDefaults() })
      expect(result.current?.hasCustomization).toBe(false)
    })
  })
})
