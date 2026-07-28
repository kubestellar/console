/**
 * kubectl error classification and remediation helpers.
 *
 * Extracted from preflightCheck.ts — see issue #15790 / #21610.
 */
import i18n from '../../i18n'

export type PreflightErrorCode =
  | 'MISSING_CREDENTIALS'
  | 'EXPIRED_CREDENTIALS'
  | 'RBAC_DENIED'
  | 'CONTEXT_NOT_FOUND'
  | 'CLUSTER_UNREACHABLE'
  | 'MISSING_TOOLS'
  | 'UNKNOWN_EXECUTION_FAILURE'

export interface PreflightError {
  code: PreflightErrorCode
  message: string
  details?: Record<string, unknown>
}

export interface RequiredOperation {
  verb: string
  resource: string
  namespace?: string
}

export interface PreflightResult {
  ok: boolean
  error?: PreflightError
  context?: string
  deniedOps?: RequiredOperation[]
}

export function classifyKubectlError(
  stderr: string,
  stdout: string,
  exitCode: number,
): PreflightError {
  const safeStderr = (stderr && stderr !== 'undefined') ? stderr : ''
  const safeStdout = (stdout && stdout !== 'undefined') ? stdout : ''
  const combined = `${safeStderr} ${safeStdout}`.toLowerCase()

  if (
    combined.includes('no configuration has been provided') ||
    combined.includes('kubeconfig') && combined.includes('not found') ||
    combined.includes('stat') && combined.includes('.kube/config') && combined.includes('no such file') ||
    combined.includes('invalid configuration') && combined.includes('no configuration') ||
    combined.includes('the connection to the server localhost:8080 was refused') && !combined.includes('context')
  ) {
    return { code: 'MISSING_CREDENTIALS', message: 'No Kubernetes credentials found. A kubeconfig file is required to connect to a cluster.' }
  }

  if (
    combined.includes('certificate has expired') ||
    combined.includes('x509: certificate') && (combined.includes('expired') || combined.includes('not yet valid')) ||
    combined.includes('token has expired') || combined.includes('token is expired') ||
    combined.includes('unable to connect to the server') && combined.includes('tls') && combined.includes('expired') ||
    combined.includes('credentials have expired') ||
    combined.includes('refresh token') && combined.includes('expired')
  ) {
    return { code: 'EXPIRED_CREDENTIALS', message: 'Kubernetes credentials have expired. You need to re-authenticate with your cluster.' }
  }

  if (
    combined.includes('forbidden') || combined.includes('is forbidden') ||
    combined.includes('cannot') && combined.includes('in the namespace') ||
    combined.includes('user') && combined.includes('cannot') && (combined.includes('get') || combined.includes('list') || combined.includes('create') || combined.includes('delete') || combined.includes('update') || combined.includes('patch')) ||
    (exitCode !== 0 && combined.includes('error from server (forbidden)'))
  ) {
    const details: Record<string, unknown> = {}
    const rbacMatch = combined.match(/cannot\s+(get|list|create|delete|update|patch|watch)\s+resource\s+"([^"]+)"\s+in\s+api\s+group\s+"([^"]*)"/i)
    if (rbacMatch) { details.verb = rbacMatch[1]; details.resource = rbacMatch[2]; details.apiGroup = rbacMatch[3] || 'core' }
    const nsMatch = combined.match(/cannot\s+(get|list|create|delete|update|patch|watch)\s+(\S+)\s+in\s+the\s+namespace\s+"([^"]+)"/i)
    if (nsMatch && !rbacMatch) { details.verb = nsMatch[1]; details.resource = nsMatch[2]; details.namespace = nsMatch[3] }
    return { code: 'RBAC_DENIED', message: 'Your Kubernetes user does not have permission to perform the required operations.', details: Object.keys(details).length > 0 ? details : undefined }
  }

  if (
    combined.includes('context') && combined.includes('not found') ||
    combined.includes('context') && combined.includes('does not exist') ||
    combined.includes('no context exists with the name') ||
    combined.includes('error: context') && combined.includes('not found')
  ) {
    const ctxMatch = combined.match(/context\s+"([^"]+)"\s+(?:not found|does not exist)/i)
    return {
      code: 'CONTEXT_NOT_FOUND',
      message: ctxMatch ? `Kubernetes context "${ctxMatch[1]}" was not found in your kubeconfig.` : 'The specified Kubernetes context was not found in your kubeconfig.',
      details: ctxMatch ? { requestedContext: ctxMatch[1] } : undefined,
    }
  }

  if (
    combined.includes('connection refused') || combined.includes('was refused') ||
    combined.includes('no such host') || combined.includes('i/o timeout') ||
    combined.includes('dial tcp') && combined.includes('timeout') ||
    combined.includes('unable to connect to the server') || combined.includes('tls handshake timeout') ||
    combined.includes('net/http: tls handshake timeout') || combined.includes('context deadline exceeded') ||
    combined.includes('the server was unable to return a response') ||
    combined.includes('eof') && combined.includes('connect')
  ) {
    return { code: 'CLUSTER_UNREACHABLE', message: 'Unable to reach the Kubernetes cluster. This may be a network, DNS, or firewall issue.' }
  }

  return { code: 'UNKNOWN_EXECUTION_FAILURE', message: safeStderr.trim() || safeStdout.trim() || 'An unknown error occurred while checking cluster access.' }
}

