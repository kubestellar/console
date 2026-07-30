  it('sends conversation history in the payload', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Simulate an assistant response
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: 'Here is help', done: true },
      })
    })

    // Send a follow-up
    const sendCallsBefore = MockWebSocket.lastInstance!.send.mock.calls.length
    await act(async () => {
      result.current.sendMessage(missionId, 'thanks, now do X')
    })

    const newCalls = MockWebSocket.lastInstance!.send.mock.calls.slice(sendCallsBefore)
    const chatCall = newCalls.find((call: string[]) => JSON.parse(call[0]).type === 'chat')
    expect(chatCall).toBeDefined()
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.history).toBeDefined()
    expect(payload.history.length).toBeGreaterThan(0)
    // History should include both user and assistant messages
    expect(payload.history.some((h: { role: string }) => h.role === 'user')).toBe(true)
  })

  it('transitions mission to running when sending a follow-up', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Complete first turn
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('waiting_input')

    // Send follow-up
    act(() => {
      result.current.sendMessage(missionId, 'continue')
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('running')
  })

  it('sendMessage fails gracefully when connection fails', async () => {
    vi.mocked(getDemoMode).mockReturnValue(false)
    const missionId = seedMission({ status: 'waiting_input' })
    const { result } = renderHook(() => useMissions(), { wrapper })

    // sendMessage will call ensureConnection, which creates a WS
    act(() => {
      result.current.sendMessage(missionId, 'follow-up')
    })

    // Simulate connection error
    await act(async () => {
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateError()
      await Promise.resolve()
    })

    await waitFor(() => {
      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('failed')
    })
  })

// ── Stream gap detection (tool use) ──────────────────────────────────────────

describe('stream gap detection', () => {
  it('creates a new assistant message bubble after an 8+ second gap', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      let missionId = ''
      act(() => {
        missionId = result.current.startMission(defaultParams)
      })
      await act(async () => { await Promise.resolve() })
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

      const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
        (call: string[]) => JSON.parse(call[0]).type === 'chat',
      )
      const requestId = chatCall ? JSON.parse(chatCall[0]).id : ''

      // First chunk
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: 'First part', done: false },
        })
      })

      // Advance past the gap threshold (8 seconds)
      act(() => { vi.advanceTimersByTime(9000) })

      // Second chunk after gap
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: 'After tool use', done: false },
        })
      })

      const mission = result.current.missions.find(m => m.id === missionId)
      const assistantMsgs = mission?.messages.filter(m => m.role === 'assistant') ?? []
      // Should have two separate message bubbles
      expect(assistantMsgs.length).toBe(2)
      expect(assistantMsgs[0].content).toBe('First part')
      expect(assistantMsgs[1].content).toBe('After tool use')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── Preflight check ──────────────────────────────────────────────────────────

describe('preflight check', () => {
  it('blocks mission when preflight check fails', async () => {
    const { runPreflightCheck, runClusterReadinessCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runClusterReadinessCheck).mockResolvedValueOnce({ ok: true })
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'MISSING_CREDENTIALS', message: 'No kubeconfig found' },
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({ ...defaultParams, cluster: 'my-cluster', type: 'deploy' })
    })
    await flushMissionPreflightChain()

    const mission = result.current.missions[0]
    expect(mission.status).toBe('blocked')
    expect(mission.preflightError?.code).toBe('MISSING_CREDENTIALS')
    // PreflightFailure component renders the error; no duplicate system message (#13464)
    expect(emitMissionError).toHaveBeenCalledWith('deploy', 'MISSING_CREDENTIALS', expect.anything())
  })

  it('blocks mission when preflight throws unexpectedly (#5846)', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockRejectedValueOnce(new Error('Preflight crash'))

    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission({ ...defaultParams, cluster: 'my-cluster', type: 'repair' })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    // Should be blocked (fail-closed) — not proceed to WS connection (#5846)
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('blocked')
  })

  it('continues AI cluster creation missions when local tools are missing', async () => {
    const { runPreflightCheck, runToolPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockClear()
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'MISSING_TOOLS',
        message: 'Required tools not found: kubectl, helm',
        details: { missingTools: ['kubectl', 'helm'] },
      },
      tools: [],
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'deploy',
        description: 'AI-guided cluster creation across any provider',
        context: {
          allowMissingLocalTools: true,
          skipClusterPreflight: true,
        },
      })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    const mission = result.current.missions[0]
    expect(mission.status).not.toBe('blocked')
    expect(mission.messages.some(m => m.content.includes('Tool availability warning'))).toBe(true)
    expect(runPreflightCheck).not.toHaveBeenCalled()
    expect(MockWebSocket.lastInstance).not.toBeNull()
  })

  it('blocks AI-assisted missions when the prompt requires missing optional tools', async () => {
    const { runPreflightCheck, runToolPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockClear()
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'MISSING_TOOLS',
        message: 'Required tools not found: gh, helm',
        details: { missingTools: ['gh', 'helm'] },
      },
      tools: [],
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'deploy',
        initialPrompt: 'Use gh to open the pull request and helm to install the release.',
        context: {
          allowMissingLocalTools: true,
          skipClusterPreflight: true,
        },
      })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    const mission = result.current.missions[0]
    expect(runToolPreflightCheck).toHaveBeenCalledWith(
      'http://localhost:8585',
      expect.arrayContaining(['gh', 'helm']),
      expect.any(Function),
    )
    expect(mission.status).toBe('blocked')
    expect(mission.preflightError?.message).toContain('installed locally before it can run')
    expect(runPreflightCheck).not.toHaveBeenCalled()
    expect(MockWebSocket.lastInstance).toBeNull()
  })

  it('retryPreflight transitions blocked mission back to pending', async () => {
    // First, create a blocked mission
    const { runPreflightCheck, runClusterReadinessCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runClusterReadinessCheck).mockResolvedValueOnce({ ok: true })
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'EXPIRED_CREDENTIALS', message: 'Token expired' },
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission({ ...defaultParams, cluster: 'my-cluster', type: 'deploy' })
    })
    await flushMissionPreflightChain()
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('blocked')

    // Now retry — mock success
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({ ok: true })

    act(() => { result.current.retryPreflight(missionId) })

    // Should be pending while checking
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('pending')
    expect(result.current.missions.find(m => m.id === missionId)?.currentStep).toBe('Re-running preflight check...')

    // Let the retry resolve
    await flushMissionPreflightChain()

    // Should now have a system message about preflight passing
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.messages.some(m => m.content.includes('Preflight check passed'))).toBe(true)
  })

  it('retryPreflight re-blocks when still failing', async () => {
    const { runPreflightCheck, runClusterReadinessCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runClusterReadinessCheck).mockResolvedValueOnce({ ok: true })
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'RBAC_DENIED', message: 'No permissions' },
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission({ ...defaultParams, cluster: 'c', type: 'deploy' })
    })
    await flushMissionPreflightChain()

    // Retry, still failing
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'RBAC_DENIED', message: 'Still no permissions' },
    })

    act(() => { result.current.retryPreflight(missionId) })
    await flushMissionPreflightChain()

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('blocked')
    // PreflightFailure component renders the error; no duplicate system message (#13464)
    expect(result.current.missions.find(m => m.id === missionId)?.preflightError?.code).toBe('RBAC_DENIED')
  })

  it('retryPreflight is a no-op for non-blocked missions', () => {
    const missionId = seedMission({ status: 'completed' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.retryPreflight(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('completed')
  })
})

// ── Malicious content scanning ───────────────────────────────────────────────

describe('runSavedMission malicious content scan', () => {
})
