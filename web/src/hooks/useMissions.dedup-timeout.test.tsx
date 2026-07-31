  it('blocks execution when imported mission contains malicious content', async () => {
    const { scanForMaliciousContent } = await import('../lib/missions/scanner/malicious')
    vi.mocked(scanForMaliciousContent).mockReturnValueOnce([
      { type: 'command_injection', message: 'Suspicious command found', match: 'rm -rf /', location: 'steps[0]', severity: 'high' },
    ])

    const mission = {
      id: 'malicious-1',
      title: 'Bad Mission',
      description: 'Seems harmless',
      type: 'deploy',
      status: 'saved',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedFrom: {
        title: 'Bad Mission',
        description: 'Seems harmless',
        steps: [{ title: 'Step 1', description: 'rm -rf /' }],
        tags: [],
      },
    }
    localStorage.setItem('kc_missions', JSON.stringify([mission]))

    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission('malicious-1') })

    const m = result.current.missions.find(m => m.id === 'malicious-1')
    expect(m?.status).toBe('failed')
    expect(m?.messages.some(msg => msg.content.includes('Mission blocked'))).toBe(true)
    expect(m?.messages.some(msg => msg.content.includes('rm -rf /'))).toBe(true)
  })

// ── Result message deduplication ─────────────────────────────────────────────

describe('result message deduplication', () => {
  it('uses output field from result payload when content is missing', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: { output: 'Output from agent' },
      })
    })

    const msgs = result.current.missions[0].messages.filter(m => m.role === 'assistant')
    expect(msgs.length).toBe(1)
    expect(msgs[0].content).toBe('Output from agent')
  })

  it('falls back to "Task completed." when result has no content or output', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: {},
      })
    })

    const msgs = result.current.missions[0].messages.filter(m => m.role === 'assistant')
    expect(msgs.length).toBe(1)
    expect(msgs[0].content).toBe('Task completed.')
  })
})

// ── minimizeSidebar / expandSidebar ──────────────────────────────────────────

describe('sidebar minimize/expand', () => {
  it('minimizeSidebar sets isSidebarMinimized to true', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.minimizeSidebar() })
    expect(result.current.isSidebarMinimized).toBe(true)
  })

  it('expandSidebar sets isSidebarMinimized to false', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.minimizeSidebar() })
    act(() => { result.current.expandSidebar() })
    expect(result.current.isSidebarMinimized).toBe(false)
  })
})

// ── Mission timeout interval ─────────────────────────────────────────────────

describe('mission timeout interval', () => {
  const PRE_TIMEOUT_BUFFER_MS = 1

  it('transitions running mission to failed after MISSION_TIMEOUT_MS (5 min)', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { missionId } = await startMissionWithConnection(result)

      expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('running')

      act(() => { vi.advanceTimersByTime(MISSION_TIMEOUT_MS + MISSION_TIMEOUT_CHECK_INTERVAL_MS) })

      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('failed')
      expect(mission?.messages.some(m => m.content.includes('Mission Timed Out'))).toBe(true)
      expect(emitMissionError).toHaveBeenCalledWith('troubleshoot', 'mission_timeout', expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })

  it('allows Mission Control launches to run until the extended timeout', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const missionParams: StartMissionParams = {
        ...defaultParams,
        type: 'deploy',
        context: { source: 'mission-control' },
      }
      const { missionId } = await startMissionWithConnection(result, missionParams)

      act(() => { vi.advanceTimersByTime(MISSION_TIMEOUT_MS + MISSION_TIMEOUT_CHECK_INTERVAL_MS) })
      expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('running')

      act(() => { vi.advanceTimersByTime(MISSION_CONTROL_TRIGGER_TIMEOUT_MS - MISSION_TIMEOUT_MS - PRE_TIMEOUT_BUFFER_MS) })
      expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('running')

      act(() => { vi.advanceTimersByTime(MISSION_TIMEOUT_CHECK_INTERVAL_MS) })
      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('failed')
      expect(mission?.messages.some(m => m.content.includes('20 minutes'))).toBe(true)
      expect(emitMissionError).toHaveBeenCalledWith('deploy', 'mission_timeout', expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })

  it('transitions running mission to failed after stream inactivity (90s)', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { missionId, requestId } = await startMissionWithConnection(result)

      // Send a stream chunk to start tracking inactivity
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: 'Starting...', done: false },
        })
      })

      // Advance past inactivity timeout (90s) + check interval (15s)
      act(() => { vi.advanceTimersByTime(90_000 + 15_000) })

      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('failed')
      expect(mission?.messages.some(m => m.content.includes('Agent Not Responding'))).toBe(true)
      expect(emitMissionError).toHaveBeenCalledWith('troubleshoot', 'mission_inactivity', expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })

  it('progress events reset inactivity timer so long-running tools do not timeout', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { missionId, requestId } = await startMissionWithConnection(result)

      // Send a stream chunk to start tracking inactivity
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: 'Installing Drasi...', done: false },
        })
      })

      // Advance 60s — within 90s window, still alive
      act(() => { vi.advanceTimersByTime(60_000) })

      // Send a progress event (heartbeat from tool execution)
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'progress',
          payload: { step: 'Still working...' },
        })
      })

      // Advance another 60s — 120s total, but only 60s since last progress event
      act(() => { vi.advanceTimersByTime(60_000) })

      // Mission should still be running (progress reset the timer)
      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('running')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not fire timeout when no running missions exist', async () => {
    vi.useFakeTimers()
    try {
      seedMission({ status: 'completed' })
      const { result } = renderHook(() => useMissions(), { wrapper })

      act(() => { vi.advanceTimersByTime(315_000) })

      // No change to status
      expect(result.current.missions[0].status).toBe('completed')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── WebSocket send retry logic ───────────────────────────────────────────────

describe('wsSend retry logic', () => {
  it('retries sending when WS is not yet open and succeeds on open', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })

      // Start a mission — this triggers ensureConnection
      act(() => { result.current.startMission(defaultParams) })
      await act(async () => { await Promise.resolve() })

      // WS is in CONNECTING state — the send will be retried
      // Now open the WS
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

      // Advance past retry delay (1s)
      act(() => { vi.advanceTimersByTime(1_100) })

      // Chat message should have been sent
      const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
        (call: string[]) => {
          try { return JSON.parse(call[0]).type === 'chat' } catch { return false }
        },
      )
      expect(chatCall).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  describe('loading state exposure', () => {
    it('exposes agentsLoading state to consumers', () => {
      const { result } = renderHook(() => useMissions(), { wrapper })
      expect(result.current).toHaveProperty('agentsLoading')
      expect(typeof result.current.agentsLoading).toBe('boolean')
    })
  })
})