export interface RemediationAction {
  label: string
  description: string
  codeSnippet?: string
  actionType: 'copy' | 'retry' | 'link' | 'info'
  href?: string
}

const WINGET_PACKAGE_MAP: Record<string, string> = {
  kind: 'winget install Kubernetes.kind',
  kubectl: 'winget install Kubernetes.kubectl',
  helm: 'winget install Helm.Helm',
  git: 'winget install Git.Git',
  docker: 'winget install Docker.DockerDesktop',
  k3d: 'winget install k3d-io.k3d',
  minikube: 'winget install Kubernetes.minikube',
}

function generateRBACSnippet(verb: string, resource: string, apiGroup: string, namespace?: string): string {
  const kind = namespace ? 'Role' : 'ClusterRole'
  const bindingKind = namespace ? 'RoleBinding' : 'ClusterRoleBinding'
  const namePrefix = `console-mission-${resource}-${verb}`
  let yaml = `apiVersion: rbac.authorization.k8s.io/v1\nkind: ${kind}\nmetadata:\n  name: ${namePrefix}`
  if (namespace) yaml += `\n  namespace: ${namespace}`
  yaml += `\nrules:\n  - apiGroups: ["${apiGroup}"]\n    resources: ["${resource}"]\n    verbs: ["${verb}"]\n---\napiVersion: rbac.authorization.k8s.io/v1\nkind: ${bindingKind}\nmetadata:\n  name: ${namePrefix}-binding`
  if (namespace) yaml += `\n  namespace: ${namespace}`
  yaml += `\nsubjects:\n  - kind: User\n    name: <YOUR_USER>  # Replace with your username\n    apiGroup: rbac.authorization.k8s.io\nroleRef:\n  kind: ${kind}\n  name: ${namePrefix}\n  apiGroup: rbac.authorization.k8s.io`
  return yaml
}

