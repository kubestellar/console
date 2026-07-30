import { describe, expect, it } from 'vitest'
import { getRemediationActions } from '../remediation'
import type { PreflightError, PreflightErrorCode } from '../types'

function makeError(
  code: PreflightErrorCode,
  overrides: Partial<PreflightError> = {},
): PreflightError {
  return {
    code,
    message: overrides.message ?? `msg for ${code}`,
    details: overrides.details,
  }
}

describe('getRemediationActions', () => {
  describe('MISSING_CREDENTIALS', () => {
    it('returns three actions ending in a retry', () => {
      const actions = getRemediationActions(makeError('MISSING_CREDENTIALS'))
      expect(actions).toHaveLength(3)
      expect(actions.map(a => a.actionType)).toEqual(['copy', 'copy', 'retry'])
      expect(actions[0].codeSnippet).toContain('KUBECONFIG')
    })

    it('picks the cloud-provider snippet when a context is provided', () => {
      const [, cloud] = getRemediationActions(makeError('MISSING_CREDENTIALS'), 'prod')
      expect(cloud.codeSnippet).toContain('gcloud container clusters')
      expect(cloud.codeSnippet).toContain('aws eks update-kubeconfig')
      expect(cloud.codeSnippet).toContain('az aks get-credentials')
    })

    it('falls back to kubectl config view when no context is provided', () => {
      const [, fallback] = getRemediationActions(makeError('MISSING_CREDENTIALS'))
      expect(fallback.codeSnippet).toBe('kubectl config view')
    })
  })

  describe('EXPIRED_CREDENTIALS', () => {
    it('returns a refresh action and a retry', () => {
      const actions = getRemediationActions(makeError('EXPIRED_CREDENTIALS'))
      expect(actions).toHaveLength(2)
      expect(actions[0].actionType).toBe('copy')
      expect(actions[1].actionType).toBe('retry')
    })

    it('references the supplied context in the snippet', () => {
      const [refresh] = getRemediationActions(makeError('EXPIRED_CREDENTIALS'), 'ctx-a')
      expect(refresh.codeSnippet).toContain('kubectl config use-context ctx-a')
      expect(refresh.codeSnippet).toContain('ctx-a')
    })

    it('uses the generic re-auth guide when no context is provided', () => {
      const [refresh] = getRemediationActions(makeError('EXPIRED_CREDENTIALS'))
      expect(refresh.codeSnippet).toContain('Re-run your cloud provider login command')
      expect(refresh.codeSnippet).not.toContain('use-context')
    })
  })

  describe('RBAC_DENIED', () => {
    it('returns info + retry when no verb/resource details are present', () => {
      const actions = getRemediationActions(makeError('RBAC_DENIED'))
      expect(actions.map(a => a.actionType)).toEqual(['info', 'retry'])
      expect(actions[0].description).toContain('additional RBAC permissions')
    })

    it('inserts a copyable RBAC snippet when verb and resource are supplied', () => {
      const actions = getRemediationActions(
        makeError('RBAC_DENIED', {
          details: {
            verb: 'get',
            resource: 'pods',
            apiGroup: '',
          },
        }),
      )
      expect(actions.map(a => a.actionType)).toEqual(['info', 'copy', 'retry'])
      const rbac = actions[1].codeSnippet!
      expect(rbac).toContain('kind: ClusterRole')
      expect(rbac).toContain('kind: ClusterRoleBinding')
      expect(rbac).toContain('verbs: ["get"]')
      expect(rbac).toContain('resources: ["pods"]')
      expect(rbac).not.toContain('namespace:')
    })

    it('emits a namespaced Role + RoleBinding when a namespace is provided', () => {
      const actions = getRemediationActions(
        makeError('RBAC_DENIED', {
          details: {
            verb: 'list',
            resource: 'deployments',
            apiGroup: 'apps',
            namespace: 'team-a',
          },
        }),
      )
      const rbac = actions[1].codeSnippet!
      expect(rbac).toContain('kind: Role\n')
      expect(rbac).toContain('kind: RoleBinding\n')
      expect(rbac).toContain('namespace: team-a')
      expect(rbac).toContain('apiGroups: ["apps"]')
    })

    it('mentions the non-core apiGroup in the info description', () => {
      const [info] = getRemediationActions(
        makeError('RBAC_DENIED', {
          details: { verb: 'watch', resource: 'crontabs', apiGroup: 'batch.example.com' },
        }),
      )
      expect(info.description).toContain('"watch"')
      expect(info.description).toContain('"crontabs"')
      expect(info.description).toContain('API group "batch.example.com"')
    })

    it('omits the API group phrase when apiGroup is "core"', () => {
      const [info] = getRemediationActions(
        makeError('RBAC_DENIED', {
          details: { verb: 'get', resource: 'pods', apiGroup: 'core' },
        }),
      )
      expect(info.description).not.toContain('API group')
    })

    it('does not insert an RBAC snippet when only verb is provided (missing resource)', () => {
      const actions = getRemediationActions(
        makeError('RBAC_DENIED', {
          details: { verb: 'get' },
        }),
      )
      expect(actions.map(a => a.actionType)).toEqual(['info', 'retry'])
    })
  })

  describe('CONTEXT_NOT_FOUND', () => {
    it('returns a list-contexts action and a retry', () => {
      const actions = getRemediationActions(makeError('CONTEXT_NOT_FOUND'))
      expect(actions.map(a => a.actionType)).toEqual(['copy', 'retry'])
      expect(actions[0].codeSnippet).toBe('kubectl config get-contexts')
    })

    it('quotes the requested context name in the description when provided', () => {
      const [list] = getRemediationActions(
        makeError('CONTEXT_NOT_FOUND', { details: { requestedContext: 'staging' } }),
      )
      expect(list.description).toContain('"staging"')
    })

    it('uses a generic description when no requestedContext detail is provided', () => {
      const [list] = getRemediationActions(makeError('CONTEXT_NOT_FOUND'))
      expect(list.description).toContain('The specified context was not found')
    })
  })

  describe('MISSING_TOOLS', () => {
    it('returns info + retry when no missingTools list is provided', () => {
      const actions = getRemediationActions(
        makeError('MISSING_TOOLS', { message: 'tools missing' }),
      )
      expect(actions.map(a => a.actionType)).toEqual(['info', 'retry'])
      expect(actions[0].description).toBe('tools missing')
    })

    it('generates brew and winget install commands for each missing tool', () => {
      const actions = getRemediationActions(
        makeError('MISSING_TOOLS', {
          details: { missingTools: ['kubectl', 'helm'] },
        }),
      )
      expect(actions.map(a => a.actionType)).toEqual(['info', 'copy', 'copy', 'retry'])
      const [, brew, winget] = actions
      expect(brew.label).toContain('Homebrew')
      expect(brew.codeSnippet).toBe('brew install kubectl\nbrew install helm')
      expect(winget.label).toContain('winget')
      expect(winget.codeSnippet).toContain('winget install Kubernetes.kubectl')
      expect(winget.codeSnippet).toContain('winget install Helm.Helm')
    })

    it('falls back to a bare "winget install <tool>" for unmapped tools', () => {
      const [, , winget] = getRemediationActions(
        makeError('MISSING_TOOLS', {
          details: { missingTools: ['bespoke-cli'] },
        }),
      )
      expect(winget.codeSnippet).toBe('winget install bespoke-cli')
    })

    it('uses the winget package map for every known tool', () => {
      const knownTools = ['kind', 'kubectl', 'helm', 'git', 'docker', 'k3d', 'minikube']
      const [, , winget] = getRemediationActions(
        makeError('MISSING_TOOLS', {
          details: { missingTools: knownTools },
        }),
      )
      // Every mapped command should carry a namespaced package identifier
      // (e.g. Kubernetes.kubectl, Helm.Helm), never the bare `winget install <tool>`.
      const lines = winget.codeSnippet!.split('\n')
      expect(lines).toHaveLength(knownTools.length)
      for (const line of lines) {
        expect(line, `winget line "${line}"`).toMatch(/^winget install \S+\.\S+$/)
      }
    })
  })

  describe('CLUSTER_UNREACHABLE', () => {
    it('returns connectivity + firewall + retry actions', () => {
      const actions = getRemediationActions(makeError('CLUSTER_UNREACHABLE'))
      expect(actions.map(a => a.actionType)).toEqual(['copy', 'info', 'retry'])
      expect(actions[0].codeSnippet).toBe('kubectl cluster-info')
    })

    it('scopes the cluster-info command to the provided context', () => {
      const [connectivity] = getRemediationActions(makeError('CLUSTER_UNREACHABLE'), 'ctx-b')
      expect(connectivity.codeSnippet).toBe('kubectl --context=ctx-b cluster-info')
    })
  })

  describe('UNKNOWN_EXECUTION_FAILURE / default', () => {
    it('surfaces the error message and offers a retry', () => {
      const actions = getRemediationActions(
        makeError('UNKNOWN_EXECUTION_FAILURE', { message: 'boom' }),
      )
      expect(actions.map(a => a.actionType)).toEqual(['info', 'retry'])
      expect(actions[0].description).toBe('boom')
    })

    it('falls through to the same default for an unrecognized code', () => {
      const actions = getRemediationActions(
        makeError('SOMETHING_NEW' as PreflightErrorCode, { message: 'novel' }),
      )
      expect(actions.map(a => a.actionType)).toEqual(['info', 'retry'])
      expect(actions[0].description).toBe('novel')
    })
  })
})
