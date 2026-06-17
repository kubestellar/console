import './useUsers.core.test.setup'

describe('useK8sRoles', () => {
  it('fetches roles for a cluster', async () => {
    const roles = [
      { name: 'admin', cluster: 'prod', isCluster: true, ruleCount: 5 },
      {
        name: 'view',
        namespace: 'default',
        cluster: 'prod',
        isCluster: false,
        ruleCount: 3,
      },
    ]
    mockGet.mockResolvedValue({ data: roles })

    const { useK8sRoles } = await getHooks()
    const { result } = renderHook(() => useK8sRoles('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.roles).toEqual(roles)
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/rbac/roles?cluster=prod'),
      expect.anything(),
    )
  })

  it('does not fetch when cluster is empty string', async () => {
    const { useK8sRoles } = await getHooks()
    const { result } = renderHook(() => useK8sRoles(''))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.roles).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('includes namespace and includeSystem in query params', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { useK8sRoles } = await getHooks()
    renderHook(() => useK8sRoles('prod', 'kube-system', true))

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringMatching(/namespace=kube-system.*includeSystem=true/),
        expect.anything(),
      ),
    )
  })

  it('silently fails on API error', async () => {
    mockGet.mockRejectedValue(new Error('500'))

    const { useK8sRoles } = await getHooks()
    const { result } = renderHook(() => useK8sRoles('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.roles).toEqual([])
  })

  it('handles null data from API', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useK8sRoles } = await getHooks()
    const { result } = renderHook(() => useK8sRoles('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.roles).toEqual([])
  })
})

// =========================================================================
// useK8sRoleBindings
// =========================================================================

describe('useK8sRoleBindings', () => {
  it('fetches bindings for a cluster', async () => {
    const bindings = [
      {
        name: 'admin-binding',
        cluster: 'prod',
        isCluster: true,
        roleName: 'cluster-admin',
        roleKind: 'ClusterRole',
        subjects: [{ kind: 'User' as const, name: 'alice' }],
      },
    ]
    mockGet.mockResolvedValue({ data: bindings })

    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.bindings).toEqual(bindings)
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/rbac/bindings?cluster=prod'),
      expect.anything(),
    )
  })

  it('does not fetch when cluster is empty string', async () => {
    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings(''))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.bindings).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('includes namespace and includeSystem params', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { useK8sRoleBindings } = await getHooks()
    renderHook(() => useK8sRoleBindings('c1', 'ns1', true))

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringMatching(/namespace=ns1.*includeSystem=true/),
        expect.anything(),
      ),
    )
  })

  it('silently fails on API error', async () => {
    mockGet.mockRejectedValue(new Error('forbidden'))

    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.bindings).toEqual([])
  })

  it('createRoleBinding POSTs to kc-agent and refetches', async () => {
    // #7993 Phase 1.5 PR A: createRoleBinding routes through kc-agent
    // (POST ${LOCAL_AGENT_HTTP_URL}/rolebindings) so the mutation runs under
    // the user's kubeconfig, not the backend pod SA.
    const initialBindings = [
      {
        name: 'existing',
        cluster: 'prod',
        isCluster: false,
        roleName: 'view',
        roleKind: 'Role',
        subjects: [],
      },
    ]
    mockGet
      .mockResolvedValueOnce({ data: initialBindings })
      .mockResolvedValueOnce({
        data: [
          ...initialBindings,
          {
            name: 'new-binding',
            cluster: 'prod',
            isCluster: false,
            roleName: 'edit',
            roleKind: 'Role',
            subjects: [{ kind: 'User', name: 'bob' }],
          },
        ],
      })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings).toHaveLength(1)

    await act(async () => {
      const ok = await result.current.createRoleBinding({
        name: 'new-binding',
        cluster: 'prod',
        isCluster: false,
        roleName: 'edit',
        roleKind: 'Role',
        subjectKind: 'User',
        subjectName: 'bob',
      })
      expect(ok).toBe(true)
    })

    expect(fetchSpy).toHaveBeenCalled()
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(callUrl).toContain('/rolebindings')

    await waitFor(() => expect(result.current.bindings).toHaveLength(2))
  })

  it('handles null data from API', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.bindings).toEqual([])
  })
})