export function getRemediationActions(error: PreflightError, context?: string): RemediationAction[] {
  switch (error.code) {
    case 'MISSING_CREDENTIALS':
      return [
        { label: 'Set up kubeconfig', description: 'Ensure your kubeconfig file exists at ~/.kube/config or set the KUBECONFIG environment variable.', codeSnippet: 'export KUBECONFIG=~/.kube/config', actionType: 'copy' },
        { label: 'Configure cluster access', description: 'If using a cloud provider, run the appropriate login command to generate credentials.', codeSnippet: context ? `# For GKE:\ngcloud container clusters get-credentials <CLUSTER_NAME>\n# For EKS:\naws eks update-kubeconfig --name <CLUSTER_NAME>\n# For AKS:\naz aks get-credentials --resource-group <RG> --name <CLUSTER_NAME>` : `kubectl config view`, actionType: 'copy' },
        { label: 'Retry preflight check', description: 'After configuring credentials, retry the preflight check.', actionType: 'retry' },
      ]

    case 'EXPIRED_CREDENTIALS':
      return [
        { label: 'Refresh credentials', description: 'Your cluster credentials have expired. Re-authenticate with your identity provider.', codeSnippet: context ? `# Re-authenticate for context: ${context}\nkubectl config use-context ${context}\n# Then run your cloud provider login command` : `# Re-run your cloud provider login command\n# For GKE: gcloud auth login && gcloud container clusters get-credentials <CLUSTER>\n# For EKS: aws sso login && aws eks update-kubeconfig --name <CLUSTER>`, actionType: 'copy' },
        { label: 'Retry preflight check', description: 'After refreshing credentials, retry the preflight check.', actionType: 'retry' },
      ]

    case 'RBAC_DENIED': {
      const actions: RemediationAction[] = [
        { label: 'Required permissions', description: error.details?.verb ? `Your user needs "${error.details.verb}" permission on "${error.details.resource}" resources${error.details.apiGroup && error.details.apiGroup !== 'core' ? ` in API group "${error.details.apiGroup}"` : ''}.` : 'Your user needs additional RBAC permissions to perform the required operations.', actionType: 'info' },
      ]
      if (error.details?.verb && error.details?.resource) {
        actions.push({ label: 'Copy RBAC manifest', description: 'Apply this ClusterRoleBinding to grant the minimum required permissions.', codeSnippet: generateRBACSnippet(error.details.verb as string, error.details.resource as string, (error.details.apiGroup as string) || '', (error.details.namespace as string) || undefined), actionType: 'copy' })
      }
      actions.push({ label: 'Retry preflight check', description: 'After updating RBAC permissions, retry the preflight check.', actionType: 'retry' })
      return actions
    }

    case 'CONTEXT_NOT_FOUND':
      return [
        { label: 'List available contexts', description: error.details?.requestedContext ? `Context "${error.details.requestedContext}" was not found. List available contexts to find the correct one.` : 'The specified context was not found. List available contexts to find the correct one.', codeSnippet: 'kubectl config get-contexts', actionType: 'copy' },
        { label: 'Retry preflight check', description: 'After selecting the correct context, retry the preflight check.', actionType: 'retry' },
      ]

    case 'MISSING_TOOLS': {
      const actions: RemediationAction[] = [{ label: 'Missing tools', description: error.message, actionType: 'info' }]
      const missingTools = (error.details?.missingTools as string[] | undefined) || []
      if (missingTools.length > 0) {
        actions.push({ label: 'Install with Homebrew (macOS/Linux)', description: 'Run these commands to install the missing tools via Homebrew.', codeSnippet: missingTools.map(t => `brew install ${t}`).join('\n'), actionType: 'copy' })
        actions.push({ label: 'Install with winget (Windows)', description: 'On Windows 10+, use winget (built-in) to install the missing tools.', codeSnippet: missingTools.map(t => WINGET_PACKAGE_MAP[t] || `winget install ${t}`).join('\n'), actionType: 'copy' })
      }
      actions.push({ label: 'Retry preflight check', description: 'After installing the missing tools, retry the preflight check.', actionType: 'retry' })
      return actions
    }

    case 'CLUSTER_UNREACHABLE':
      return [
        { label: 'Check connectivity', description: 'Verify network connectivity to the cluster API server.', codeSnippet: context ? `kubectl --context=${context} cluster-info` : 'kubectl cluster-info', actionType: 'copy' },
        { label: 'Check VPN or firewall', description: 'If the cluster is behind a VPN or firewall, ensure you are connected and the API server port is accessible.', actionType: 'info' },
        { label: 'Retry preflight check', description: 'After resolving connectivity issues, retry the preflight check.', actionType: 'retry' },
      ]

    default:
      return [
        { label: 'View error details', description: error.message, actionType: 'info' },
        { label: 'Retry preflight check', description: 'Try running the preflight check again.', actionType: 'retry' },
      ]
  }
}

export interface ToolCheckResult {
  name: string
  installed: boolean
  version?: string
  path?: string
}

export interface ToolPreflightResult {
  ok: boolean
  error?: PreflightError
  tools: ToolCheckResult[]
}

const DEFAULT_REQUIRED_TOOLS = ['kubectl']
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_SERVICE_UNAVAILABLE = 503
const TOOL_CHECK_TIMEOUT_MS = 10_000
const AGENT_UNREACHABLE_ERROR_PATTERNS = ['failed to fetch', 'fetch failed', 'networkerror', 'connection refused', 'econnrefused', 'timeout', 'timed out', 'aborterror', 'the operation was aborted']
const MISSION_TOOL_MAP: Record<string, string[]> = { deploy: ['kubectl', 'helm'], upgrade: ['kubectl', 'helm'], repair: ['kubectl'], troubleshoot: ['kubectl'], analyze: ['kubectl'], maintain: ['kubectl', 'helm'], custom: ['kubectl'] }

