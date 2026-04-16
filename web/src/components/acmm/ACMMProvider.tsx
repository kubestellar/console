/**
 * ACMMProvider
 *
 * Holds the currently selected repo for the /acmm dashboard and exposes
 * a single scan result that all 4 cards read from. Persists the selection
 * to localStorage so revisits resume where the user left off.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useCachedACMMScan, type UseACMMScanResult } from '../../hooks/useCachedACMMScan'

const DEFAULT_REPO = 'kubestellar/console'
const SELECTED_REPO_KEY = 'kubestellar-acmm-selected-repo'
const RECENT_REPOS_KEY = 'kubestellar-acmm-recent-repos'
const MAX_RECENT_REPOS = 5

interface ACMMContextValue {
  repo: string
  setRepo: (repo: string) => void
  recentRepos: string[]
  clearRepo: () => void
  scan: UseACMMScanResult
}

const ACMMContext = createContext<ACMMContextValue | null>(null)

function readInitialRepo(): string {
  // URL param (?repo=owner/name) takes precedence so that badge links and
  // shared dashboard URLs open in-context regardless of the user's last selection.
  try {
    const url = new URL(window.location.href)
    const fromUrl = url.searchParams.get('repo')
    if (fromUrl && /^[\w.-]+\/[\w.-]+$/.test(fromUrl)) return fromUrl
  } catch {
    // window unavailable (SSR)
  }
  try {
    return localStorage.getItem(SELECTED_REPO_KEY) || DEFAULT_REPO
  } catch {
    return DEFAULT_REPO
  }
}

function readRecentRepos(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_REPOS_KEY)
    if (!raw) return [DEFAULT_REPO]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [DEFAULT_REPO]
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT_REPOS)
  } catch {
    return [DEFAULT_REPO]
  }
}

export function ACMMProvider({ children }: { children: ReactNode }) {
  const [repo, setRepoState] = useState<string>(() => readInitialRepo())
  const [recentRepos, setRecentRepos] = useState<string[]>(() => readRecentRepos())

  const scan = useCachedACMMScan(repo)

  const setRepo = useCallback((next: string) => {
    const trimmed = next.trim()
    if (!trimmed) return
    setRepoState(trimmed)
    try {
      localStorage.setItem(SELECTED_REPO_KEY, trimmed)
    } catch {
      // ignore localStorage failures
    }
    setRecentRepos((prev) => {
      const dedup = [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, MAX_RECENT_REPOS)
      try {
        localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(dedup))
      } catch {
        // ignore
      }
      return dedup
    })
  }, [])

  const clearRepo = useCallback(() => {
    setRepoState(DEFAULT_REPO)
    try {
      localStorage.setItem(SELECTED_REPO_KEY, DEFAULT_REPO)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!recentRepos.includes(repo)) {
      setRecentRepos((prev) => [repo, ...prev].slice(0, MAX_RECENT_REPOS))
    }
  }, [repo, recentRepos])

  const value = useMemo<ACMMContextValue>(
    () => ({ repo, setRepo, recentRepos, clearRepo, scan }),
    [repo, setRepo, recentRepos, clearRepo, scan],
  )

  return <ACMMContext.Provider value={value}>{children}</ACMMContext.Provider>
}

export function useACMM(): ACMMContextValue {
  const ctx = useContext(ACMMContext)
  if (!ctx) {
    throw new Error('useACMM must be used within an ACMMProvider')
  }
  return ctx
}

export { DEFAULT_REPO }
