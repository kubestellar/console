import './useUsers.core.test.setup'

describe('useClusterPermissions', () => {
  // #7993 Phase 6: useClusterPermissions now calls kc-agent
  // (LOCAL_AGENT_HTTP_URL/rbac/permissions) directly via fetch instead of
  // routing through the backend's `api.get` wrapper, so SelfSubjectAccessReviews
  // run under the user's kubeconfig instead of the backend pod ServiceAccount.
  // The tests below mock global fetch accordingly.
  const mockFetchOk = (data: unknown) => () =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) }) as unknown as Promise<Response>

  it('fetches permissions for a specific cluster', async () => {
    const perms = {
      cluster: 'prod',
      isClusterAdmin: true,
      canCreateServiceAccounts: true,
      canManageRBAC: true,
      canViewSecrets: true,
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(perms))

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Single object is wrapped in array
    expect(result.current.permissions).toEqual([perms])
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/rbac/permissions?cluster=prod')
  })

  it('fetches all cluster permissions when no cluster specified', async () => {
    const permsArr = [
      {
        cluster: 'c1',
        isClusterAdmin: true,
        canCreateServiceAccounts: true,
        canManageRBAC: true,
        canViewSecrets: true,
      },
      {
        cluster: 'c2',
        isClusterAdmin: false,
        canCreateServiceAccounts: false,
        canManageRBAC: false,
        canViewSecrets: false,
      },
    ]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(permsArr))

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Array stays as array
    expect(result.current.permissions).toEqual(permsArr)
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/rbac/permissions')
    expect(url).not.toContain('?cluster=')
  })

  it('silently fails on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.permissions).toEqual([])
  })

  it('refetch reloads permissions', async () => {
    const perms = {
      cluster: 'c1',
      isClusterAdmin: false,
      canCreateServiceAccounts: false,
      canManageRBAC: false,
      canViewSecrets: false,
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(perms))

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const updatedPerms = { ...perms, isClusterAdmin: true }
    fetchSpy.mockImplementation(mockFetchOk(updatedPerms))

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.permissions[0].isClusterAdmin).toBe(true)
  })
})
