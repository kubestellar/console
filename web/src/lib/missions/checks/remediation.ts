/**
 * Preflight remediation guidance.
 *
 * Extracted from preflightCheck.ts as part of the checks/ split (tracked by #15790).
 * Groups getRemediationActions with its private helpers (WINGET_PACKAGE_MAP,
 * generateRBACSnippet) that were co-located in the original file.
 */
import type { PreflightError, RemediationAction } from './types'

/** Maps CLI tool names to their winget package identifiers (#11081). */
const WINGET_PACKAGE_MAP: Record<string, string> = {
  kind: 'winget install Kubernetes.kind',
  kubectl: 'winget install Kubernetes.kubectl',
  helm: 'winget install Helm.Helm',
  git: 'winget install Git.Git',
  docker: 'winget install Docker.DockerDesktop',
  k3d: 'winget install k3d-io.k3d',
  minikube: 'winget install Kubernetes.minikube',
}

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

    case 'MISSING_TOOLS': {
      const actions: RemediationAction[] = [
        {
          label: 'Missing tools',
          description: error.message,
          actionType: 'info',
        },
      ]

      // Generate platform-aware install commands from the missing tool list
      const missingTools = (error.details?.missingTools as string[] | undefined) || []
      if (missingTools.length > 0) {
        const brewCmds = missingTools.map(t => `brew install ${t}`).join('\n')
        const wingetCmds = missingTools
          .map(t => WINGET_PACKAGE_MAP[t] || `winget install ${t}`)
          .join('\n')
        actions.push({
          label: 'Install with Homebrew (macOS/Linux)',
          description: 'Run these commands to install the missing tools via Homebrew.',
          codeSnippet: brewCmds,
          actionType: 'copy',
        })
        actions.push({
          label: 'Install with winget (Windows)',
          description: 'On Windows 10+, use winget (built-in) to install the missing tools.',
          codeSnippet: wingetCmds,
          actionType: 'copy',
        })
      }

      actions.push({
        label: 'Retry preflight check',
        description: 'After installing the missing tools, retry the preflight check.',
        actionType: 'retry',
      })

      return actions
    }

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
