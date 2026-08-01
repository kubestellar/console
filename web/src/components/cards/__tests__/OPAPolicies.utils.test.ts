import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mockKubectlExec = vi.fn()
vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockKubectlExec(...args) },
}))

import {
  OPA_LIST_TIMEOUT_MS,
  MIN_POLICY_PATH_PARTS,
  checkState,
  generateDemoStatuses,
  checkGatekeeperInstalled,
  checkGatekeeperDetails,
  createSortComparators,
  runClusterChecks,
} from '../OPAPolicies.utils'
import type { GatekeeperStatus, OPAClusterItem } from '../opa'

// ─── Constants ───────────────────────────────────────────────────────────────

describe('OPAPolicies.utils constants', () => {
  it('OPA_LIST_TIMEOUT_MS is 25 seconds', () => {
    expect(OPA_LIST_TIMEOUT_MS).toBe(25_000)
  })

  it('MIN_POLICY_PATH_PARTS is 4', () => {
    expect(MIN_POLICY_PATH_PARTS).toBe(4)
  })
})

// ─── checkState ──────────────────────────────────────────────────────────────

describe('checkState module-level state', () => {
  beforeEach(() => {
    checkState.inProgress = false
    checkState.checkedClusters.clear()
  })

  it('initialises with inProgress=false and no checked clusters', () => {
    expect(checkState.inProgress).toBe(false)
    expect(checkState.checkedClusters.size).toBe(0)
  })

  it('records cluster names in the Set', () => {
    checkState.checkedClusters.add('kind-hub')
    expect(checkState.checkedClusters.has('kind-hub')).toBe(true)
    expect(checkState.checkedClusters.size).toBe(1)
  })
})

// ─── generateDemoStatuses ────────────────────────────────────────────────────

