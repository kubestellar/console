import './useUsers.core.test.setup'

describe('useOpenShiftUsers', () => {
  it('fetches OpenShift users for a cluster', async () => {
    const osUsers = [
      {
        name: 'admin',
        fullName: 'Admin',
        identities: ['htpasswd:admin'],
        groups: [],
        cluster: 'prod',
      },
      { name: 'dev', cluster: 'prod' },
    ]
    mockGet.mockResolvedValue({ data: osUsers })

    const { useOpenShiftUsers } = await getHooks()
    const { result } = renderHook(() => useOpenShiftUsers('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual(osUsers)
    expect(mockGet).toHaveBeenCalledWith('/api/openshift/users?cluster=prod')
  })

  it('returns empty array when no cluster is provided', async () => {
    const { useOpenShiftUsers } = await getHooks()
    const { result } = renderHook(() => useOpenShiftUsers(undefined))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('falls back to demo data on API error', async () => {
    mockGet.mockRejectedValue(new Error('Connection refused'))

    const { useOpenShiftUsers } = await getHooks()
    const { result } = renderHook(() => useOpenShiftUsers('staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users.length).toBeGreaterThan(0)
    expect(result.current.users[0].cluster).toBe('staging')
  })

  it('handles null data from API', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useOpenShiftUsers } = await getHooks()
    const { result } = renderHook(() => useOpenShiftUsers('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
  })

  it('clears users when cluster changes to undefined', async () => {
    mockGet.mockResolvedValue({
      data: [{ name: 'admin', cluster: 'c1' }],
    })

    const { useOpenShiftUsers } = await getHooks()
    const { result, rerender } = renderHook(
      ({ cluster }: { cluster?: string }) => useOpenShiftUsers(cluster),
      { initialProps: { cluster: 'c1' } },
    )

    await waitFor(() => expect(result.current.users).toHaveLength(1))

    rerender({ cluster: undefined })

    await waitFor(() => expect(result.current.users).toEqual([]))
  })
})

// =========================================================================
// useAllOpenShiftUsers
// =========================================================================

describe('useAllOpenShiftUsers', () => {
  it('fetches users from all clusters and aggregates them', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('cluster=c1')) {
        return Promise.resolve({
          data: [{ name: 'admin', cluster: 'c1' }],
        })
      }
      if (url.includes('cluster=c2')) {
        return Promise.resolve({
          data: [{ name: 'dev', cluster: 'c2' }],
        })
      }
      return Promise.resolve({ data: [] })
    })

    const { useAllOpenShiftUsers } = await getHooks()
    const clusters = [{ name: 'c1' }, { name: 'c2' }]
    const { result } = renderHook(() => useAllOpenShiftUsers(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toHaveLength(2)
    expect(result.current.failedClusters).toEqual([])
  })

  it('returns empty when clusters array is empty', async () => {
    const { useAllOpenShiftUsers } = await getHooks()
    // Use stable reference to avoid infinite re-renders
    const { result } = renderHook(() => useAllOpenShiftUsers(EMPTY_CLUSTERS))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
  })

  it('marks failed clusters and adds demo data for them', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('cluster=good')) {
        return Promise.resolve({
          data: [{ name: 'real-user', cluster: 'good' }],
        })
      }
      if (url.includes('cluster=bad')) {
        return Promise.reject(new Error('unreachable'))
      }
      return Promise.resolve({ data: [] })
    })

    const { useAllOpenShiftUsers } = await getHooks()
    const clusters = [{ name: 'good' }, { name: 'bad' }]
    const { result } = renderHook(() => useAllOpenShiftUsers(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users.length).toBeGreaterThan(1)
    expect(result.current.failedClusters).toContain('bad')
  })

  it('handles null data from API for a cluster', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useAllOpenShiftUsers } = await getHooks()
    const clusters = [{ name: 'c1' }]
    const { result } = renderHook(() => useAllOpenShiftUsers(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
    expect(result.current.failedClusters).toEqual([])
  })
})

// =========================================================================
// useK8sUsers
// =========================================================================

describe('useK8sUsers', () => {
  it('fetches K8s users for a cluster', async () => {
    const k8sUsers = [
      { kind: 'User' as const, name: 'alice', cluster: 'prod' },
      {
        kind: 'ServiceAccount' as const,
        name: 'default',
        namespace: 'kube-system',
        cluster: 'prod',
      },
    ]
    mockGet.mockResolvedValue({ data: k8sUsers })

    const { useK8sUsers } = await getHooks()
    const { result } = renderHook(() => useK8sUsers('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual(k8sUsers)
    expect(mockGet).toHaveBeenCalledWith('/api/rbac/users?cluster=prod')
  })

  it('does nothing when cluster is undefined', async () => {
    const { useK8sUsers } = await getHooks()
    const { result } = renderHook(() => useK8sUsers(undefined))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.users).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('silently fails on API error', async () => {
    mockGet.mockRejectedValue(new Error('timeout'))

    const { useK8sUsers } = await getHooks()
    const { result } = renderHook(() => useK8sUsers('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
  })

  it('handles null data from API', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useK8sUsers } = await getHooks()
    const { result } = renderHook(() => useK8sUsers('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
  })
})

// =========================================================================
// useK8sServiceAccounts
// =========================================================================

describe('useK8sServiceAccounts', () => {
  it('fetches service accounts for a cluster', async () => {
    const sas = [
      { name: 'default', namespace: 'default', cluster: 'prod', roles: ['view'] },
      {
        name: 'prometheus',
        namespace: 'monitoring',
        cluster: 'prod',
        roles: ['cluster-view'],
      },
    ]
    mockGet.mockResolvedValue({ data: sas })

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toEqual(sas)
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/rbac/service-accounts?'),
      expect.objectContaining({ timeout: 60000 }),
    )
  })

  it('returns empty array when no cluster is provided', async () => {
    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts(undefined))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toEqual([])
    expect(result.current.error).toBeNull()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('falls back to demo data on API error', async () => {
    mockGet.mockRejectedValue(new Error('connection refused'))

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
    expect(result.current.serviceAccounts[0].cluster).toBe('staging')
  })

  it('sets specific error for unreachable clusters', async () => {
    mockGet.mockRejectedValue(new Error('connection refused'))

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('bad-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toContain('not reachable')
  })

  it('includes namespace in query params when provided', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { useK8sServiceAccounts } = await getHooks()
    renderHook(() => useK8sServiceAccounts('prod', 'monitoring'))

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('namespace=monitoring'),
        expect.anything(),
      ),
    )
  })

  it('createServiceAccount POSTs to kc-agent and appends to local state', async () => {
    // #7993 Phase 1.5 PR A: createServiceAccount routes through kc-agent
    // (POST ${LOCAL_AGENT_HTTP_URL}/serviceaccounts) so the mutation runs
    // under the user's kubeconfig, not the backend pod SA. The old
    // api.post('/api/rbac/service-accounts', ...) call is gone.
    mockGet.mockResolvedValue({ data: [] })
    const newSA = { name: 'new-sa', namespace: 'default', cluster: 'prod' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(newSA), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      const created = await result.current.createServiceAccount({
        name: 'new-sa',
        namespace: 'default',
        cluster: 'prod',
      })
      expect(created).toEqual(newSA)
    })

    expect(fetchSpy).toHaveBeenCalled()
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(callUrl).toContain('/serviceaccounts')
    expect(result.current.serviceAccounts).toHaveLength(1)
    expect(result.current.serviceAccounts[0].name).toBe('new-sa')
  })

  it('handles null data from API', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toEqual([])
  })

  it('filters demo data by namespace on fallback', async () => {
    mockGet.mockRejectedValue(new Error('fail'))

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('c1', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    result.current.serviceAccounts.forEach((sa) => {
      expect(sa.namespace).toBe('monitoring')
    })
  })
})

// =========================================================================
// useAllK8sServiceAccounts
// =========================================================================

describe('useAllK8sServiceAccounts', () => {
  it('fetches service accounts from all clusters', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('cluster=c1')) {
        return Promise.resolve({
          data: [{ name: 'sa1', namespace: 'default', cluster: 'c1' }],
        })
      }
      if (url.includes('cluster=c2')) {
        return Promise.resolve({
          data: [{ name: 'sa2', namespace: 'kube-system', cluster: 'c2' }],
        })
      }
      return Promise.resolve({ data: [] })
    })

    const { useAllK8sServiceAccounts } = await getHooks()
    const clusters = [{ name: 'c1' }, { name: 'c2' }]
    const { result } = renderHook(() => useAllK8sServiceAccounts(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toHaveLength(2)
    expect(result.current.failedClusters).toEqual([])
  })

  it('returns empty when clusters array is empty', async () => {
    const { useAllK8sServiceAccounts } = await getHooks()
    // Use stable reference to avoid infinite re-renders
    const { result } = renderHook(() => useAllK8sServiceAccounts(EMPTY_CLUSTERS))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toEqual([])
  })

  it('marks failed clusters and provides demo fallback', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('cluster=ok')) {
        return Promise.resolve({
          data: [{ name: 'sa-real', namespace: 'ns', cluster: 'ok' }],
        })
      }
      if (url.includes('cluster=fail')) {
        return Promise.reject(new Error('timeout'))
      }
      return Promise.resolve({ data: [] })
    })

    const { useAllK8sServiceAccounts } = await getHooks()
    const clusters = [{ name: 'ok' }, { name: 'fail' }]
    const { result } = renderHook(() => useAllK8sServiceAccounts(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.failedClusters).toContain('fail')
    expect(result.current.serviceAccounts.length).toBeGreaterThan(1)
  })

  it('handles null data from API for a cluster', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useAllK8sServiceAccounts } = await getHooks()
    const clusters = [{ name: 'c1' }]
    const { result } = renderHook(() => useAllK8sServiceAccounts(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toEqual([])
    expect(result.current.failedClusters).toEqual([])
  })
})
