/**
 * ACMMProvider
 *
 * Holds the currently selected repo for the /acmm dashboard and exposes
 * a single scan result that all 4 cards read from. Persists the selection
 * to localStorage so revisits resume where the user left off.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useCachedACMMScan, type UseACMMScanResult } from '../../hooks/useCachedACMMScan'
import { isACMMIntroDismissed } from './ACMMIntroModal'

const DEFAULT_REPO = 'kubestellar/console'
const SELECTED_REPO_KEY = 'kubestellar-acmm-selected-repo'
const RECENT_REPOS_KEY = 'kubestellar-acmm-recent-repos'
const MAX_RECENT_REPOS = 5
const REPO_SLUG_RE = /^[\w.-]+\/[\w.-]+$/

/** Coerce common GitHub URL shapes to bare owner/repo so users can paste
 *  what's in their address bar directly:
 *    - https://github.com/owner/repo
 *    - https://github.com/owner/repo.git
 *    - https://github.com/owner/repo/tree/main/anything
 *    - git@github.com:owner/repo.git
 *    - github.com/owner/repo
 *  Returns the input unchanged if it doesn't look like a GitHub URL —
 *  REPO_SLUG_RE validation downstream still catches garbage. */
export function normalizeRepoInput(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  // SSH form: git@github.com:owner/repo(.git)?
  const ssh = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(trimmed)
  if (ssh) return `${ssh[1]}/${ssh[2]}`
  // HTTPS / bare-host form. Strip protocol, optional www, github.com/, then
  // peel any trailing /tree/... or .git suffix.
  const httpsLike = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/.exec(trimmed)
  if (httpsLike) return `${httpsLike[1]}/${httpsLike[2]}`
  return trimmed
}

/** ACMM has 5 levels (L1 Assisted → L5 Self-Sustaining). The slider in
 *  the Recommendations card lets the user explore "what would balance
 *  look like at this level?" and filter the inventory accordingly. */
const MIN_LEVEL = 1
const MAX_LEVEL = 5

interface ACMMContextValue {
  repo: string
  setRepo: (repo: string) => void
  recentRepos: string[]
  clearRepo: () => void
  scan: UseACMMScanResult
  /** Intro-modal visibility — lifted into context so the picker can
   *  re-trigger the modal via "What is ACMM?" after dismissal. */
  introOpen: boolean
  openIntro: () => void
  closeIntro: () => void
  /** User-chosen exploration level (1-5). Defaults to detected level on
   *  scan complete, but the user can drag the slider to project ahead.
   *  Drives the dual area charts (visualization only). */
  targetLevel: number
  setTargetLevel: (level: number) => void
}

const ACMMContext = createContext<ACMMContextValue | null>(null)

function readInitialRepo(): string {
  // URL param (?repo=owner/name) takes precedence so that badge links and
  // shared dashboard URLs open in-context regardless of the user's last selection.
  // Also accepts a full github.com URL passed via ?repo= for convenience.
  try {
    const url = new URL(window.location.href)
    const fromUrl = url.searchParams.get('repo')
    if (fromUrl) {
      const normalized = normalizeRepoInput(fromUrl)
      if (REPO_SLUG_RE.test(normalized)) return normalized
    }
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
  const [introOpen, setIntroOpen] = useState(false)
  const [targetLevel, setTargetLevelState] = useState<number>(MIN_LEVEL)
  /** Tracks whether the user has dragged the slider. While false, the
   *  target tracks the detected level. Once the user takes control, we
   *  stop following the scan so their exploration sticks. */
  const userOverrodeLevel = useRef(false)

  const scan = useCachedACMMScan(repo)

  // Auto-open the intro on first visit unless previously dismissed.
  useEffect(() => {
    if (!isACMMIntroDismissed()) {
      setIntroOpen(true)
    }
  }, [])

  const openIntro = useCallback(() => setIntroOpen(true), [])
  const closeIntro = useCallback(() => setIntroOpen(false), [])

  // Sync targetLevel to (detected level + 1) on scan complete so the slider
  // opens "one level ahead". Stops following the scan once the user drags.
  useEffect(() => {
    if (!userOverrodeLevel.current && scan.level.level) {
      setTargetLevelState(Math.min(MAX_LEVEL, scan.level.level + 1))
    }
  }, [scan.level.level])

  const setTargetLevel = useCallback((next: number) => {
    userOverrodeLevel.current = true
    const clamped = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(next)))
    setTargetLevelState(clamped)
  }, [])

  const setRepo = useCallback((next: string) => {
    // Coerce pasted GitHub URLs to bare owner/repo so the rest of the
    // pipeline (URL sync, badges, share link, scan endpoint) sees a
    // canonical slug regardless of what the user typed.
    const trimmed = normalizeRepoInput(next)
    if (!trimmed) return
    setRepoState(trimmed)
    try {
      localStorage.setItem(SELECTED_REPO_KEY, trimmed)
    } catch {
      // ignore localStorage failures
    }
    // Sync the URL so the current scan is always shareable. replaceState
    // (not pushState) keeps the back button useful — picking a new repo
    // is dashboard interaction, not navigation.
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('repo', trimmed)
      window.history.replaceState(null, '', url.toString())
    } catch {
      // window/history unavailable (SSR)
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
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('repo', DEFAULT_REPO)
      window.history.replaceState(null, '', url.toString())
    } catch {
      // window/history unavailable
    }
  }, [])

  useEffect(() => {
    if (!recentRepos.includes(repo)) {
      setRecentRepos((prev) => [repo, ...prev].slice(0, MAX_RECENT_REPOS))
    }
  }, [repo, recentRepos])

  const value = useMemo<ACMMContextValue>(
    () => ({ repo, setRepo, recentRepos, clearRepo, scan, introOpen, openIntro, closeIntro, targetLevel, setTargetLevel }),
    [repo, setRepo, recentRepos, clearRepo, scan, introOpen, openIntro, closeIntro, targetLevel, setTargetLevel],
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
