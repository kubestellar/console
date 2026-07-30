/**
 * Preflight runner — cluster readiness and RBAC permission checks.
 *
 * Extracted from preflightCheck.ts as part of the checks/ split (tracked by #15790).
 */
import type { KubectlExecFn, PreflightError, PreflightResult, RequiredOperation } from './types'
import { classifyKubectlError } from './classifier'

/**
 * Verify that the Kubernetes API server is fully ready (not just accepting connections).
 * Probes the /readyz endpoint to detect half-up clusters.
 */
export async function runClusterReadinessCheck(
  kubectlExec: KubectlExecFn,
  context?: string,
): Promise<PreflightResult> {
  try {
    const args = ['get', '--raw', '/readyz']
    const result = await kubectlExec(args, { context, timeout: 10_000, priority: true })
    if (result.exitCode !== 0 || !(result.output || '').toLowerCase().includes('ok')) {
      return {
        ok: false,
        error: {
          code: 'CLUSTER_UNREACHABLE',
          message: 'The Kubernetes API server is not fully ready. It may still be starting up. Wait for the cluster to be fully ready before deploying.',
        },
        context,
      }
    }
    return { ok: true, context }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err ?? 'Unknown error')
    return {
      ok: false,
      error: {
        code: 'CLUSTER_UNREACHABLE',
        message: `Failed to verify cluster readiness: ${message}`,
      },
      context,
    }
  }
}

interface AllowedPermission {
  resource: string
  verbs: string[]
}

function parseBracketedItems(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return []
  }

  return trimmed
    .slice(1, -1)
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function parseAllowedPermissions(output: string): AllowedPermission[] {
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const columns = line.split(/\s{2,}/).map(column => column.trim()).filter(Boolean)
      if (columns.length < 2) {
        return null
      }

      const resource = columns[0]
      const verbs = parseBracketedItems(columns[columns.length - 1])
      if (!resource || verbs.length === 0) {
        return null
      }

      return { resource, verbs }
    })
    .filter((entry): entry is AllowedPermission => entry !== null)
}

function buildDeniedOperationError(
  deniedOps: RequiredOperation[],
  allowedPermissions: AllowedPermission[],
): PreflightError {
  const firstDenied = deniedOps[0]
  if (!firstDenied) {
    return {
      code: 'RBAC_DENIED',
      message: 'Your Kubernetes user does not have permission to perform the required operations.',
    }
  }

  const matchingPermission = allowedPermissions.find(permission => permission.resource === firstDenied.resource)

  return {
    code: 'RBAC_DENIED',
    message: deniedOps.length === 1
      ? `Your Kubernetes user does not have permission to ${firstDenied.verb} ${firstDenied.resource}${firstDenied.namespace ? ` in namespace "${firstDenied.namespace}"` : ''}.`
      : 'Your Kubernetes user does not have permission to perform one or more required mission operations.',
    details: {
      verb: firstDenied.verb,
      resource: firstDenied.resource,
      namespace: firstDenied.namespace,
      deniedOps,
      allowedVerbsForResource: matchingPermission?.verbs,
    },
  }
}

/**
 * Run a preflight permission check against a cluster context.
 *
 * Executes `kubectl auth can-i --list` to verify the agent has access to the
 * cluster. When mission-specific operations are provided, each one is validated
 * with `kubectl auth can-i <verb> <resource> [-n <namespace>]`.
 *
 * @param kubectlExec - Function to execute kubectl commands (typically kubectlProxy.exec)
 * @param context     - Optional cluster context to check
 * @param requiredOps - Optional mission-specific operations that must be allowed
 */
export async function runPreflightCheck(
  kubectlExec: KubectlExecFn,
  context?: string,
  requiredOps?: RequiredOperation[],
): Promise<PreflightResult> {
  try {
    const args = ['auth', 'can-i', '--list', '--no-headers']
    const result = await kubectlExec(args, {
      context,
      timeout: 10_000,
      priority: true,
    })

    if (result.exitCode !== 0) {
      const error = classifyKubectlError(
        result.error || '',
        result.output || '',
        result.exitCode,
      )
      return { ok: false, error, context }
    }

    if (!requiredOps || requiredOps.length === 0) {
      return { ok: true, context }
    }

    const allowedPermissions = parseAllowedPermissions(result.output || '')
    const deniedOps: RequiredOperation[] = []

    for (const requiredOp of requiredOps) {
      const canIArgs = ['auth', 'can-i', requiredOp.verb, requiredOp.resource]
      if (requiredOp.namespace) {
        canIArgs.push('-n', requiredOp.namespace)
      }

      const permissionResult = await kubectlExec(canIArgs, {
        context,
        timeout: 10_000,
        priority: true,
      })

      if (permissionResult.exitCode !== 0) {
        const error = classifyKubectlError(
          permissionResult.error || '',
          permissionResult.output || '',
          permissionResult.exitCode,
        )
        return { ok: false, error, context }
      }

      if ((permissionResult.output || '').trim().toLowerCase() !== 'yes') {
        deniedOps.push(requiredOp)
      }
    }

    if (deniedOps.length > 0) {
      return {
        ok: false,
        error: buildDeniedOperationError(deniedOps, allowedPermissions),
        context,
        deniedOps,
      }
    }

    return { ok: true, context }
  } catch (err: unknown) {
    // Connection-level failures (WebSocket down, agent unavailable)
    // #7317 — Guard against cross-realm Error objects where instanceof fails
    // and err.message may be undefined, resulting in the string "undefined"
    // being passed to classifyKubectlError.
    const errObj = err as { message?: unknown }
    const message = typeof errObj?.message === 'string' && errObj.message
      ? errObj.message
      : err instanceof Error ? err.message : String(err ?? 'Unknown execution error')

    // Classify the error message itself
    const error = classifyKubectlError(message, '', 1)

    // If the classifier returned UNKNOWN but we know it's a connection issue,
    // override to CLUSTER_UNREACHABLE
    const lowerMessage = message.toLowerCase()
    if (
      error.code === 'UNKNOWN_EXECUTION_FAILURE' &&
      (lowerMessage.includes('not connected') ||
        lowerMessage.includes('connection') ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('unavailable'))
    ) {
      return {
        ok: false,
        error: {
          code: 'CLUSTER_UNREACHABLE',
          message: 'Unable to reach the local agent or Kubernetes cluster.',
        },
        context,
      }
    }

    return { ok: false, error, context }
  }
}
