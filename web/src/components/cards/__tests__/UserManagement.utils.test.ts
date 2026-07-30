import { describe, expect, it } from 'vitest'

import type { OpenShiftUser } from '../../../types/users'
import {
  MAX_VISIBLE_GROUPS,
  OPENSHIFT_USER_COMPARATORS,
  SA_COMPARATORS,
  USER_MANAGEMENT_TABS,
  getConsoleUserSortOptions,
  getOpenShiftUserSortOptions,
  getRoleBadgeClass,
  getSASortOptions,
} from '../UserManagement.utils'
import type { ServiceAccount } from '../UserManagement.types'

const makeT = () => (key: string) => `t(${key})`

const makeOSUser = (overrides: Partial<OpenShiftUser> = {}): OpenShiftUser =>
  ({
    name: 'user',
    fullName: '',
    kind: 'User',
    ...overrides,
  }) as OpenShiftUser

const makeSA = (overrides: Partial<ServiceAccount> = {}): ServiceAccount => ({
  name: 'sa',
  namespace: 'default',
  cluster: 'c1',
  ...overrides,
})

describe('UserManagement.utils — constants', () => {
  it('exposes MAX_VISIBLE_GROUPS = 3', () => {
    expect(MAX_VISIBLE_GROUPS).toBe(3)
  })

  it('lists the three canonical tabs in expected order', () => {
    expect(USER_MANAGEMENT_TABS).toEqual(['clusterUsers', 'serviceAccounts', 'console'])
  })
})

describe('getConsoleUserSortOptions', () => {
  it('returns exactly three sort options in fixed order', () => {
    const opts = getConsoleUserSortOptions(makeT())
    expect(opts.map((o) => o.value)).toEqual(['name', 'role', 'email'])
  })

  it('uses the translator for each label', () => {
    const opts = getConsoleUserSortOptions(makeT())
    expect(opts.map((o) => o.label)).toEqual([
      't(common:common.name)',
      't(common:common.role)',
      't(userManagement.email)',
    ])
  })

  it('invokes the translator once per option', () => {
    const calls: string[] = []
    getConsoleUserSortOptions((k) => {
      calls.push(k)
      return k
    })
    expect(calls).toEqual(['common:common.name', 'common:common.role', 'userManagement.email'])
  })
})

describe('getOpenShiftUserSortOptions', () => {
  it('returns two sort options: name and kind', () => {
    const opts = getOpenShiftUserSortOptions(makeT())
    expect(opts.map((o) => o.value)).toEqual(['name', 'kind'])
  })

  it('labels kind as fullName (kind is repurposed as fullName sort)', () => {
    const opts = getOpenShiftUserSortOptions(makeT())
    expect(opts[1]).toEqual({ value: 'kind', label: 't(userManagement.fullName)' })
  })

  it('labels name as username', () => {
    const opts = getOpenShiftUserSortOptions(makeT())
    expect(opts[0]).toEqual({ value: 'name', label: 't(userManagement.username)' })
  })
})

describe('getSASortOptions', () => {
  it('returns two sort options in fixed order', () => {
    const opts = getSASortOptions(makeT())
    expect(opts.map((o) => o.value)).toEqual(['name', 'namespace'])
  })

  it('uses common translation keys for labels', () => {
    const opts = getSASortOptions(makeT())
    expect(opts.map((o) => o.label)).toEqual([
      't(common:common.name)',
      't(common:common.namespace)',
    ])
  })
})

