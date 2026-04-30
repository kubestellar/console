import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => true),
  isDemoModeForced: false,
  useDemoMode: () => ({ isDemoMode: true }),
}))

vi.mock('../../lib/demoMode', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, getDemoMode: vi.fn(() => true), isDemoMode: vi.fn(() => true) }
})

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'kc-auth-token', LOCAL_AGENT_HTTP_URL: 'http://localhost:4201' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual }
})

vi.mock('../mcp/shared', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, agentFetch: vi.fn() }
})

const mod = await import('../useUsers')
const {
  agentAuthHeaders,
  getDemoConsoleUsers,
  getDemoUserManagementSummary,
} = mod.__testables

beforeEach(() => {
  localStorage.clear()
})

describe('agentAuthHeaders', () => {
  it('returns empty object when no token', () => {
    expect(agentAuthHeaders()).toEqual({})
  })

  it('returns Authorization header when token exists', () => {
    localStorage.setItem('kc-auth-token', 'my-jwt-token')
    const headers = agentAuthHeaders()
    expect(headers.Authorization).toBe('Bearer my-jwt-token')
  })
})

describe('getDemoConsoleUsers', () => {
  it('returns a non-empty array', () => {
    const users = getDemoConsoleUsers()
    expect(users.length).toBeGreaterThan(0)
  })

  it('each user has required fields', () => {
    for (const user of getDemoConsoleUsers()) {
      expect(typeof user.id).toBe('string')
      expect(typeof user.github_login).toBe('string')
      expect(typeof user.email).toBe('string')
      expect(typeof user.role).toBe('string')
      expect(typeof user.onboarded).toBe('boolean')
      expect(typeof user.created_at).toBe('string')
      expect(typeof user.last_login).toBe('string')
    }
  })

  it('includes admin role', () => {
    const admins = getDemoConsoleUsers().filter(u => u.role === 'admin')
    expect(admins.length).toBeGreaterThan(0)
  })

  it('includes editor role', () => {
    const editors = getDemoConsoleUsers().filter(u => u.role === 'editor')
    expect(editors.length).toBeGreaterThan(0)
  })

  it('includes viewer role', () => {
    const viewers = getDemoConsoleUsers().filter(u => u.role === 'viewer')
    expect(viewers.length).toBeGreaterThan(0)
  })

  it('created_at dates are valid ISO dates', () => {
    for (const user of getDemoConsoleUsers()) {
      expect(new Date(user.created_at).getTime()).not.toBeNaN()
    }
  })
})

describe('getDemoUserManagementSummary', () => {
  it('returns a summary with consoleUsers', () => {
    const summary = getDemoUserManagementSummary()
    expect(summary.consoleUsers.total).toBeGreaterThan(0)
    expect(summary.consoleUsers.admins).toBeGreaterThan(0)
  })

  it('user counts add up to total', () => {
    const { consoleUsers } = getDemoUserManagementSummary()
    expect(consoleUsers.admins + consoleUsers.editors + consoleUsers.viewers).toBe(consoleUsers.total)
  })

  it('has k8sServiceAccounts info', () => {
    const summary = getDemoUserManagementSummary()
    expect(summary.k8sServiceAccounts.total).toBeGreaterThan(0)
    expect(summary.k8sServiceAccounts.clusters.length).toBeGreaterThan(0)
  })

  it('has currentUserPermissions for multiple clusters', () => {
    const summary = getDemoUserManagementSummary()
    expect(summary.currentUserPermissions.length).toBeGreaterThan(0)
    for (const perm of summary.currentUserPermissions) {
      expect(typeof perm.cluster).toBe('string')
      expect(typeof perm.isClusterAdmin).toBe('boolean')
    }
  })
})
