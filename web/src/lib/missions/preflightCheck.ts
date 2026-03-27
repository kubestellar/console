/**
 * Mission Preflight Check
 *
 * Validates Kubernetes cluster access before executing mutating mission steps.
 * Returns structured error codes with remediation guidance so the UI can show
 * targeted help instead of generic failure messages.
 */

// ============================================================================
// Error Taxonomy
// ============================================================================

export type PreflightErrorCode =
  | 'MISSING_CREDENTIALS'
  | 'EXPIRED_CREDENTIALS'
  | 'RBAC_DENIED'
  | 'CONTEXT_NOT_FOUND'
  | 'CLUSTER_UNREACHABLE'
  | 'UNKNOWN_EXECUTION_FAILURE'

export interface PreflightError {
  code: PreflightErrorCode
  message: string
  /** Additional details (e.g., denied verb/resource, available contexts) */
  details?: Record<string, unknown>
}

export interface PreflightResult {
  ok: boolean
  error?: PreflightError
  /** The cluster context that was checked */
  context?: string
}

// ============================================================================
// Error Classification
// ============================================================================

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
  const combined = `${stderr} ${stdout}`.toLowerCase()

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
    message: stderr.trim() || stdout.trim() || 'An unknown error occurred while checking cluster access.',
  }
}

// ============================================================================
// Remediation Guidance
// ============================================================================

export interface RemediationAction {
  label: string
  description: string
  /** If set, render a code block the user can copy */
  codeSnippet?: string
  /** Action type for the UI to render the right control */
  actionType: 'copy' | 'retry' | 'link' | 'info'
  /** URL for link-type actions */
  href?: string
}

/**
 * Return targeted remediation actions for a given preflight error code.
 */
export function getRemediationActions(error: PreflightError, context?: string): RemediationAction[] {
  switch (error.code) {
    case 'MISSING_CREDENTIALS':
      return [
        {
          label: 'Set up kubeconfig',
          description: 'Ensure your kubeconfig file exists at ~/.kube/config or set the KUBECONFIG environment variable.',
          codeSnippet: 'export KUBECONFIG=~/.kube/config',
          actionType: 'copy',
        },
        {
          label: 'Configure cluster access',
          description: 'If using a cloud provider, run the appropriate login command to generate credentials.',
          codeSnippet: context
            ? `# For GKE:\ngcloud container clusters get-credentials <CLUSTER_NAME>\n# For EKS:\naws eks update-kubeconfig --name <CLUSTER_NAME>\n# For AKS:\naz aks get-credentials --resource-group <RG> --name <CLUSTER_NAME>`
            : `kubectl config view`,
          actionType: 'copy',
        },
        {
          label: 'Retry preflight check',
          description: 'After configuring credentials, retry the preflight check.',
          actionType: 'retry',
        },
      ]

    case 'EXPIRED_CREDENTIALS':
      return [
        {
          label: 'Refresh credentials',
          description: 'Your cluster credentials have expired. Re-authenticate with your identity provider.',
          codeSnippet: context
            ? `# Re-authenticate for context: ${context}\nkubectl config use-context ${context}\n# Then run your cloud provider login command`
            : `# Re-run your cloud provider login command\n# For GKE: gcloud auth login && gcloud container clusters get-credentials <CLUSTER>\n# For EKS: aws sso login && aws eks update-kubeconfig --name <CLUSTER>`,
          actionType: 'copy',
        },
        {
          label: 'Retry preflight check',
          description: 'After refreshing credentials, retry the preflight check.',
          actionType: 'retry',
        },
      ]

    case 'RBAC_DENIED': {
      const actions: RemediationAction[] = [
        {
          label: 'Required permissions',
          description: error.details?.verb
            ? `Your user needs "${error.details.verb}" permission on "${error.details.resource}" resources${error.details.apiGroup && error.details.apiGroup !== 'core' ? ` in API group "${error.details.apiGroup}"` : ''}.`
            : 'Your user needs additional RBAC permissions to perform the required operations.',
          actionType: 'info',
        },
      ]

      // Generate a least-privilege RBAC snippet when we have details
      if (error.details?.verb && error.details?.resource) {
        const rbacYaml = generateRBACSnippet(
          error.details.verb as string,
          error.details.resource as string,
          (error.details.apiGroup as string) || '',
          (error.details.namespace as string) || undefined,
        )
        actions.push({
          label: 'Copy RBAC manifest',
          description: 'Apply this ClusterRoleBinding to grant the minimum required permissions.',
          codeSnippet: rbacYaml,
          actionType: 'copy',
        })
      }

      actions.push({
        label: 'Retry preflight check',
        description: 'After updating RBAC permissions, retry the preflight check.',
        actionType: 'retry',
      })

      return actions
    }

    case 'CONTEXT_NOT_FOUND':
      return [
        {
          label: 'List available contexts',
          description: error.details?.requestedContext
            ? `Context "${error.details.requestedContext}" was not found. List available contexts to find the correct one.`
            : 'The specified context was not found. List available contexts to find the correct one.',
          codeSnippet: 'kubectl config get-contexts',
          actionType: 'copy',
        },
        {
          label: 'Retry preflight check',
          description: 'After selecting the correct context, retry the preflight check.',
          actionType: 'retry',
        },
      ]

    case 'CLUSTER_UNREACHABLE':
      return [
        {
          label: 'Check connectivity',
          description: 'Verify network connectivity to the cluster API server.',
          codeSnippet: context
            ? `kubectl --context=${context} cluster-info`
            : 'kubectl cluster-info',
          actionType: 'copy',
        },
        {
          label: 'Check VPN or firewall',
          description: 'If the cluster is behind a VPN or firewall, ensure you are connected and the API server port is accessible.',
          actionType: 'info',
        },
        {
          label: 'Retry preflight check',
          description: 'After resolving connectivity issues, retry the preflight check.',
          actionType: 'retry',
        },
      ]

    case 'UNKNOWN_EXECUTION_FAILURE':
    default:
      return [
        {
          label: 'View error details',
          description: error.message,
          actionType: 'info',
        },
        {
          label: 'Retry preflight check',
          description: 'Try running the preflight check again.',
          actionType: 'retry',
        },
      ]
  }
}