describe('OPENSHIFT_USER_COMPARATORS', () => {
  describe('name', () => {
    const cmp = OPENSHIFT_USER_COMPARATORS.name

    it('returns negative when a.name < b.name', () => {
      expect(cmp(makeOSUser({ name: 'alice' }), makeOSUser({ name: 'bob' }))).toBeLessThan(0)
    })

    it('returns positive when a.name > b.name', () => {
      expect(cmp(makeOSUser({ name: 'zoe' }), makeOSUser({ name: 'bob' }))).toBeGreaterThan(0)
    })

    it('returns 0 for equal names', () => {
      expect(cmp(makeOSUser({ name: 'x' }), makeOSUser({ name: 'x' }))).toBe(0)
    })

    it('treats missing/empty names as empty strings without throwing', () => {
      expect(() =>
        cmp(makeOSUser({ name: undefined as unknown as string }), makeOSUser({ name: 'a' })),
      ).not.toThrow()
    })
  })

  describe('kind (sorts by fullName)', () => {
    const cmp = OPENSHIFT_USER_COMPARATORS.kind

    it('compares by fullName not kind', () => {
      const a = makeOSUser({ name: 'a', fullName: 'Zed Zed', kind: 'User' })
      const b = makeOSUser({ name: 'b', fullName: 'Aaron Aaron', kind: 'User' })
      expect(cmp(a, b)).toBeGreaterThan(0)
    })

    it('treats missing fullName as empty string', () => {
      const a = makeOSUser({ fullName: undefined })
      const b = makeOSUser({ fullName: 'Bob' })
      expect(cmp(a, b)).toBeLessThan(0)
    })

    it('returns 0 when both fullNames are missing', () => {
      const a = makeOSUser({ fullName: undefined })
      const b = makeOSUser({ fullName: undefined })
      expect(cmp(a, b)).toBe(0)
    })

    it('sorts a list of users by fullName ascending', () => {
      const users = [
        makeOSUser({ fullName: 'Charlie' }),
        makeOSUser({ fullName: 'Alice' }),
        makeOSUser({ fullName: 'Bob' }),
      ]
      const sorted = [...users].sort(cmp).map((u) => u.fullName)
      expect(sorted).toEqual(['Alice', 'Bob', 'Charlie'])
    })
  })
})

describe('SA_COMPARATORS', () => {
  describe('name', () => {
    const cmp = SA_COMPARATORS.name

    it('sorts alphabetically ascending', () => {
      const sas = [makeSA({ name: 'zoo' }), makeSA({ name: 'ant' }), makeSA({ name: 'bee' })]
      expect(sas.sort(cmp).map((s) => s.name)).toEqual(['ant', 'bee', 'zoo'])
    })

    it('returns 0 for equal names', () => {
      expect(cmp(makeSA({ name: 'a' }), makeSA({ name: 'a' }))).toBe(0)
    })
  })

  describe('namespace', () => {
    const cmp = SA_COMPARATORS.namespace

    it('sorts alphabetically by namespace', () => {
      const sas = [
        makeSA({ namespace: 'kube-system' }),
        makeSA({ namespace: 'default' }),
        makeSA({ namespace: 'argocd' }),
      ]
      expect(sas.sort(cmp).map((s) => s.namespace)).toEqual(['argocd', 'default', 'kube-system'])
    })

    it('ignores name when comparing namespaces', () => {
      const a = makeSA({ name: 'z', namespace: 'a' })
      const b = makeSA({ name: 'a', namespace: 'b' })
      expect(cmp(a, b)).toBeLessThan(0)
    })
  })
})

describe('getRoleBadgeClass', () => {
  it('returns purple classes for admin', () => {
    const cls = getRoleBadgeClass('admin')
    expect(cls).toContain('purple-500/20')
    expect(cls).toContain('text-purple-400')
    expect(cls).toContain('border-purple-500/30')
  })

  it('returns blue classes for editor', () => {
    const cls = getRoleBadgeClass('editor')
    expect(cls).toContain('blue-500/20')
    expect(cls).toContain('text-blue-400')
    expect(cls).toContain('border-blue-500/30')
  })

  it('returns muted/gray classes for viewer (default)', () => {
    const cls = getRoleBadgeClass('viewer')
    expect(cls).toContain('bg-gray-500/20')
    expect(cls).toContain('dark:bg-gray-400/20')
    expect(cls).toContain('text-muted-foreground')
  })

  it('returns default class for any unrecognized role', () => {
    const cls = getRoleBadgeClass('unknown' as never)
    expect(cls).toContain('text-muted-foreground')
    expect(cls).not.toContain('purple')
    expect(cls).not.toContain('blue')
  })

  it('returns distinct classes for admin, editor, and default', () => {
    const admin = getRoleBadgeClass('admin')
    const editor = getRoleBadgeClass('editor')
    const viewer = getRoleBadgeClass('viewer')
    expect(new Set([admin, editor, viewer]).size).toBe(3)
  })
})
