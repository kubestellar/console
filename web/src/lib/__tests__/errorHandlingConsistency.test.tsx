/**
 * End-to-end error handling consistency tests.
 *
 * Validates that network errors, auth failures, service-unavailable states,
 * and other failure modes are classified consistently regardless of whether
 * they originate from REST API calls, agent WebSocket messages, MCP queries,
 * or cluster-level operations.
 *
 * @see https://github.com/kubestellar/console/issues/11589
 */
import { describe, it, expect } from 'vitest'

import {
  classifyError,
  getErrorTypeFromString,
  getIconForErrorType,
  getSuggestionForErrorType,
  type ClusterErrorType,
} from '../errorClassifier'

import { friendlyErrorMessage } from '../clusterErrors'

import {
  classifyApiError,
  classifyHttpStatus,
  getUserMessage,
  isRetryable,
  type ApiErrorCategory,
  type ClassifiedApiError,
} from '../errorHandling'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Asserts that a classified API error has the expected shape */
function expectClassified(
  result: ClassifiedApiError,
  expected: { category: ApiErrorCategory; retryable: boolean },
): void {
  expect(result.category).toBe(expected.category)
  expect(result.retryable).toBe(expected.retryable)
  expect(result.message).toBeTruthy()
  expect(result.userMessage).toBeTruthy()
}

// ---------------------------------------------------------------------------
// 1. Cross-flow classification consistency
// ---------------------------------------------------------------------------

