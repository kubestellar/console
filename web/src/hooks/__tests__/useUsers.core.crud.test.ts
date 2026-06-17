import './useUsers.core.test.setup'

describe('useConsoleUsers', () => {
  it('fetches users from API on mount and returns them', async () => {
    const apiUsers = [
      {
        id: '1',
        github_id: '111',
        github_login: 'alice',
        email: 'alice@co.com',
        role: 'admin',
        onboarded: true,
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        github_id: '222',
        github_login: 'bob',
        role: 'viewer',
        onboarded: false,
        created_at: '2024-02-01T00:00:00Z',
      },
    ]
    mockGet.mockResolvedValue({ data: apiUsers })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual(apiUsers)
    expect(result.current.error).toBeNull()
    expect(result.current.isRefreshing).toBe(false)
    expect(mockGet).toHaveBeenCalledWith('/api/users')
  })

  it('returns demo data when demo mode is on (no API call)', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
    const logins = result.current.users.map((u) => u.github_login)
    expect(logins).toContain('admin-user')
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('sets error message on API failure and empties users', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
    expect(result.current.error).toBe('Network error')
  })

  it('handles non-Error rejection (string message)', async () => {
    mockGet.mockRejectedValue('server down')

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Failed to load users')
  })

  it('handles null data from API gracefully', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('updateUserRole calls PUT and updates local state', async () => {
    const users = [
      {
        id: 'u1',
        github_id: '111',
        github_login: 'alice',
        role: 'viewer' as const,
        onboarded: true,
        created_at: '2024-01-01',
      },
    ]
    mockGet.mockResolvedValue({ data: users })
    mockPut.mockResolvedValue({ data: {} })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      const ok = await result.current.updateUserRole('u1', 'admin')
      expect(ok).toBe(true)
    })

    expect(mockPut).toHaveBeenCalledWith('/api/users/u1/role', {
      role: 'admin',
    })
    expect(result.current.users[0].role).toBe('admin')
  })

  it('deleteUser calls DELETE and removes user from local state', async () => {
    const users = [
      {
        id: 'u1',
        github_id: '1',
        github_login: 'a',
        role: 'viewer' as const,
        onboarded: true,
        created_at: '2024-01-01',
      },
      {
        id: 'u2',
        github_id: '2',
        github_login: 'b',
        role: 'editor' as const,
        onboarded: true,
        created_at: '2024-01-01',
      },
    ]
    mockGet.mockResolvedValue({ data: users })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.users).toHaveLength(2)

    await act(async () => {
      const ok = await result.current.deleteUser('u1')
      expect(ok).toBe(true)
    })

    expect(mockDelete).toHaveBeenCalledWith('/api/users/u1')
    expect(result.current.users).toHaveLength(1)
    expect(result.current.users[0].id).toBe('u2')
  })

  it('refetch reloads data from the API', async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        {
          id: '1',
          github_id: '1',
          github_login: 'a',
          role: 'viewer',
          onboarded: true,
          created_at: '2024-01-01',
        },
      ],
    })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.users).toHaveLength(1)

    mockGet.mockResolvedValueOnce({
      data: [
        {
          id: '1',
          github_id: '1',
          github_login: 'a',
          role: 'viewer',
          onboarded: true,
          created_at: '2024-01-01',
        },
        {
          id: '2',
          github_id: '2',
          github_login: 'b',
          role: 'admin',
          onboarded: true,
          created_at: '2024-02-01',
        },
      ],
    })

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.users).toHaveLength(2)
  })
})

// =========================================================================
// useUserManagementSummary
// =========================================================================

describe('useUserManagementSummary', () => {
  it('fetches summary from API and returns it', async () => {
    const summaryData = {
      consoleUsers: { total: 10, admins: 2, editors: 5, viewers: 3 },
      k8sServiceAccounts: { total: 20, clusters: ['c1', 'c2'] },
      currentUserPermissions: [
        {
          cluster: 'c1',
          isClusterAdmin: true,
          canCreateServiceAccounts: true,
          canManageRBAC: true,
          canViewSecrets: true,
        },
      ],
    }
    mockGet.mockResolvedValue({ data: summaryData })

    const { useUserManagementSummary } = await getHooks()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.summary).toEqual(summaryData)
    expect(result.current.error).toBeNull()
    expect(mockGet).toHaveBeenCalledWith('/api/users/summary')
  })

  it('returns demo data in demo mode without calling API', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const { useUserManagementSummary } = await getHooks()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.summary).not.toBeNull()
    expect(result.current.summary!.consoleUsers.total).toBe(4)
    expect(result.current.summary!.consoleUsers.admins).toBe(1)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('falls back to demo data on API error', async () => {
    mockGet.mockRejectedValue(new Error('Server error'))

    const { useUserManagementSummary } = await getHooks()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.summary).not.toBeNull()
    expect(result.current.summary!.consoleUsers.total).toBe(4)
  })

  it('refetch reloads summary', async () => {
    const summaryData = {
      consoleUsers: { total: 5, admins: 1, editors: 2, viewers: 2 },
      k8sServiceAccounts: { total: 8, clusters: ['c1'] },
      currentUserPermissions: [],
    }
    mockGet.mockResolvedValue({ data: summaryData })

    const { useUserManagementSummary } = await getHooks()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const updatedSummary = {
      ...summaryData,
      consoleUsers: { ...summaryData.consoleUsers, total: 15 },
    }
    mockGet.mockResolvedValue({ data: updatedSummary })

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.summary!.consoleUsers.total).toBe(15)
  })
})
