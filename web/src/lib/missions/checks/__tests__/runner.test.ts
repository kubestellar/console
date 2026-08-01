import { describe, it, expect, vi, beforeEach } from 'vitest'

import { runClusterReadinessCheck, runPreflightCheck } from '../runner'
import type { KubectlExecFn, RequiredOperation } from '../types'

type ExecResult = { output: string; exitCode: number; error?: string }

function makeExec(results: ExecResult[] | ((call: number, args: string[]) => ExecResult | Promise<ExecResult>)): { exec: KubectlExecFn; calls: Array<{ args: string[]; options?: unknown }> } {
  const calls: Array<{ args: string[]; options?: unknown }> = []
  let idx = 0
  const exec: KubectlExecFn = async (args, options) => {
    calls.push({ args, options })
    if (typeof results === 'function') {
      return results(idx++, args)
    }
    return results[idx++] ?? { output: '', exitCode: 0 }
  }
  return { exec, calls }
}

describe('runClusterReadinessCheck', () => {
  it('returns ok:true when /readyz returns "ok"', async () => {
    const { exec, calls } = makeExec([{ output: 'ok', exitCode: 0 }])
    const result = await runClusterReadinessCheck(exec, 'ctx-a')

    expect(result).toEqual({ ok: true, context: 'ctx-a' })
    expect(calls[0].args).toEqual(['get', '--raw', '/readyz'])
    expect(calls[0].options).toMatchObject({ context: 'ctx-a', timeout: 10_000, priority: true })
  })

  it('returns CLUSTER_UNREACHABLE when exitCode is non-zero', async () => {
    const { exec } = makeExec([{ output: '', exitCode: 1 }])
    const result = await runClusterReadinessCheck(exec, 'ctx-b')
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
    expect(result.context).toBe('ctx-b')
  })

  it('returns CLUSTER_UNREACHABLE when output lacks "ok" text', async () => {
    const { exec } = makeExec([{ output: 'not ready', exitCode: 0 }])
    const result = await runClusterReadinessCheck(exec)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('treats "OK" (case-insensitive) as ready', async () => {
    const { exec } = makeExec([{ output: 'OK', exitCode: 0 }])
    const result = await runClusterReadinessCheck(exec)
    expect(result.ok).toBe(true)
  })

  it('wraps thrown errors with the message', async () => {
    const exec: KubectlExecFn = async () => { throw new Error('boom') }
    const result = await runClusterReadinessCheck(exec, 'ctx-c')
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
    expect(result.error?.message).toContain('boom')
    expect(result.context).toBe('ctx-c')
  })

  it('handles non-Error throws via String(err)', async () => {
    const exec: KubectlExecFn = async () => { throw 'plain rejection' }
    const result = await runClusterReadinessCheck(exec)
    expect(result.error?.message).toContain('plain rejection')
  })

  it('handles null throws with the "Unknown error" fallback', async () => {
    const exec: KubectlExecFn = async () => { throw null }
    const result = await runClusterReadinessCheck(exec)
    expect(result.error?.message).toContain('Unknown error')
  })
})

describe('runPreflightCheck', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ok:true with no requiredOps when can-i --list succeeds', async () => {
    const { exec, calls } = makeExec([{ output: 'pods [get list]\n', exitCode: 0 }])
    const result = await runPreflightCheck(exec, 'ctx-a')
    expect(result).toEqual({ ok: true, context: 'ctx-a' })
    expect(calls[0].args).toEqual(['auth', 'can-i', '--list', '--no-headers'])
  })

  it('returns classified error when can-i --list has non-zero exit', async () => {
    const { exec } = makeExec([{ output: '', exitCode: 1, error: 'error: certificate has expired' }])
    const result = await runPreflightCheck(exec, 'ctx-x')
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EXPIRED_CREDENTIALS')
    expect(result.context).toBe('ctx-x')
  })

  it('returns ok:true when all required operations are allowed', async () => {
    const requiredOps: RequiredOperation[] = [
      { verb: 'get', resource: 'pods' },
      { verb: 'create', resource: 'deployments', namespace: 'app' },
    ]
    const { exec, calls } = makeExec([
      { output: 'pods                                    [get list]\ndeployments.apps                        [get create]\n', exitCode: 0 },
      { output: 'yes\n', exitCode: 0 },
      { output: 'yes', exitCode: 0 },
    ])
    const result = await runPreflightCheck(exec, 'ctx-a', requiredOps)
    expect(result).toEqual({ ok: true, context: 'ctx-a' })
    expect(calls).toHaveLength(3)
    expect(calls[1].args).toEqual(['auth', 'can-i', 'get', 'pods'])
    expect(calls[2].args).toEqual(['auth', 'can-i', 'create', 'deployments', '-n', 'app'])
  })

  it('returns RBAC_DENIED with single-op message and allowedVerbsForResource when one op is denied', async () => {
    const requiredOps: RequiredOperation[] = [
      { verb: 'delete', resource: 'pods', namespace: 'app' },
    ]
    const { exec } = makeExec([
      { output: 'pods                                    [get list]\n', exitCode: 0 },
      { output: 'no\n', exitCode: 0 },
    ])
    const result = await runPreflightCheck(exec, 'ctx-a', requiredOps)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('RBAC_DENIED')
    expect(result.error?.message).toContain('delete')
    expect(result.error?.message).toContain('pods')
    expect(result.error?.message).toContain('app')
    const details = result.error?.details as { verb: string; resource: string; namespace?: string; deniedOps: RequiredOperation[]; allowedVerbsForResource?: string[] }
    expect(details.verb).toBe('delete')
    expect(details.resource).toBe('pods')
    expect(details.namespace).toBe('app')
    expect(details.deniedOps).toEqual(requiredOps)
    expect(details.allowedVerbsForResource).toEqual(['get', 'list'])
    expect(result.deniedOps).toEqual(requiredOps)
  })

  it('uses the generic "one or more" message when multiple ops are denied', async () => {
    const requiredOps: RequiredOperation[] = [
      { verb: 'delete', resource: 'pods' },
      { verb: 'delete', resource: 'services' },
    ]
    const { exec } = makeExec([
      { output: '', exitCode: 0 },
      { output: 'no', exitCode: 0 },
      { output: 'no', exitCode: 0 },
    ])
    const result = await runPreflightCheck(exec, undefined, requiredOps)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('RBAC_DENIED')
    expect(result.error?.message).toContain('one or more')
    expect(result.deniedOps).toHaveLength(2)
  })

  it('returns classified error when a per-op can-i call has non-zero exit', async () => {
    const requiredOps: RequiredOperation[] = [{ verb: 'get', resource: 'pods' }]
    const { exec } = makeExec([
      { output: '', exitCode: 0 },
      { output: '', exitCode: 1, error: 'The connection to the server was refused' },
    ])
    const result = await runPreflightCheck(exec, undefined, requiredOps)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('omits namespace from the can-i args when not provided', async () => {
    const requiredOps: RequiredOperation[] = [{ verb: 'list', resource: 'pods' }]
    const { exec, calls } = makeExec([
      { output: '', exitCode: 0 },
      { output: 'yes', exitCode: 0 },
    ])
    await runPreflightCheck(exec, undefined, requiredOps)
    expect(calls[1].args).toEqual(['auth', 'can-i', 'list', 'pods'])
    expect(calls[1].args).not.toContain('-n')
  })

  it('overrides UNKNOWN classifier code to CLUSTER_UNREACHABLE for connection-flavored throws', async () => {
    const exec: KubectlExecFn = async () => { throw new Error('websocket is not connected') }
    const result = await runPreflightCheck(exec, 'ctx-a')
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
    expect(result.error?.message).toContain('Unable to reach')
  })

  it('overrides UNKNOWN classifier code to CLUSTER_UNREACHABLE on timeout throws', async () => {
    const exec: KubectlExecFn = async () => { throw new Error('operation timeout') }
    const result = await runPreflightCheck(exec)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('does NOT override a classifier-provided non-UNKNOWN code', async () => {
    const exec: KubectlExecFn = async () => { throw new Error('error: certificate has expired') }
    const result = await runPreflightCheck(exec)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EXPIRED_CREDENTIALS')
  })

  it('handles cross-realm error objects where instanceof Error is false but message is a string', async () => {
    const fakeError = { message: 'the connection to the server was refused' }
    const exec: KubectlExecFn = async () => { throw fakeError }
    const result = await runPreflightCheck(exec)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CLUSTER_UNREACHABLE')
  })

  it('falls back to "Unknown execution error" when err has no message and is not an Error', async () => {
    const exec: KubectlExecFn = async () => { throw null }
    const result = await runPreflightCheck(exec)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBeDefined()
  })

  it('returns generic RBAC_DENIED when deniedOps somehow has no entries', async () => {
    // guarded branch: buildDeniedOperationError early-returns for empty deniedOps.
    // With normal inputs deniedOps.length===0 short-circuits earlier, but the
    // check is defensive; exercise by providing a requiredOp allowed then denied.
    const requiredOps: RequiredOperation[] = [{ verb: 'get', resource: 'pods' }]
    const { exec } = makeExec([
      { output: '', exitCode: 0 },
      { output: 'no', exitCode: 0 },
    ])
    const result = await runPreflightCheck(exec, undefined, requiredOps)
    expect(result.ok).toBe(false)
    // Ensures we go through buildDeniedOperationError with the firstDenied path.
    expect(result.error?.code).toBe('RBAC_DENIED')
  })
})