// ============================================================================
// RBAC Snippet Generator
// ============================================================================

function generateRBACSnippet(
  verb: string,
  resource: string,
  apiGroup: string,
  namespace?: string,
): string {
  const kind = namespace ? 'Role' : 'ClusterRole'
  const bindingKind = namespace ? 'RoleBinding' : 'ClusterRoleBinding'
  const namePrefix = `console-mission-${resource}-${verb}`

  let yaml = `apiVersion: rbac.authorization.k8s.io/v1
kind: ${kind}
metadata:
  name: ${namePrefix}`

  if (namespace) {
    yaml += `\n  namespace: ${namespace}`
  }

  yaml += `
rules:
  - apiGroups: ["${apiGroup}"]
    resources: ["${resource}"]
    verbs: ["${verb}"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ${bindingKind}
metadata:
  name: ${namePrefix}-binding`

  if (namespace) {
    yaml += `\n  namespace: ${namespace}`
  }

  yaml += `
subjects:
  - kind: User
    name: <YOUR_USER>  # Replace with your username
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ${kind}
  name: ${namePrefix}
  apiGroup: rbac.authorization.k8s.io`

  return yaml
}

// ============================================================================
// Preflight Runner
// ============================================================================

interface KubectlExecFn {
  (args: string[], options?: { context?: string; timeout?: number; priority?: boolean }): Promise<{
    output: string
    exitCode: number
    error?: string
  }>
}

/**
 * Run a preflight permission check against a cluster context.
 *
 * Executes `kubectl auth can-i --list` to verify the agent has access to the
 * cluster. If that fails, the error is classified into a structured error code
 * with remediation actions.
 *
 * @param kubectlExec - Function to execute kubectl commands (typically kubectlProxy.exec)
 * @param context     - Optional cluster context to check
 */
export async function runPreflightCheck(
  kubectlExec: KubectlExecFn,
  context?: string,
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

    return { ok: true, context }
  } catch (err) {
    // Connection-level failures (WebSocket down, agent unavailable)
    const message = err instanceof Error ? err.message : String(err)

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