export function resolveRequiredTools(missionType?: string, explicitTools?: string[]): string[] {
  if (explicitTools && explicitTools.length > 0) return explicitTools
  const typeTools = missionType ? MISSION_TOOL_MAP[missionType] || [] : []
  return [...new Set([...DEFAULT_REQUIRED_TOOLS, ...typeTools])]
}

function isAgentAuthenticationStatus(status: number): boolean { return status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN }
function isAgentUnreachableStatus(status: number): boolean { return status === HTTP_SERVICE_UNAVAILABLE }
function isAgentUnreachableError(message: string): boolean { return AGENT_UNREACHABLE_ERROR_PATTERNS.some(p => message.toLowerCase().includes(p)) }
function getToolCheckHttpErrorMessage(status: number): string {
  if (isAgentAuthenticationStatus(status)) return i18n.t('missions.preflight.toolCheck.agentAuthFailed')
  if (isAgentUnreachableStatus(status)) return i18n.t('missions.preflight.toolCheck.agentUnreachable')
  return i18n.t('missions.preflight.toolCheck.requestFailedHttp', { status })
}
function getToolCheckRequestErrorMessage(message: string): string {
  if (isAgentUnreachableError(message)) return i18n.t('missions.preflight.toolCheck.agentUnreachable')
  return i18n.t('missions.preflight.toolCheck.requestFailedGeneric', { message })
}

export async function runToolPreflightCheck(agentBaseUrl: string, requiredTools: string[], fetchFn: typeof fetch = fetch): Promise<ToolPreflightResult> {
  const normalizedAgentBaseUrl = agentBaseUrl.trim()
  if (!normalizedAgentBaseUrl) return { ok: true, tools: [] }
  try {
    const url = new URL('/local-cluster-tools', normalizedAgentBaseUrl)
    const normalizedRequiredTools = [...new Set(requiredTools.map(t => t.toLowerCase()))]
    normalizedRequiredTools.forEach(t => url.searchParams.append('tool', t))
    const resp = await fetchFn(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(TOOL_CHECK_TIMEOUT_MS) })
    if (!resp.ok) return { ok: false, error: { code: 'UNKNOWN_EXECUTION_FAILURE', message: getToolCheckHttpErrorMessage(resp.status) }, tools: [] }
    const responseData = await resp.json()
    const detected: ToolCheckResult[] = Array.isArray(responseData) ? responseData : Array.isArray(responseData?.tools) ? responseData.tools : []
    const installedSet = new Set(detected.filter((t: ToolCheckResult) => t.installed).map((t: ToolCheckResult) => t.name.toLowerCase()))
    const missing = requiredTools.filter(t => !installedSet.has(t.toLowerCase()))
    const toolResults: ToolCheckResult[] = requiredTools.map(name => {
      const match = detected.find((d: ToolCheckResult) => d.name.toLowerCase() === name.toLowerCase())
      return match || { name, installed: installedSet.has(name.toLowerCase()) }
    })
    if (missing.length > 0) return { ok: false, error: { code: 'MISSING_TOOLS', message: `Required tools not found: ${missing.join(', ')}. Install them before running this mission.`, details: { missingTools: missing } }, tools: toolResults }
    return { ok: true, tools: toolResults }
  } catch (err: unknown) {
    return { ok: false, error: { code: 'UNKNOWN_EXECUTION_FAILURE', message: getToolCheckRequestErrorMessage(err instanceof Error ? err.message : String(err)) }, tools: [] }
  }
}

export interface KubectlExecFn {
  (args: string[], options?: { context?: string; timeout?: number; priority?: boolean }): Promise<{ output: string; exitCode: number; error?: string }>
}

