/**
 * Tests for the thin `VersionCheckProvider` / `useVersionCheck` wrappers.
 *
 * The bulk of the version-check logic lives in `useVersionCheckCore` and is
 * covered by `web/src/hooks/version/__tests__/useVersionCheckCore.test.tsx`.
 * This file only exercises the tiny context/provider shim:
 *
 *   - `useVersionCheck()` throws when called outside a `<VersionCheckProvider>`.
 *   - Inside a provider, it returns exactly the value produced by the mocked
 *     `useVersionCheckCore` hook.
 *   - The returned value is memoized against the fields listed in the
 *     provider's `useMemo` dependency array (same object reference when the
 *     tracked fields do not change).
 *   - The re-exported version utility helpers are surfaced through this
 *     module (guards against accidental removal of a re-export).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'

const { mockUseVersionCheckCore } = vi.hoisted(() => ({
  mockUseVersionCheckCore: vi.fn(),
}))

vi.mock('../version/useVersionCheckCore', () => ({
  useVersionCheckCore: () => mockUseVersionCheckCore(),
}))

import {
  VersionCheckProvider,
  useVersionCheck,
  parseReleaseTag,
  parseRelease,
  getLatestForChannel,
  isDevVersion,
  isNewerVersion,
} from '../useVersionCheck'

function makeCoreValue(overrides: Record<string, unknown> = {}) {
  return {
    currentVersion: '1.2.3',
    commitHash: 'abcdef0',
    channel: 'stable',
    latestRelease: null,
    hasUpdate: false,
    isChecking: false,
    error: null,
    lastChecked: null,
    skippedVersions: [],
    releases: [],
    lastCheckResult: null,
    autoUpdateEnabled: false,
    installMethod: 'binary',
    autoUpdateStatus: 'idle',
    updateProgress: null,
    agentConnected: false,
    hasCodingAgent: false,
    latestMainSHA: null,
    recentCommits: [],
    setChannel: vi.fn(),
    checkForUpdates: vi.fn(),
    forceCheck: vi.fn(),
    skipVersion: vi.fn(),
    clearSkippedVersions: vi.fn(),
    setAutoUpdateEnabled: vi.fn(),
    triggerUpdate: vi.fn(),
    cancelUpdate: vi.fn(),
    setUpdateProgress: vi.fn(),
    clearLastCheckResult: vi.fn(),
    ...overrides,
  }
}

describe('useVersionCheck (context hook)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws a helpful error when used outside a VersionCheckProvider', () => {
    // Suppress React's noisy render-error logging for this expected throw.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    expect(() => renderHook(() => useVersionCheck())).toThrow(
      /useVersionCheck must be used within a <VersionCheckProvider>/,
    )
    consoleError.mockRestore()
  })

  it('returns the value produced by useVersionCheckCore when wrapped in a provider', () => {
    const core = makeCoreValue({ currentVersion: '9.9.9', hasUpdate: true })
    mockUseVersionCheckCore.mockReturnValue(core)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <VersionCheckProvider>{children}</VersionCheckProvider>
    )
    const { result } = renderHook(() => useVersionCheck(), { wrapper })

    expect(result.current.currentVersion).toBe('9.9.9')
    expect(result.current.hasUpdate).toBe(true)
    expect(result.current.setChannel).toBe(core.setChannel)
  })

  it('memoizes the returned value across re-renders when tracked fields are stable', () => {
    const core = makeCoreValue()
    mockUseVersionCheckCore.mockReturnValue(core)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <VersionCheckProvider>{children}</VersionCheckProvider>
    )
    const { result, rerender } = renderHook(() => useVersionCheck(), { wrapper })

    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('returns a new value object when a tracked field changes', () => {
    const first = makeCoreValue({ currentVersion: '1.0.0' })
    mockUseVersionCheckCore.mockReturnValue(first)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <VersionCheckProvider>{children}</VersionCheckProvider>
    )
    const { result, rerender } = renderHook(() => useVersionCheck(), { wrapper })

    const before = result.current
    // Change a tracked field on the underlying core value.
    mockUseVersionCheckCore.mockReturnValue(
      makeCoreValue({
        currentVersion: '2.0.0',
        setChannel: first.setChannel,
        checkForUpdates: first.checkForUpdates,
        forceCheck: first.forceCheck,
        skipVersion: first.skipVersion,
        clearSkippedVersions: first.clearSkippedVersions,
        setAutoUpdateEnabled: first.setAutoUpdateEnabled,
        triggerUpdate: first.triggerUpdate,
        cancelUpdate: first.cancelUpdate,
        setUpdateProgress: first.setUpdateProgress,
        clearLastCheckResult: first.clearLastCheckResult,
      }),
    )
    rerender()

    expect(result.current).not.toBe(before)
    expect(result.current.currentVersion).toBe('2.0.0')
  })
})

describe('useVersionCheck module re-exports', () => {
  it('re-exports the version utility helpers from versionUtils', () => {
    expect(typeof parseReleaseTag).toBe('function')
    expect(typeof parseRelease).toBe('function')
    expect(typeof getLatestForChannel).toBe('function')
    expect(typeof isDevVersion).toBe('function')
    expect(typeof isNewerVersion).toBe('function')
  })
})
