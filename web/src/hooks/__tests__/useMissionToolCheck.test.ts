/**
 * Tests for useMissionToolCheck hook
 *
 * Covers: idle state, checking lifecycle, ready/warning/blocked/error
 * statuses, getMissingTools fallback, showNotice, isBlocking, isChecking
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useMissionToolCheck } from '../useMissionToolCheck'

// ---------- Mocks ----------

const mockAgentStatus = vi.fn(() => 'connected')

vi.mock('../useLocalAgent', () => ({
  useLocalAgent: () => ({ status: mockAgentStatus() }),
}))

vi.mock('../mcp/agentFetch', () => ({
  agentFetch: vi.fn(),
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8080',
}))

vi.mock('../../lib/missions/preflightCheck', () => ({
  resolveRequiredTools: vi.fn((missionType: string) =>
    missionType === 'deploy' ? ['kubectl', 'helm'] : []
  ),
  runToolPreflightCheck: vi.fn(),
}))

import { runToolPreflightCheck } from '../../lib/missions/preflightCheck'

// ---------- Setup ----------

beforeEach(() => {
  vi.clearAllMocks()
  mockAgentStatus.mockReturnValue('connected')
})

// ── idle state ──

describe('useMissionToolCheck — idle state', () => {
  it('returns idle when disabled', async () => {
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: false, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(runToolPreflightCheck).not.toHaveBeenCalled()
  })

  it('returns idle when agent is not connected', async () => {
    mockAgentStatus.mockReturnValue('disconnected')
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(runToolPreflightCheck).not.toHaveBeenCalled()
  })

  it('returns idle when no missionType provided', async () => {
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true })
    )
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(runToolPreflightCheck).not.toHaveBeenCalled()
  })

  it('starts with empty missingTools', () => {
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: false })
    )
    expect(result.current.missingTools).toEqual([])
  })
})

// ── ready state ──

describe('useMissionToolCheck — ready state', () => {
  it('sets status to ready when all tools are present', async () => {
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({ ok: true, tools: [] })
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.missingTools).toEqual([])
    expect(result.current.errorMessage).toBeUndefined()
  })

  it('sets isChecking false when ready', async () => {
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({ ok: true, tools: [] })
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.isChecking).toBe(false)
  })

  it('sets isBlocking false when ready', async () => {
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({ ok: true, tools: [] })
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.isBlocking).toBe(false)
  })
})

// ── blocked state ──

describe('useMissionToolCheck — blocked state', () => {
  it('sets status to blocked when tools missing and allowMissingTools is false', async () => {
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({
      ok: false,
      tools: [],
      error: {
        code: 'MISSING_TOOLS',
        message: 'Missing tools',
        details: { missingTools: ['helm'] },
      },
    })
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('blocked'))
    expect(result.current.missingTools).toEqual(['helm'])
    expect(result.current.isBlocking).toBe(true)
  })

  it('uses fallback tools when missingTools details are invalid', async () => {
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({
      ok: false,
      tools: [],
      error: {
        code: 'MISSING_TOOLS',
        message: 'Missing tools',
        details: { missingTools: 'not-an-array' },
      },
    })
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('blocked'))
    expect(result.current.missingTools).toEqual(['kubectl', 'helm'])
  })
})

// ── warning state ──

describe('useMissionToolCheck — warning state', () => {
  it('sets status to warning when tools missing but allowMissingTools is true', async () => {
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({
      ok: false,
      tools: [],
      error: {
        code: 'MISSING_TOOLS',
        message: 'Missing tools',
        details: { missingTools: ['helm'] },
      },
    })
    const { result } = renderHook(() =>
      useMissionToolCheck({
        enabled: true,
        missionType: 'deploy',
        missionContext: { allowMissingLocalTools: true },
      })
    )
    await waitFor(() => expect(result.current.status).toBe('warning'))
    expect(result.current.isBlocking).toBe(false)
    expect(result.current.allowMissingTools).toBe(true)
  })
})

// ── error state ──

describe('useMissionToolCheck — error state', () => {
  it('sets status to error when preflight returns non-MISSING_TOOLS error', async () => {
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({
      ok: false,
      tools: [],
      error: { code: 'UNKNOWN_EXECUTION_FAILURE', message: 'Connection refused' },
    })
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.errorMessage).toBe('Connection refused')
    expect(result.current.missingTools).toEqual([])
  })

  it('sets status to error when preflight throws', async () => {
    vi.mocked(runToolPreflightCheck).mockRejectedValueOnce(new Error('Unexpected failure'))
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.errorMessage).toBe('Unexpected failure')
  })
})

// ── showNotice ──

describe('useMissionToolCheck — showNotice', () => {
  it('showNotice is true when connected, has tools, and status is not idle', async () => {
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({ ok: true, tools: [] })
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.showNotice).toBe(true)
  })

  it('showNotice is false when status is idle', async () => {
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: false, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.showNotice).toBe(false)
  })
})

// ── requiredTools ──

describe('useMissionToolCheck — requiredTools', () => {
  it('resolves required tools from missionType', async () => {
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({ ok: true, tools: [] })
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true, missionType: 'deploy' })
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.requiredTools).toEqual(['kubectl', 'helm'])
  })

  it('returns empty requiredTools when no missionType', () => {
    const { result } = renderHook(() =>
      useMissionToolCheck({ enabled: true })
    )
    expect(result.current.requiredTools).toEqual([])
  })
})