describe('generateDemoStatuses', () => {
  it('returns three demo clusters keyed by name', () => {
    const result = generateDemoStatuses()
    expect(Object.keys(result).sort()).toEqual(['kind-hub', 'kind-worker1', 'kind-worker2'])
  })

  it('reports each demo cluster as installed with 3 policies', () => {
    const result = generateDemoStatuses()
    for (const name of Object.keys(result)) {
      const status = result[name]
      expect(status.cluster).toBe(name)
      expect(status.installed).toBe(true)
      expect(status.loading).toBe(false)
      expect(status.policyCount).toBe(3)
      expect(status.policies).toHaveLength(3)
      expect(status.mode).toBe('warn')
      expect(status.modes).toEqual(['warn', 'enforce'])
      expect(status.violations).toEqual([])
    }
  })

  it('generates violation counts within 0..4 (Math.random * 5 → floor)', () => {
    const result = generateDemoStatuses()
    for (const name of Object.keys(result)) {
      const v = result[name].violationCount ?? 0
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(4)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('includes stable policy kinds/names in each cluster', () => {
    const result = generateDemoStatuses()
    const kinds = result['kind-hub'].policies!.map(p => p.kind)
    expect(kinds).toEqual([
      'K8sRequiredLabels',
      'K8sAllowedRepos',
      'K8sRequireResourceLimits',
    ])
  })
})

// ─── checkGatekeeperInstalled ────────────────────────────────────────────────

describe('checkGatekeeperInstalled', () => {
  beforeEach(() => {
    mockKubectlExec.mockReset()
  })

  it('returns installed=true when namespace output includes gatekeeper-system', async () => {
    mockKubectlExec.mockResolvedValueOnce({ output: 'namespace/gatekeeper-system\n', error: '' })
    const status = await checkGatekeeperInstalled('c1')
    expect(status).toEqual({ cluster: 'c1', installed: true, loading: true })
    expect(mockKubectlExec).toHaveBeenCalledWith(
      ['get', 'namespace', 'gatekeeper-system', '--ignore-not-found', '-o', 'name'],
      { context: 'c1', timeout: OPA_LIST_TIMEOUT_MS, priority: true }
    )
  })

  it('returns installed=false when namespace output is empty', async () => {
    mockKubectlExec.mockResolvedValueOnce({ output: '', error: '' })
    const status = await checkGatekeeperInstalled('c2')
    expect(status).toEqual({ cluster: 'c2', installed: false, loading: false })
  })

  it('returns installed=false when kubectl throws', async () => {
    mockKubectlExec.mockRejectedValueOnce(new Error('boom'))
    const status = await checkGatekeeperInstalled('c3')
    expect(status).toEqual({
      cluster: 'c3',
      installed: false,
      loading: false,
      error: 'Connection failed',
    })
  })
})

// ─── checkGatekeeperDetails ──────────────────────────────────────────────────

describe('checkGatekeeperDetails', () => {
  beforeEach(() => {
    mockKubectlExec.mockReset()
  })

  it('parses constraints and normalises deny → enforce', async () => {
    // constraints call: 3 policies (warn, dryrun, deny→enforce)
    mockKubectlExec.mockResolvedValueOnce({
      output:
        'require-labels K8sRequiredLabels warn 0\n' +
        'allowed-repos  K8sAllowedRepos  dryrun 0\n' +
        'block-priv     K8sBlockPrivileged deny 0\n',
      error: '',
    })
    const status = await checkGatekeeperDetails('c1')
    expect(status.installed).toBe(true)
    expect(status.loading).toBe(false)
    expect(status.policyCount).toBe(3)
    expect(status.violationCount).toBe(0)
    // Enforce is most restrictive → primary mode
    expect(status.mode).toBe('enforce')
    // Active modes include the normalised set
    expect(new Set(status.modes)).toEqual(new Set(['warn', 'dryrun', 'enforce']))
    // deny normalised to enforce on the policy itself
    const priv = status.policies!.find(p => p.name === 'block-priv')!
    expect(priv.mode).toBe('enforce')
    expect(status.violations).toEqual([])
    // Only the constraints call was made (no violations to fetch)
    expect(mockKubectlExec).toHaveBeenCalledTimes(1)
  })

  it('picks dryrun as primary when only warn+dryrun are active', async () => {
    mockKubectlExec.mockResolvedValueOnce({
      output: 'a K1 warn 0\nb K2 dryrun 0\n',
      error: '',
    })
    const status = await checkGatekeeperDetails('c1')
    expect(status.mode).toBe('dryrun')
  })

  it('falls back to warn primary when no modes recognised (empty output)', async () => {
    mockKubectlExec.mockResolvedValueOnce({ output: '', error: '' })
    const status = await checkGatekeeperDetails('c1')
    expect(status).toEqual({
      cluster: 'c1',
      installed: true,
      loading: false,
      policyCount: 0,
      violationCount: 0,
      mode: 'warn',
      modes: [],
      policies: [],
      violations: [],
    })
  })

  it('skips malformed lines with fewer than MIN_POLICY_PATH_PARTS fields', async () => {
    mockKubectlExec.mockResolvedValueOnce({
      output: 'short line\ngood K1 warn 0\n',
      error: '',
    })
    const status = await checkGatekeeperDetails('c1')
    expect(status.policyCount).toBe(1)
    expect(status.policies![0].name).toBe('good')
  })

  it('fetches sample violations for the first policy with violations', async () => {
    mockKubectlExec
      // constraints
      .mockResolvedValueOnce({
        output: 'require-labels K8sRequiredLabels enforce 2\n',
        error: '',
      })
      // violations JSON stream (two objects concatenated as Gatekeeper does)
      .mockResolvedValueOnce({
        output:
          '{"name":"pod-a","namespace":"ns1","kind":"Pod","message":"missing label"}' +
          ' {"name":"pod-b","namespace":"ns2","kind":"Pod","message":"missing label"}',
        error: '',
      })

    const status = await checkGatekeeperDetails('c1')
    expect(status.violationCount).toBe(2)
    expect(status.violations).toHaveLength(2)
    expect(status.violations![0]).toEqual({
      name: 'pod-a',
      namespace: 'ns1',
      kind: 'Pod',
      policy: 'require-labels',
      message: 'missing label',
      severity: 'critical', // enforce → critical
    })
    // violations kubectl call used lower-cased kind + policy name
    const secondCall = mockKubectlExec.mock.calls[1]
    expect(secondCall[0]).toEqual([
      'get', 'k8srequiredlabels', 'require-labels',
      '-o', 'jsonpath={.status.violations[*]}',
    ])
  })

  it('marks warning severity when policy mode is warn', async () => {
    mockKubectlExec
      .mockResolvedValueOnce({
        output: 'p1 K1 warn 1\n',
        error: '',
      })
      .mockResolvedValueOnce({
        output: '{"name":"x","namespace":"ns","kind":"Pod","message":"m"}',
        error: '',
      })
    const status = await checkGatekeeperDetails('c1')
    expect(status.violations![0].severity).toBe('warning')
  })

  it('applies safe defaults when violation JSON lacks fields', async () => {
    mockKubectlExec
      .mockResolvedValueOnce({ output: 'p1 K1 enforce 1\n', error: '' })
      .mockResolvedValueOnce({ output: '{}', error: '' })
    const status = await checkGatekeeperDetails('c1')
    expect(status.violations![0]).toMatchObject({
      name: 'Unknown',
      namespace: 'default',
      kind: 'Resource',
      message: 'Policy violation',
    })
  })

  it('caps sample violations at 20', async () => {
    const objs = Array.from({ length: 30 }, (_, i) =>
      `{"name":"pod${i}","namespace":"ns","kind":"Pod","message":"m"}`
    ).join(' ')
    mockKubectlExec
      .mockResolvedValueOnce({ output: 'p1 K1 enforce 30\n', error: '' })
      .mockResolvedValueOnce({ output: objs, error: '' })
    const status = await checkGatekeeperDetails('c1')
    expect(status.violations).toHaveLength(20)
  })

  it('swallows malformed violation JSON without throwing', async () => {
    mockKubectlExec
      .mockResolvedValueOnce({ output: 'p1 K1 enforce 1\n', error: '' })
      .mockResolvedValueOnce({ output: 'not-json{{', error: '' })
    const status = await checkGatekeeperDetails('c1')
    // Constraints still counted; violations array is empty (parse failed)
    expect(status.policyCount).toBe(1)
    expect(status.violationCount).toBe(1)
    expect(status.violations).toEqual([])
  })

  it('returns installed=true zero-state when constraints call fails', async () => {
    // The `.catch()` swallows the first failure and yields empty output.
    mockKubectlExec.mockRejectedValueOnce(new Error('unreachable'))
    const status = await checkGatekeeperDetails('c1')
    expect(status).toEqual({
      cluster: 'c1',
      installed: true,
      loading: false,
      policyCount: 0,
      violationCount: 0,
      mode: 'warn',
      modes: [],
      policies: [],
      violations: [],
    })
  })

  it('returns error zero-state when an unexpected throw escapes the try block', async () => {
    // Force the outer catch by making both the exec and the internal parsing throw:
    // stubbing kubectlProxy.exec to throw synchronously bypasses the inner .catch(...)
    mockKubectlExec.mockImplementationOnce(() => { throw new Error('sync-boom') })
    const status = await checkGatekeeperDetails('c1')
    expect(status).toEqual({
      cluster: 'c1',
      installed: true,
      loading: false,
      policyCount: 0,
      violationCount: 0,
    })
  })
})

// ─── createSortComparators ───────────────────────────────────────────────────

describe('createSortComparators', () => {
  const item = (name: string): OPAClusterItem => ({ name, cluster: name })

  it('sorts by cluster name alphabetically', () => {
    const cmp = createSortComparators({}).name
    const items = [item('b'), item('a'), item('c')].sort(cmp)
    expect(items.map(i => i.name)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by violation count using the statuses map', () => {
    const statuses: Record<string, GatekeeperStatus> = {
      a: { cluster: 'a', installed: true, loading: false, violationCount: 5 },
      b: { cluster: 'b', installed: true, loading: false, violationCount: 1 },
      c: { cluster: 'c', installed: true, loading: false, violationCount: 3 },
    }
    const cmp = createSortComparators(statuses).violations
    const sorted = [item('a'), item('b'), item('c')].sort(cmp)
    expect(sorted.map(i => i.name)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by policy count and treats missing statuses as 0', () => {
    const statuses: Record<string, GatekeeperStatus> = {
      a: { cluster: 'a', installed: true, loading: false, policyCount: 4 },
      b: { cluster: 'b', installed: true, loading: false, policyCount: 2 },
      // c: missing entirely — should sort as 0
    }
    const cmp = createSortComparators(statuses).policies
    const sorted = [item('a'), item('b'), item('c')].sort(cmp)
    expect(sorted.map(i => i.name)).toEqual(['c', 'b', 'a'])
  })
})

// ─── runClusterChecks ────────────────────────────────────────────────────────

describe('runClusterChecks early-return guards', () => {
  const makeCtx = () => {
    const isCheckingRef = { current: false }
    const setStatuses = vi.fn()
    const setIsRefreshing = vi.fn()
    const setOpaClustersChecked = vi.fn()
    const setOpaTotalClusters = vi.fn()
    const setLastRefresh = vi.fn()
    return {
      isCheckingRef,
      setStatuses,
      setIsRefreshing,
      setOpaClustersChecked,
      setOpaTotalClusters,
      setLastRefresh,
    }
  }

  beforeEach(() => {
    mockKubectlExec.mockReset()
    checkState.inProgress = false
    checkState.checkedClusters.clear()
  })

  afterEach(() => {
    checkState.inProgress = false
    checkState.checkedClusters.clear()
  })

  it('returns immediately when no clusters supplied', async () => {
    const ctx = makeCtx()
    await runClusterChecks(
      [], false, false, ctx.isCheckingRef,
      ctx.setStatuses, ctx.setIsRefreshing,
      ctx.setOpaClustersChecked, ctx.setOpaTotalClusters, ctx.setLastRefresh,
    )
    expect(mockKubectlExec).not.toHaveBeenCalled()
    expect(ctx.setIsRefreshing).not.toHaveBeenCalled()
    expect(ctx.setStatuses).not.toHaveBeenCalled()
  })

  it('short-circuits demo mode: clears refreshing and skips kubectl', async () => {
    const ctx = makeCtx()
    await runClusterChecks(
      [{ name: 'c1' }], false, /* shouldUseDemoData */ true, ctx.isCheckingRef,
      ctx.setStatuses, ctx.setIsRefreshing,
      ctx.setOpaClustersChecked, ctx.setOpaTotalClusters, ctx.setLastRefresh,
    )
    expect(mockKubectlExec).not.toHaveBeenCalled()
    expect(ctx.setIsRefreshing).toHaveBeenCalledWith(false)
    expect(ctx.setStatuses).not.toHaveBeenCalled()
  })

  it('skips when already checking and forceCheck is false', async () => {
    const ctx = makeCtx()
    ctx.isCheckingRef.current = true
    await runClusterChecks(
      [{ name: 'c1' }], false, false, ctx.isCheckingRef,
      ctx.setStatuses, ctx.setIsRefreshing,
      ctx.setOpaClustersChecked, ctx.setOpaTotalClusters, ctx.setLastRefresh,
    )
    expect(mockKubectlExec).not.toHaveBeenCalled()
    expect(ctx.setStatuses).not.toHaveBeenCalled()
  })

  it('skips when module checkState.inProgress and forceCheck is false', async () => {
    const ctx = makeCtx()
    checkState.inProgress = true
    await runClusterChecks(
      [{ name: 'c1' }], false, false, ctx.isCheckingRef,
      ctx.setStatuses, ctx.setIsRefreshing,
      ctx.setOpaClustersChecked, ctx.setOpaTotalClusters, ctx.setLastRefresh,
    )
    expect(mockKubectlExec).not.toHaveBeenCalled()
  })

  it('skips when every cluster is already in checkedClusters and !forceCheck', async () => {
    const ctx = makeCtx()
    checkState.checkedClusters.add('c1')
    checkState.checkedClusters.add('c2')
    await runClusterChecks(
      [{ name: 'c1' }, { name: 'c2' }], false, false, ctx.isCheckingRef,
      ctx.setStatuses, ctx.setIsRefreshing,
      ctx.setOpaClustersChecked, ctx.setOpaTotalClusters, ctx.setLastRefresh,
    )
    expect(mockKubectlExec).not.toHaveBeenCalled()
    expect(ctx.setStatuses).not.toHaveBeenCalled()
  })
})

describe('runClusterChecks two-phase execution', () => {
  const makeCtx = () => ({
    isCheckingRef: { current: false },
    setStatuses: vi.fn(),
    setIsRefreshing: vi.fn(),
    setOpaClustersChecked: vi.fn(),
    setOpaTotalClusters: vi.fn(),
    setLastRefresh: vi.fn(),
  })

  beforeEach(() => {
    mockKubectlExec.mockReset()
    checkState.inProgress = false
    checkState.checkedClusters.clear()
  })

  afterEach(() => {
    checkState.inProgress = false
    checkState.checkedClusters.clear()
  })

  it('runs phase-1 for every cluster and phase-2 only for installed ones', async () => {
    // c1 installed, c2 not installed
    mockKubectlExec.mockImplementation((args: string[], opts: { context: string }) => {
      // Phase 1 - namespace check
      if (args[0] === 'get' && args[1] === 'namespace') {
        if (opts.context === 'c1') {
          return Promise.resolve({ output: 'namespace/gatekeeper-system\n', error: '' })
        }
        return Promise.resolve({ output: '', error: '' })
      }
      // Phase 2 - constraints (only c1 should reach here)
      if (args[0] === 'get' && args[1] === 'constraints') {
        return Promise.resolve({ output: 'p1 K1 warn 0\n', error: '' })
      }
      return Promise.resolve({ output: '', error: '' })
    })

    const ctx = makeCtx()
    await runClusterChecks(
      [{ name: 'c1' }, { name: 'c2' }], false, false, ctx.isCheckingRef,
      ctx.setStatuses, ctx.setIsRefreshing,
      ctx.setOpaClustersChecked, ctx.setOpaTotalClusters, ctx.setLastRefresh,
    )

    // Two phase-1 namespace calls + one phase-2 constraints call for c1
    const namespaceCalls = mockKubectlExec.mock.calls.filter(c => c[0][1] === 'namespace')
    const constraintCalls = mockKubectlExec.mock.calls.filter(c => c[0][1] === 'constraints')
    expect(namespaceCalls).toHaveLength(2)
    expect(constraintCalls).toHaveLength(1)
    expect(constraintCalls[0][1].context).toBe('c1')

    // Progress counters wired
    expect(ctx.setOpaTotalClusters).toHaveBeenCalledWith(2)
    expect(ctx.setIsRefreshing).toHaveBeenNthCalledWith(1, true)
    expect(ctx.setIsRefreshing).toHaveBeenLastCalledWith(false)
    expect(ctx.setLastRefresh).toHaveBeenCalledTimes(1)

    // Module state cleaned up in finally
    expect(ctx.isCheckingRef.current).toBe(false)
    expect(checkState.inProgress).toBe(false)
    expect(checkState.checkedClusters.size).toBe(0)
  })

  it('forceCheck bypasses the checkedClusters filter and rechecks all', async () => {
    checkState.checkedClusters.add('c1')
    mockKubectlExec.mockResolvedValue({ output: '', error: '' }) // not installed

    const ctx = makeCtx()
    await runClusterChecks(
      [{ name: 'c1' }], /* forceCheck */ true, false, ctx.isCheckingRef,
      ctx.setStatuses, ctx.setIsRefreshing,
      ctx.setOpaClustersChecked, ctx.setOpaTotalClusters, ctx.setLastRefresh,
    )
    expect(mockKubectlExec).toHaveBeenCalled()
    expect(ctx.setOpaTotalClusters).toHaveBeenCalledWith(1)
  })

  it('cleans up flags even when phase-1 throws for every cluster', async () => {
    mockKubectlExec.mockRejectedValue(new Error('nope'))
    const ctx = makeCtx()
    await runClusterChecks(
      [{ name: 'c1' }], false, false, ctx.isCheckingRef,
      ctx.setStatuses, ctx.setIsRefreshing,
      ctx.setOpaClustersChecked, ctx.setOpaTotalClusters, ctx.setLastRefresh,
    )
    // finally block ran
    expect(ctx.isCheckingRef.current).toBe(false)
    expect(checkState.inProgress).toBe(false)
    expect(checkState.checkedClusters.has('c1')).toBe(false)
    expect(ctx.setIsRefreshing).toHaveBeenLastCalledWith(false)
    expect(ctx.setLastRefresh).toHaveBeenCalledTimes(1)
  })
})
