import { describe, it, expect } from 'vitest'
import { classifyKubectlError } from '../classifier'

describe('classifyKubectlError', () => {
  describe('MISSING_CREDENTIALS', () => {
    it('detects "no configuration has been provided"', () => {
      const result = classifyKubectlError(
        'error: no configuration has been provided, try setting KUBERNETES_MASTER environment variable',
        '',
        1,
      )
      expect(result.code).toBe('MISSING_CREDENTIALS')
      expect(result.message).toContain('No Kubernetes credentials')
    })

    it('detects missing kubeconfig file', () => {
      const result = classifyKubectlError(
        'stat /home/user/.kube/config: no such file or directory',
        '',
        1,
      )
      expect(result.code).toBe('MISSING_CREDENTIALS')
    })

    it('detects localhost:8080 refusal without context', () => {
      const result = classifyKubectlError(
        'The connection to the server localhost:8080 was refused - did you specify the right host or port?',
        '',
        1,
      )
      expect(result.code).toBe('MISSING_CREDENTIALS')
    })
  })

  describe('EXPIRED_CREDENTIALS', () => {
    it('detects "certificate has expired"', () => {
      const result = classifyKubectlError(
        'Unable to connect to the server: x509: certificate has expired or is not yet valid',
        '',
        1,
      )
      expect(result.code).toBe('EXPIRED_CREDENTIALS')
      expect(result.message).toContain('expired')
    })

    it('detects "token has expired"', () => {
      const result = classifyKubectlError('error: the token has expired', '', 1)
      expect(result.code).toBe('EXPIRED_CREDENTIALS')
    })

    it('detects "token is expired"', () => {
      const result = classifyKubectlError('error: the token is expired', '', 1)
      expect(result.code).toBe('EXPIRED_CREDENTIALS')
    })

    it('detects "credentials have expired"', () => {
      const result = classifyKubectlError('credentials have expired, re-authenticate', '', 1)
      expect(result.code).toBe('EXPIRED_CREDENTIALS')
    })

    it('detects "refresh token expired"', () => {
      const result = classifyKubectlError('OIDC refresh token has expired', '', 1)
      expect(result.code).toBe('EXPIRED_CREDENTIALS')
    })
  })

  describe('RBAC_DENIED', () => {
    it('detects generic forbidden', () => {
      const result = classifyKubectlError(
        'Error from server (Forbidden): pods is forbidden',
        '',
        1,
      )
      expect(result.code).toBe('RBAC_DENIED')
    })

    it('extracts verb/resource/apiGroup from RBAC message', () => {
      const result = classifyKubectlError(
        'Error from server (Forbidden): User "alice" cannot list resource "deployments" in API group "apps" at the cluster scope',
        '',
        1,
      )
      expect(result.code).toBe('RBAC_DENIED')
      expect(result.details).toBeDefined()
      expect(result.details?.verb).toBe('list')
      expect(result.details?.resource).toBe('deployments')
      expect(result.details?.apiGroup).toBe('apps')
    })

    it('defaults apiGroup to "core" when empty', () => {
      const result = classifyKubectlError(
        'Error from server (Forbidden): User "alice" cannot get resource "pods" in API group ""',
        '',
        1,
      )
      expect(result.code).toBe('RBAC_DENIED')
      expect(result.details?.apiGroup).toBe('core')
    })

    it('extracts namespace from RBAC "in the namespace" pattern', () => {
      const result = classifyKubectlError(
        'Error from server (Forbidden): User "bob" cannot create pods in the namespace "prod"',
        '',
        1,
      )
      expect(result.code).toBe('RBAC_DENIED')
      expect(result.details?.verb).toBe('create')
      expect(result.details?.resource).toBe('pods')
      expect(result.details?.namespace).toBe('prod')
    })

    it('returns no details for forbidden without extractable info', () => {
      const result = classifyKubectlError('is forbidden', '', 1)
      expect(result.code).toBe('RBAC_DENIED')
      expect(result.details).toBeUndefined()
    })
  })

  describe('CONTEXT_NOT_FOUND', () => {
    it('detects context not found and extracts name', () => {
      const result = classifyKubectlError(
        'error: context "staging" not found',
        '',
        1,
      )
      expect(result.code).toBe('CONTEXT_NOT_FOUND')
      expect(result.message).toContain('"staging"')
      expect(result.details?.requestedContext).toBe('staging')
    })

    it('detects "does not exist" phrasing', () => {
      const result = classifyKubectlError(
        'context "unknown" does not exist',
        '',
        1,
      )
      expect(result.code).toBe('CONTEXT_NOT_FOUND')
      expect(result.details?.requestedContext).toBe('unknown')
    })

    it('detects "no context exists with the name"', () => {
      const result = classifyKubectlError(
        'no context exists with the name: myctx',
        '',
        1,
      )
      expect(result.code).toBe('CONTEXT_NOT_FOUND')
      expect(result.details).toBeUndefined()
    })
  })

  describe('CLUSTER_UNREACHABLE', () => {
    it('detects connection refused', () => {
      const result = classifyKubectlError(
        'dial tcp 10.0.0.1:6443: connect: connection refused',
        '',
        1,
      )
      expect(result.code).toBe('CLUSTER_UNREACHABLE')
    })

    it('detects "no such host"', () => {
      const result = classifyKubectlError(
        'dial tcp: lookup api.example.com: no such host',
        '',
        1,
      )
      expect(result.code).toBe('CLUSTER_UNREACHABLE')
    })

    it('detects i/o timeout', () => {
      const result = classifyKubectlError(
        'Unable to connect to the server: dial tcp 10.0.0.1:6443: i/o timeout',
        '',
        1,
      )
      expect(result.code).toBe('CLUSTER_UNREACHABLE')
    })

    it('detects TLS handshake timeout', () => {
      const result = classifyKubectlError(
        'net/http: TLS handshake timeout',
        '',
        1,
      )
      expect(result.code).toBe('CLUSTER_UNREACHABLE')
    })

    it('detects context deadline exceeded', () => {
      const result = classifyKubectlError('context deadline exceeded', '', 1)
      expect(result.code).toBe('CLUSTER_UNREACHABLE')
    })
  })

  describe('UNKNOWN_EXECUTION_FAILURE', () => {
    it('falls back to unknown with stderr as message', () => {
      const result = classifyKubectlError('some weird unclassified error', '', 1)
      expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
      expect(result.message).toBe('some weird unclassified error')
    })

    it('uses stdout when stderr is empty', () => {
      const result = classifyKubectlError('', 'output-only error', 1)
      expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
      expect(result.message).toBe('output-only error')
    })

    it('uses generic message when both streams empty', () => {
      const result = classifyKubectlError('', '', 1)
      expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
      expect(result.message).toContain('unknown error')
    })
  })

  describe('input safety (#7321)', () => {
    it('treats the literal string "undefined" as empty', () => {
      const result = classifyKubectlError('undefined', 'undefined', 1)
      expect(result.code).toBe('UNKNOWN_EXECUTION_FAILURE')
      expect(result.message).not.toContain('undefined')
    })

    it('handles empty strings without throwing', () => {
      expect(() => classifyKubectlError('', '', 0)).not.toThrow()
    })
  })

  describe('priority ordering', () => {
    it('classifies expired certs before generic RBAC forbidden', () => {
      const result = classifyKubectlError(
        'certificate has expired; server returned forbidden',
        '',
        1,
      )
      expect(result.code).toBe('EXPIRED_CREDENTIALS')
    })

    it('classifies RBAC before cluster unreachable when both patterns match', () => {
      const result = classifyKubectlError(
        'User "alice" cannot list resource "pods" in API group "" — connection refused fallback',
        '',
        1,
      )
      expect(result.code).toBe('RBAC_DENIED')
    })
  })
})
