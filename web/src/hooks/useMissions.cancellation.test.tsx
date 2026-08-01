describe('setActiveMission', () => {
  it('opens the sidebar when setting an active mission', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isSidebarOpen).toBe(false)

    act(() => { result.current.setActiveMission(missionId) })

    expect(result.current.isSidebarOpen).toBe(true)
    expect(result.current.activeMission?.id).toBe(missionId)
  })

  it('clears activeMission when passed null', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.setActiveMission(missionId) })
    expect(result.current.activeMission).not.toBeNull()

    act(() => { result.current.setActiveMission(null) })

    expect(result.current.activeMission).toBeNull()
  })

  it('marks mission as read when viewing it', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Background the mission and trigger unread
    act(() => { result.current.setActiveMission(null) })
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({ id: requestId, type: 'stream', payload: { content: '', done: true } })
    })
    expect(result.current.unreadMissionIds.has(missionId)).toBe(true)

    // View the mission
    act(() => { result.current.setActiveMission(missionId) })

    expect(result.current.unreadMissionIds.has(missionId)).toBe(false)
  })
})

// ── Cancelling mission with terminal messages ────────────────────────────────

describe('cancelling mission receives terminal messages', () => {
  it('finalizes cancellation on cancel_ack while cancelling', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')

    // Backend sends cancel_ack confirming the cancellation
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-ack-${Date.now()}`,
        type: 'cancel_ack',
        payload: { sessionId: missionId, success: true },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('cancelled by user'))).toBe(true)
  })

  it('finalizes cancellation on cancel_ack with failure while cancelling', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    // Backend sends cancel_ack with failure
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-ack-${Date.now()}`,
        type: 'cancel_ack',
        payload: { sessionId: missionId, success: false, message: 'Cancelled with error' },
      })
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelled')
  })

  it('finalizes cancellation on cancel_confirmed while cancelling', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    // Backend sends cancel_confirmed (alternative ack type)
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-confirmed-${Date.now()}`,
        type: 'cancel_confirmed',
        payload: { sessionId: missionId, success: true },
      })
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelled')
  })

  // #8106 — The Go backend's handleCancelChat actually emits
  // `type: "result"` with `{cancelled, sessionId}`. The frontend must accept
  // this shape as a cancel acknowledgement; otherwise the mission stays stuck
  // in `cancelling` until the client-side fallback timeout fires.
  it('finalizes cancellation on result message with cancelled:true (handleCancelChat shape)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')

    // Backend replies with the real handleCancelChat shape: a `result`
    // message carrying `{cancelled, sessionId}` and keyed by the cancel
    // request's own id (which is NOT in pendingRequests).
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-${Date.now()}`,
        type: 'result',
        payload: { cancelled: true, sessionId: missionId },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('cancelled by user'))).toBe(true)
  })

  it('finalizes cancellation on result message with cancelled:false as failure', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-${Date.now()}`,
        type: 'result',
        payload: { cancelled: false, sessionId: missionId, message: 'no active session' },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('cancellation failed') || m.content.includes('no active session'))).toBe(true)
  })

  it('ignores non-terminal messages while cancelling (e.g., progress)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Still processing...' },
      })
    })

    // Should still be in cancelling, not updated
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')
  })

  it('handles cancel_ack with success:false', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-ack-${Date.now()}`,
        type: 'cancel_ack',
        payload: { sessionId: missionId, success: false, message: 'Cancel failed on backend' },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('Cancel failed on backend'))).toBe(true)
  })

  it('handles cancel_confirmed message type (alternate ack)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-confirm-${Date.now()}`,
        type: 'cancel_confirmed',
        payload: { sessionId: missionId, success: true },
      })
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelled')
  })

  // #9477 — When the backend sends `{type: "result", payload: {cancelled: true}}`
  // WITHOUT a `sessionId` field, the hook should resolve the mission ID from
  // the active cancel intents and still finalize the cancellation instead of
  // leaving the UI stuck on "Cancelling..." forever.
  it('finalizes cancellation on result with cancelled:true but no sessionId (#9477)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')

    // Backend replies with cancelled:true but omits sessionId entirely
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-${Date.now()}`,
        type: 'result',
        payload: { cancelled: true },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('cancelled by user'))).toBe(true)
  })

  it('prevents double-cancel (no duplicate timeout)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })
    // Second cancel should be a no-op
    act(() => { result.current.cancelMission(missionId) })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')
  })

  it('HTTP cancel fallback handles failure response', async () => {
    const missionId = seedMission({ status: 'running' })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false })
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.cancelMission(missionId) })

    await act(async () => { await Promise.resolve() })
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('cancellation failed'))).toBe(true)
  })

  it('HTTP cancel fallback handles network error', async () => {
    const missionId = seedMission({ status: 'running' })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.cancelMission(missionId) })

    await act(async () => { await Promise.resolve() })
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('backend unreachable'))).toBe(true)
  })

  describe('loading state exposure', () => {
    it('exposes agentsLoading state to consumers', () => {
      const { result } = renderHook(() => useMissions(), { wrapper })
      expect(result.current).toHaveProperty('agentsLoading')
      expect(typeof result.current.agentsLoading).toBe('boolean')
    })
  })
})
