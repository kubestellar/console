/**
 * Kubectl error classifier.
 *
 * Extracted from preflightCheck.ts as part of the checks/ split (tracked by #15790).
 */
import type { PreflightError } from './types'

/**
 * Classify stderr/stdout from a kubectl command into a structured error code.
 *
 * The classifier checks patterns in priority order — more specific patterns
 * (expired certs, RBAC) are checked before generic connectivity errors.
 */
export function classifyKubectlError(
  stderr: string,
  stdout: string,
  exitCode: number,
): PreflightError {
  // #7321 — Guard against undefined/null inputs from cross-realm errors
  // where err.message can be undefined, resulting in the literal string
  // "undefined" being passed here.
  const safeStderr = (stderr && stderr !== 'undefined') ? stderr : ''
  const safeStdout = (stdout && stdout !== 'undefined') ? stdout : ''
  const combined = `${safeStderr} ${safeStdout}`.toLowerCase()

  // --- Missing credentials / kubeconfig ---
  if (
    combined.includes('no configuration has been provided') ||
    combined.includes('kubeconfig') && combined.includes('not found') ||
    combined.includes('stat') && combined.includes('.kube/config') && combined.includes('no such file') ||
    combined.includes('invalid configuration') && combined.includes('no configuration') ||
    combined.includes('the connection to the server localhost:8080 was refused') && !combined.includes('context')
  ) {
    return {
      code: 'MISSING_CREDENTIALS',
      message: 'No Kubernetes credentials found. A kubeconfig file is required to connect to a cluster.',
    }
  }

  // --- Expired credentials / certificates ---
  if (
    combined.includes('certificate has expired') ||
    combined.includes('x509: certificate') && (combined.includes('expired') || combined.includes('not yet valid')) ||
    combined.includes('token has expired') ||
    combined.includes('token is expired') ||
    combined.includes('unable to connect to the server') && combined.includes('tls') && combined.includes('expired') ||
    combined.includes('credentials have expired') ||
    combined.includes('refresh token') && combined.includes('expired')
  ) {
    return {
      code: 'EXPIRED_CREDENTIALS',
      message: 'Kubernetes credentials have expired. You need to re-authenticate with your cluster.',
    }
  }

  // --- RBAC denied ---
  if (
    combined.includes('forbidden') ||
    combined.includes('is forbidden') ||
    combined.includes('cannot') && combined.includes('in the namespace') ||
    combined.includes('user') && combined.includes('cannot') && (combined.includes('get') || combined.includes('list') || combined.includes('create') || combined.includes('delete') || combined.includes('update') || combined.includes('patch')) ||
    (exitCode !== 0 && combined.includes('error from server (forbidden)'))
  ) {
    // Try to extract verb and resource from the error message
    const details: Record<string, unknown> = {}

    // Pattern: "User "xxx" cannot <verb> resource "<resource>" in API group "<group>"
    const rbacMatch = combined.match(
      /cannot\s+(get|list|create|delete|update|patch|watch)\s+resource\s+"([^"]+)"\s+in\s+api\s+group\s+"([^"]*)"/i
    )
    if (rbacMatch) {
      details.verb = rbacMatch[1]
      details.resource = rbacMatch[2]
      details.apiGroup = rbacMatch[3] || 'core'
    }

    // Pattern: "User "xxx" cannot <verb> <resource> in the namespace "xxx"
    const nsMatch = combined.match(
      /cannot\s+(get|list|create|delete|update|patch|watch)\s+(\S+)\s+in\s+the\s+namespace\s+"([^"]+)"/i
    )
    if (nsMatch && !rbacMatch) {
      details.verb = nsMatch[1]
      details.resource = nsMatch[2]
      details.namespace = nsMatch[3]
    }

    return {
      code: 'RBAC_DENIED',
      message: 'Your Kubernetes user does not have permission to perform the required operations.',
      details: Object.keys(details).length > 0 ? details : undefined,
    }
  }

  // --- Context not found ---
  if (
    combined.includes('context') && combined.includes('not found') ||
    combined.includes('context') && combined.includes('does not exist') ||
    combined.includes('no context exists with the name') ||
    combined.includes('error: context') && combined.includes('not found')
  ) {
    // Try to extract the context name
    const ctxMatch = combined.match(/context\s+"([^"]+)"\s+(?:not found|does not exist)/i)
    return {
      code: 'CONTEXT_NOT_FOUND',
      message: ctxMatch
        ? `Kubernetes context "${ctxMatch[1]}" was not found in your kubeconfig.`
        : 'The specified Kubernetes context was not found in your kubeconfig.',
      details: ctxMatch ? { requestedContext: ctxMatch[1] } : undefined,
    }
  }

  // --- Cluster unreachable (network/DNS/TLS) ---
  if (
    combined.includes('connection refused') ||
    combined.includes('was refused') ||
    combined.includes('no such host') ||
    combined.includes('i/o timeout') ||
    combined.includes('dial tcp') && combined.includes('timeout') ||
    combined.includes('unable to connect to the server') ||
    combined.includes('tls handshake timeout') ||
    combined.includes('net/http: tls handshake timeout') ||
    combined.includes('context deadline exceeded') ||
    combined.includes('the server was unable to return a response') ||
    combined.includes('eof') && combined.includes('connect')
  ) {
    return {
      code: 'CLUSTER_UNREACHABLE',
      message: 'Unable to reach the Kubernetes cluster. This may be a network, DNS, or firewall issue.',
    }
  }

  // --- Fallback ---
  return {
    code: 'UNKNOWN_EXECUTION_FAILURE',
    message: safeStderr.trim() || safeStdout.trim() || 'An unknown error occurred while checking cluster access.',
  }
}