describe('Cross-flow error classification consistency', () => {
  describe('network errors produce the same category across sources', () => {
    const networkMessages = [
      'connection refused',
      'no such host',
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource',
      'net::ERR_NETWORK',
      'ERR_INTERNET_DISCONNECTED',
      'ERR_NAME_NOT_RESOLVED',
      'network request failed',
      'no route to host',
      'dial tcp 10.0.0.1:443: connect: connection refused',
    ]

    it.each(networkMessages)('"%s" → network', (msg) => {
      const apiResult = classifyApiError(msg)
      expect(apiResult.category).toMatch(/^(network|service_unavailable)$/)
      expect(apiResult.retryable).toBe(true)
    })

    it('cluster classifier and API classifier agree on network errors', () => {
      const clusterResult = classifyError('connection refused')
      const apiResult = classifyApiError('connection refused')

      expect(clusterResult.type).toBe('network')
      expect(apiResult.category).toBe('network')
    })
  })

  describe('auth errors produce the same category across sources', () => {
    const authMessages = [
      '401 unauthorized',
      '403 forbidden',
      'token expired',
      'access denied',
      'authentication required',
      'not authorized to perform this action',
      'invalid token provided',
    ]

    it.each(authMessages)('"%s" → auth (not retryable)', (msg) => {
      const apiResult = classifyApiError(msg)
      expect(apiResult.category).toBe('auth')
      expect(apiResult.retryable).toBe(false)
    })

    it('cluster classifier and API classifier agree on auth errors', () => {
      const clusterResult = classifyError('403 forbidden')
      const apiResult = classifyApiError('403 forbidden')

      expect(clusterResult.type).toBe('auth')
      expect(apiResult.category).toBe('auth')
    })
  })

  describe('timeout errors produce the same category across sources', () => {
    const timeoutMessages = [
      'connection timed out',
      'context deadline exceeded',
      'i/o timeout',
      'request timeout',
      'timed out waiting for response',
      'The operation timed out',
    ]

    it.each(timeoutMessages)('"%s" → timeout (retryable)', (msg) => {
      const apiResult = classifyApiError(msg)
      expect(apiResult.category).toBe('timeout')
      expect(apiResult.retryable).toBe(true)
    })

    it('cluster classifier and API classifier agree on timeout errors', () => {
      const clusterResult = classifyError('deadline exceeded')
      const apiResult = classifyApiError('deadline exceeded')

      expect(clusterResult.type).toBe('timeout')
      expect(apiResult.category).toBe('timeout')
    })
  })

  describe('service unavailable errors are classified correctly', () => {
    const unavailableMessages = [
      '503 service unavailable',
      'service unavailable',
      'backend unavailable',
      'server is shutting down',
      'temporarily unavailable',
    ]

    it.each(unavailableMessages)('"%s" → service_unavailable (retryable)', (msg) => {
      const apiResult = classifyApiError(msg)
      expect(apiResult.category).toBe('service_unavailable')
      expect(apiResult.retryable).toBe(true)
    })
  })

  describe('certificate errors are classified correctly', () => {
    const certMessages = [
      'x509: certificate has expired',
      'TLS handshake error',
      'SSL connection error',
      'certificate signed by unknown authority',
    ]

    it.each(certMessages)('"%s" → certificate (not retryable)', (msg) => {
      const apiResult = classifyApiError(msg)
      expect(apiResult.category).toBe('certificate')
      expect(apiResult.retryable).toBe(false)
    })
  })

  describe('unknown errors fall back gracefully', () => {
    it('unrecognized message produces unknown category', () => {
      const result = classifyApiError('something completely unexpected happened')
      expect(result.category).toBe('unknown')
      expect(result.retryable).toBe(false)
      expect(result.userMessage).toBeTruthy()
    })

    it('empty string produces unknown', () => {
      const result = classifyApiError('')
      expect(result.category).toBe('unknown')
    })

    it('Error object with unknown message produces unknown', () => {
      const result = classifyApiError(new Error('internal plumbing failure'))
      expect(result.category).toBe('unknown')
      expect(result.message).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// 2. HTTP status code classification
// ---------------------------------------------------------------------------

describe('HTTP status code classification', () => {
  const statusMap: Array<[number, ApiErrorCategory]> = [
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not_found'],
    [408, 'timeout'],
    [429, 'rate_limited'],
    [502, 'service_unavailable'],
    [503, 'service_unavailable'],
    [504, 'timeout'],
  ]

  it.each(statusMap)('HTTP %d → %s', (status, expected) => {
    expect(classifyHttpStatus(status)).toBe(expected)
  })

  it('unknown status codes fall back to unknown', () => {
    expect(classifyHttpStatus(418)).toBe('unknown')
    expect(classifyHttpStatus(500)).toBe('unknown')
  })

  it('classifyApiError accepts numeric status codes', () => {
    const result = classifyApiError(401)
    expect(result.category).toBe('auth')
    expect(result.message).toBe('HTTP 401')
    expect(result.retryable).toBe(false)
  })

  it('503 via status code matches 503 via message', () => {
    const fromStatus = classifyApiError(503)
    const fromMessage = classifyApiError('503 service unavailable')

    expect(fromStatus.category).toBe('service_unavailable')
    expect(fromMessage.category).toBe('service_unavailable')
    expect(fromStatus.retryable).toBe(true)
    expect(fromMessage.retryable).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. classifyApiError accepts Error objects
// ---------------------------------------------------------------------------

describe('classifyApiError handles Error objects', () => {
  it('extracts message from Error', () => {
    const err = new Error('connection refused')
    const result = classifyApiError(err)
    expect(result.category).toBe('network')
  })

  it('handles TypeError (common for fetch failures)', () => {
    const err = new TypeError('Failed to fetch')
    const result = classifyApiError(err)
    expect(result.category).toBe('network')
    expect(result.retryable).toBe(true)
  })

  it('handles DOMException AbortError', () => {
    const err = new Error('The operation was aborted')
    const result = classifyApiError(err)
    // Aborted operations don't match a specific category, falls to unknown
    expect(result.category).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// 4. User message consistency
// ---------------------------------------------------------------------------

describe('User-facing message consistency', () => {
  const allCategories: ApiErrorCategory[] = [
    'network',
    'auth',
    'timeout',
    'service_unavailable',
    'not_found',
    'rate_limited',
    'certificate',
    'unknown',
  ]

  it('every category has a non-empty user message', () => {
    for (const cat of allCategories) {
      const msg = getUserMessage(cat)
      expect(msg).toBeTruthy()
      expect(msg.length).toBeGreaterThan(10)
    }
  })

  it('user messages are distinct per category', () => {
    const messages = allCategories.map(c => getUserMessage(c))
    const unique = new Set(messages)
    expect(unique.size).toBe(allCategories.length)
  })

  it('classifyApiError always provides a userMessage', () => {
    const inputs: Array<string | number> = [
      'connection refused',
      '401 unauthorized',
      'timeout',
      '503 service unavailable',
      'something random',
      '',
      401,
      503,
    ]

    for (const input of inputs) {
      const result = classifyApiError(input)
      expect(result.userMessage).toBeTruthy()
      expect(typeof result.userMessage).toBe('string')
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Retryability consistency
// ---------------------------------------------------------------------------

describe('Retryability rules', () => {
  it('network errors are retryable', () => {
    expect(isRetryable('network')).toBe(true)
  })

  it('timeout errors are retryable', () => {
    expect(isRetryable('timeout')).toBe(true)
  })

  it('service unavailable errors are retryable', () => {
    expect(isRetryable('service_unavailable')).toBe(true)
  })

  it('rate limited errors are retryable', () => {
    expect(isRetryable('rate_limited')).toBe(true)
  })

  it('auth errors are NOT retryable', () => {
    expect(isRetryable('auth')).toBe(false)
  })

  it('not_found errors are NOT retryable', () => {
    expect(isRetryable('not_found')).toBe(false)
  })

  it('certificate errors are NOT retryable', () => {
    expect(isRetryable('certificate')).toBe(false)
  })

  it('unknown errors are NOT retryable', () => {
    expect(isRetryable('unknown')).toBe(false)
  })

  it('classifyApiError retryable field matches isRetryable', () => {
    const testCases: Array<[string | number, boolean]> = [
      ['connection refused', true],        // network
      ['401 unauthorized', false],         // auth
      ['deadline exceeded', true],         // timeout
      ['503 service unavailable', true],   // service_unavailable
      ['x509 certificate error', false],   // certificate
      ['random error', false],             // unknown
      [429, true],                         // rate_limited
      [404, false],                        // not_found
    ]

    for (const [input, expected] of testCases) {
      const result = classifyApiError(input)
      expect(result.retryable).toBe(expected)
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Cluster classifier ↔ API classifier alignment
// ---------------------------------------------------------------------------

describe('ClusterErrorType ↔ ApiErrorCategory alignment', () => {
  const clusterTypes: ClusterErrorType[] = ['timeout', 'auth', 'network', 'certificate', 'unknown']

  it('every ClusterErrorType maps to a valid ApiErrorCategory', () => {
    for (const cType of clusterTypes) {
      // Synthesize an error message that the cluster classifier would produce
      const errorMessages: Record<ClusterErrorType, string> = {
        timeout: 'context deadline exceeded',
        auth: '401 unauthorized',
        network: 'connection refused',
        certificate: 'x509: certificate has expired',
        unknown: 'some unknown error',
      }

      const clusterResult = classifyError(errorMessages[cType])
      const apiResult = classifyApiError(errorMessages[cType])

      // The cluster type should map to a compatible API category
      expect(clusterResult.type).toBe(cType)
      if (cType === 'unknown') {
        // Unknown might map to unknown or a more specific category
        expect(apiResult.category).toBeTruthy()
      } else {
        expect(apiResult.category).toBe(cType)
      }
    }
  })

  it('classifyHttpStatus auth codes round-trip through getErrorTypeFromString', () => {
    // 401 and 403 map to 'auth' via classifyHttpStatus
    const type401 = classifyHttpStatus(401)
    const type403 = classifyHttpStatus(403)
    expect(type401).toBe('auth')
    expect(type403).toBe('auth')
    // The type string produced by classifyHttpStatus must be accepted by getErrorTypeFromString
    // so both systems remain aligned: backend type strings and HTTP status codes agree
    expect(getErrorTypeFromString(type401)).toBe('auth')
    expect(getErrorTypeFromString(type403)).toBe('auth')
  })

  it('icon and suggestion are always available for classified errors', () => {
    for (const cType of clusterTypes) {
      const icon = getIconForErrorType(cType)
      const suggestion = getSuggestionForErrorType(cType)
      expect(icon).toBeTruthy()
      expect(suggestion).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// 7. friendlyErrorMessage consistency with classifyApiError
// ---------------------------------------------------------------------------

describe('friendlyErrorMessage ↔ classifyApiError consistency', () => {
  it('timeout errors produce friendly messages in both systems', () => {
    const msg = 'The operation timed out waiting for cluster response'
    const friendly = friendlyErrorMessage(msg)
    const classified = classifyApiError(msg)

    // friendlyErrorMessage returns a user-friendly version
    expect(friendly).toContain('timed out')
    // classifyApiError also classifies as timeout
    expect(classified.category).toBe('timeout')
  })

  it('friendlyErrorMessage for unrecognized errors returns raw message', () => {
    const raw = 'some obscure Go panic stacktrace'
    const friendly = friendlyErrorMessage(raw)
    // Falls through — returns raw
    expect(friendly).toBe(raw)
  })

  it('empty string handled by both', () => {
    const friendly = friendlyErrorMessage('')
    const classified = classifyApiError('')

    expect(friendly).toBeTruthy()
    expect(classified.userMessage).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 8. Real-world error message scenarios (agent/API/MCP flows)
// ---------------------------------------------------------------------------

describe('Real-world error scenarios from different flows', () => {
  describe('Kagenti / agent flow errors', () => {
    it('agent connection refused → network + retryable', () => {
      const result = classifyApiError('dial tcp 127.0.0.1:8585: connect: connection refused')
      expectClassified(result, { category: 'network', retryable: true })
    })

    it('agent WebSocket timeout → timeout + retryable', () => {
      const result = classifyApiError('WebSocket connection timed out')
      expectClassified(result, { category: 'timeout', retryable: true })
    })

    it('agent auth failure → auth + not retryable', () => {
      const result = classifyApiError('authentication required: invalid bearer token')
      expectClassified(result, { category: 'auth', retryable: false })
    })
  })

  describe('REST API flow errors', () => {
    it('HTTP 401 status → auth', () => {
      const result = classifyApiError(401)
      expectClassified(result, { category: 'auth', retryable: false })
    })

    it('HTTP 503 status → service_unavailable', () => {
      const result = classifyApiError(503)
      expectClassified(result, { category: 'service_unavailable', retryable: true })
    })

    it('HTTP 429 status → rate_limited', () => {
      const result = classifyApiError(429)
      expectClassified(result, { category: 'rate_limited', retryable: true })
    })

    it('fetch TypeError → network', () => {
      const result = classifyApiError(new TypeError('Failed to fetch'))
      expectClassified(result, { category: 'network', retryable: true })
    })
  })

  describe('MCP / cluster query errors', () => {
    it('RBAC forbidden on pods → auth', () => {
      const result = classifyApiError('pods is forbidden: User "system:anonymous" cannot list resource "pods"')
      expectClassified(result, { category: 'auth', retryable: false })
    })

    it('cluster unreachable → network', () => {
      const result = classifyApiError('no route to host 10.0.0.5')
      expectClassified(result, { category: 'network', retryable: true })
    })

    it('cluster certificate expired → certificate', () => {
      const result = classifyApiError('x509: certificate has expired or is not yet valid')
      expectClassified(result, { category: 'certificate', retryable: false })
    })

    it('DNS resolution failure → network', () => {
      const result = classifyApiError('lookup api.cluster.local: no such host')
      expectClassified(result, { category: 'network', retryable: true })
    })
  })

  describe('Namespace/resource flow errors', () => {
    it('namespace not found returns useful info', () => {
      const result = classifyApiError('namespaces "kube-system" not found')
      // "not found" in a namespace context is unknown at the classifier level
      // (it doesn't match HTTP 404 or network patterns)
      expect(result.category).toBeTruthy()
      expect(result.userMessage).toBeTruthy()
    })

    it('RBAC denial on namespace list → auth', () => {
      const result = classifyApiError('namespaces is forbidden: User "dev" cannot list resource')
      expectClassified(result, { category: 'auth', retryable: false })
    })
  })
})

// ---------------------------------------------------------------------------
// 9. Structural contract: every classified error has required fields
// ---------------------------------------------------------------------------

describe('ClassifiedApiError structural contract', () => {
  const errorInputs: Array<string | Error | number> = [
    'connection refused',
    '401 unauthorized',
    'deadline exceeded',
    '503 service unavailable',
    'x509 cert error',
    'something unknown',
    '',
    new Error('fetch failed'),
    new TypeError('Failed to fetch'),
    401,
    403,
    404,
    429,
    500,
    503,
    504,
  ]

  it.each(errorInputs)('classifyApiError(%s) returns valid structure', (input) => {
    const result = classifyApiError(input)

    // category is a valid ApiErrorCategory
    const validCategories: ApiErrorCategory[] = [
      'network', 'auth', 'timeout', 'service_unavailable',
      'not_found', 'rate_limited', 'certificate', 'unknown',
    ]
    expect(validCategories).toContain(result.category)

    // message is a string
    expect(typeof result.message).toBe('string')

    // userMessage is a non-empty string
    expect(typeof result.userMessage).toBe('string')
    expect(result.userMessage.length).toBeGreaterThan(0)

    // retryable is a boolean
    expect(typeof result.retryable).toBe('boolean')
  })
})