export async function runClusterReadinessCheck(kubectlExec: KubectlExecFn, context?: string): Promise<PreflightResult> {
  try {
    const result = await kubectlExec(['get', '--raw', '/readyz'], { context, timeout: 10_000, priority: true })
    if (result.exitCode !== 0 || !(result.output || '').toLowerCase().includes('ok')) {
      return { ok: false, error: { code: 'CLUSTER_UNREACHABLE', message: 'The Kubernetes API server is not fully ready. It may still be starting up.' }, context }
    }
    return { ok: true, context }
  } catch (err: unknown) {
    return { ok: false, error: { code: 'CLUSTER_UNREACHABLE', message: `Failed to verify cluster readiness: ${err instanceof Error ? err.message : String(err ?? 'Unknown error')}` }, context }
  }
}

interface AllowedPermission { resource: string; verbs: string[] }

function parseBracketedItems(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return []
  return trimmed.slice(1, -1).split(/\s+/).map(item => item.trim()).filter(Boolean)
}

function parseAllowedPermissions(output: string): AllowedPermission[] {
  return output.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const columns = line.split(/\s{2,}/).map(c => c.trim()).filter(Boolean)
    if (columns.length < 2) return null
    const resource = columns[0]
    const verbs = parseBracketedItems(columns[columns.length - 1])
    if (!resource || verbs.length === 0) return null
    return { resource, verbs }
  }).filter((entry): entry is AllowedPermission => entry !== null)
}

function buildDeniedOperationError(deniedOps: RequiredOperation[], allowedPermissions: AllowedPermission[]): PreflightError {
  const firstDenied = deniedOps[0]
  if (!firstDenied) return { code: 'RBAC_DENIED', message: 'Your Kubernetes user does not have permission to perform the required operations.' }
  const matchingPermission = allowedPermissions.find(p => p.resource === firstDenied.resource)
  return {
    code: 'RBAC_DENIED',
    message: deniedOps.length === 1
      ? `Your Kubernetes user does not have permission to ${firstDenied.verb} ${firstDenied.resource}${firstDenied.namespace ? ` in namespace "${firstDenied.namespace}"` : ''}.`
      : 'Your Kubernetes user does not have permission to perform one or more required mission operations.',
    details: { verb: firstDenied.verb, resource: firstDenied.resource, namespace: firstDenied.namespace, deniedOps, allowedVerbsForResource: matchingPermission?.verbs },
  }
}

export async function runPreflightCheck(kubectlExec: KubectlExecFn, context?: string, requiredOps?: RequiredOperation[]): Promise<PreflightResult> {
  try {
    const result = await kubectlExec(['auth', 'can-i', '--list', '--no-headers'], { context, timeout: 10_000, priority: true })
    if (result.exitCode !== 0) {
      const error = classifyKubectlError(result.error || '', result.output || '', result.exitCode)
      return { ok: false, error, context }
    }
    if (!requiredOps || requiredOps.length === 0) return { ok: true, context }
    const allowedPermissions = parseAllowedPermissions(result.output || '')
    const deniedOps: RequiredOperation[] = []
    for (const requiredOp of requiredOps) {
      const canIArgs = ['auth', 'can-i', requiredOp.verb, requiredOp.resource]
      if (requiredOp.namespace) canIArgs.push('-n', requiredOp.namespace)
      const permissionResult = await kubectlExec(canIArgs, { context, timeout: 10_000, priority: true })
      if (permissionResult.exitCode !== 0) {
        const error = classifyKubectlError(permissionResult.error || '', permissionResult.output || '', permissionResult.exitCode)
        return { ok: false, error, context }
      }
      if ((permissionResult.output || '').trim().toLowerCase() !== 'yes') deniedOps.push(requiredOp)
    }
    if (deniedOps.length > 0) return { ok: false, error: buildDeniedOperationError(deniedOps, allowedPermissions), context, deniedOps }
    return { ok: true, context }
  } catch (err: unknown) {
    const errObj = err as { message?: unknown }
    const message = typeof errObj?.message === 'string' && errObj.message ? errObj.message : err instanceof Error ? err.message : String(err ?? 'Unknown execution error')
    const error = classifyKubectlError(message, '', 1)
    const lowerMessage = message.toLowerCase()
    if (error.code === 'UNKNOWN_EXECUTION_FAILURE' && (lowerMessage.includes('not connected') || lowerMessage.includes('connection') || lowerMessage.includes('timeout') || lowerMessage.includes('unavailable'))) {
      return { ok: false, error: { code: 'CLUSTER_UNREACHABLE', message: 'Unable to reach the local agent or Kubernetes cluster.' }, context }
    }
    return { ok: false, error, context }
  }
}
