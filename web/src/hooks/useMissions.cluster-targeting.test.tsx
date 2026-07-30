describe('startMission cluster targeting', () => {
  it('injects single cluster context into the prompt', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.startMission({ ...defaultParams, cluster: 'prod-cluster' })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const prompt = JSON.parse(chatCall![0]).payload.prompt
    expect(prompt).toContain('Target cluster: prod-cluster')
    expect(prompt).toContain('--context=prod-cluster')
  })

  it('injects multi-cluster context into the prompt', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.startMission({ ...defaultParams, cluster: 'cluster-a, cluster-b' })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    const prompt = JSON.parse(chatCall![0]).payload.prompt
    expect(prompt).toContain('Target clusters: cluster-a, cluster-b')
    expect(prompt).toContain('Perform the following on EACH cluster')
  })

  it('auto-loads validated install missions for free-form install prompts', async () => {
    const installer = {
      version: 'kc-mission-v1',
      name: 'install-kuberay',
      title: 'Install KubeRay',
      description: 'Validated install guide',
      type: 'deploy' as const,
      tags: ['kuberay'],
      missionClass: 'install',
      cncfProject: 'kuberay',
      steps: [],
      metadata: { source: 'fixes/cncf-install/install-kuberay.json' },
    }

    missionCache.installers = [installer]
    vi.mocked(fetchMissionContent).mockResolvedValue({
      mission: {
        ...installer,
        steps: [{
          title: 'Install KubeRay operator',
          description: 'Apply the validated KubeRay manifests',
          command: 'kubectl apply -f kuberay.yaml',
        }],
      },
      raw: JSON.stringify(installer),
    })

    const { result } = renderHook(() => useMissions(), { wrapper })

    let missionId = ''
    await act(async () => {
      missionId = result.current.startMission({
        title: 'Install request',
        description: 'User asked to install KubeRay',
        type: 'deploy',
        initialPrompt: 'install kuberay',
        skipReview: true,
      })
    })

    await flushMissionPreflightChain()
    await waitFor(() => {
      expect(MockWebSocket.lastInstance).not.toBeNull()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateOpen()
    })

    const mission = result.current.missions.find(candidate => candidate.id === missionId)
    expect(mission?.messages.some(message => (
      message.role === 'system'
        && message.content.includes('Auto-loaded `install-kuberay.json` from console-kb')
    ))).toBe(true)
    expect(fetchMissionContent).toHaveBeenCalledWith(installer)
  })

  it('adds non-interactive warnings for deploy-type missions', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'deploy',
        title: 'Deploy App',
      })
    })
    const mission = result.current.missions[0]
    const systemMsgs = mission.messages.filter(m => m.role === 'system')
    expect(systemMsgs.some(m => m.content.includes('Non-interactive mode'))).toBe(true)
  })

  it('adds non-interactive warnings for install missions (title heuristic)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'custom',
        title: 'Install Helm Chart',
      })
    })
    const systemMsgs = result.current.missions[0].messages.filter(m => m.role === 'system')
    expect(systemMsgs.some(m => m.content.includes('Non-interactive mode'))).toBe(true)
  })
})

// ── Error classification ─────────────────────────────────────────────────────

describe('error classification', () => {
  it('maps authentication_error code to auth error message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'authentication_error', message: 'Token expired' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.status).toBe('failed')
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('maps no_agent code to agent not available message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'no_agent', message: 'No agent available' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('agent not available'))).toBe(true)
  })

  it('maps agent_unavailable code to agent not available message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'agent_unavailable', message: 'Agent down' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('agent not available'))).toBe(true)
  })

  it('maps mission_timeout code to timeout message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'mission_timeout', message: 'Timed out after 5 minutes' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Mission Timed Out'))).toBe(true)
  })

  it('detects rate limit errors from combined error text (429)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'provider_error', message: 'HTTP 429 too many requests' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from quota keyword', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'quota_exceeded', message: 'quota limit reached' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects auth errors from 401 in message text', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api_error', message: 'received 401 unauthorized' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth errors from invalid_api_key', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'invalid_api_key', message: 'key is invalid' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })
})

// ── Progress tracking ────────────────────────────────────────────────────────

describe('progress tracking', () => {
  it('updates progress percentage from progress messages', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Analyzing...', progress: 50 },
      })
    })

    expect(result.current.missions[0].progress).toBe(50)
  })

  it('tracks token usage from progress messages', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 100, output: 200, total: 300 } },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.tokenUsage).toEqual({ input: 100, output: 200, total: 300 })
  })

  it('updates token usage from result messages', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: {
          content: 'Done',
          agent: 'claude-code',
          sessionId: 'test',
          done: true,
          usage: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
        },
      })
    })

    expect(result.current.missions[0].tokenUsage).toEqual({ input: 500, output: 250, total: 750 })
  })
})

// ── setActiveMission ─────────────────────────────────────────────────────────

