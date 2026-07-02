// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { sanitizeText, sanitizeJson, safeJsonStringify } from '../sanitizeEvidence'

describe('sanitizeText', () => {
  describe('private keys', () => {
    it('redacts RSA private keys', () => {
      const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQ...\n-----END RSA PRIVATE KEY-----'
      const result = sanitizeText(input)
      expect(result).toBe('[REDACTED_PRIVATE_KEY]')
    })

    it('redacts EC private keys', () => {
      const input = '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEI...\n-----END EC PRIVATE KEY-----'
      const result = sanitizeText(input)
      expect(result).toBe('[REDACTED_PRIVATE_KEY]')
    })

    it('redacts private keys in multiline text', () => {
      const input = `Config:
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkq
-----END PRIVATE KEY-----
End`
      const result = sanitizeText(input)
      expect(result).toBe('Config:\n[REDACTED_PRIVATE_KEY]\nEnd')
    })
  })

  describe('Bearer tokens', () => {
    it('redacts Bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      const result = sanitizeText(input)
      expect(result).toBe('Authorization: Bearer [REDACTED]')
    })

    it('redacts multiple Bearer tokens', () => {
      const input = 'Bearer abc123 and Bearer xyz789'
      const result = sanitizeText(input)
      expect(result).toContain('[REDACTED]')
      expect(result).not.toContain('abc123')
      expect(result).not.toContain('xyz789')
    })
  })

  describe('JWT tokens', () => {
    it('redacts JWTs', () => {
      const input = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      const result = sanitizeText(input)
      expect(result).toBe('Token: [REDACTED_JWT]')
    })

    it('redacts multiple JWTs', () => {
      const jwt1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
      const jwt2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ODc2NTQzMjEwIn0.WlW7rq2jKsIr_fmXrZk8Nt4l_m5J2bH8cR9Y3xZ1abc'
      const input = `First: ${jwt1}, Second: ${jwt2}`
      const result = sanitizeText(input)
      expect(result).not.toContain(jwt1)
      expect(result).not.toContain(jwt2)
      expect(result).toContain('[REDACTED_JWT]')
    })
  })

  describe('URL parameters', () => {
    it('redacts access_token in query string', () => {
      const input = 'https://api.example.com/data?access_token=secret123&foo=bar'
      const result = sanitizeText(input)
      expect(result).toContain('access_token=[REDACTED]')
      expect(result).not.toContain('secret123')
      expect(result).toContain('foo=bar')
    })

    it('redacts refresh_token in query string', () => {
      const input = 'https://api.example.com/auth?refresh_token=refresh_secret'
      const result = sanitizeText(input)
      expect(result).toContain('refresh_token=[REDACTED]')
      expect(result).not.toContain('refresh_secret')
    })

    it('redacts id_token in query string', () => {
      const input = 'callback?id_token=id_secret123'
      const result = sanitizeText(input)
      expect(result).toContain('id_token=[REDACTED]')
      expect(result).not.toContain('id_secret123')
    })

    it('redacts client_secret in query string', () => {
      const input = 'oauth?client_secret=client123'
      const result = sanitizeText(input)
      expect(result).toContain('client_secret=[REDACTED]')
      expect(result).not.toContain('client123')
    })
  })

  describe('HTTP headers', () => {
    it('redacts Authorization header', () => {
      const input = 'Authorization: Bearer token123'
      const result = sanitizeText(input)
      expect(result).toContain('authorization: [REDACTED]')
      expect(result).not.toContain('token123')
    })

    it('redacts Cookie header', () => {
      const input = 'Cookie: session=abc123; user=test'
      const result = sanitizeText(input)
      expect(result).toContain('cookie: [REDACTED]')
      expect(result).not.toContain('abc123')
    })

    it('redacts Set-Cookie header', () => {
      const input = 'Set-Cookie: session=xyz789; HttpOnly'
      const result = sanitizeText(input)
      expect(result).toContain('set-cookie: [REDACTED]')
      expect(result).not.toContain('xyz789')
    })

    it('redacts x-api-key header', () => {
      const input = 'x-api-key: apikey123'
      const result = sanitizeText(input)
      expect(result).toContain('x-api-key: [REDACTED]')
      expect(result).not.toContain('apikey123')
    })

    it('redacts kc-agent-token header', () => {
      const input = 'kc-agent-token: agent_secret'
      const result = sanitizeText(input)
      expect(result).toContain('kc-agent-token: [REDACTED]')
      expect(result).not.toContain('agent_secret')
    })
  })

  describe('kubeconfig data', () => {
    it('redacts kubeconfig YAML', () => {
      const input = `apiVersion: v1
clusters:
- cluster:
    server: https://example.com
  name: test
users:
- name: admin
  user:
    token: secret123`
      const result = sanitizeText(input)
      expect(result).toBe('[REDACTED_KUBECONFIG]')
    })
  })

  describe('environment variables', () => {
    it('redacts sensitive env values when present in text', () => {
      const originalEnv = process.env.TEST_SECRET
      process.env.TEST_SECRET = 'my_secret_value_12345'
      
      const input = 'Logging: my_secret_value_12345 detected'
      const result = sanitizeText(input)
      
      expect(result).not.toContain('my_secret_value_12345')
      expect(result).toContain('[REDACTED_ENV_VALUE]')
      
      if (originalEnv === undefined) {
        delete process.env.TEST_SECRET
      } else {
        process.env.TEST_SECRET = originalEnv
      }
    })
  })

  describe('edge cases', () => {
    it('handles null input', () => {
      const result = sanitizeText(null)
      expect(result).toBe('')
    })

    it('handles undefined input', () => {
      const result = sanitizeText(undefined)
      expect(result).toBe('')
    })

    it('handles empty string', () => {
      const result = sanitizeText('')
      expect(result).toBe('')
    })

    it('handles text with no secrets', () => {
      const input = 'This is a normal log message with no secrets.'
      const result = sanitizeText(input)
      expect(result).toBe(input)
    })

    it('preserves non-secret content while redacting secrets', () => {
      const input = 'User login successful, token: Bearer abc123'
      const result = sanitizeText(input)
      expect(result).toContain('User login successful')
      expect(result).toContain('Bearer [REDACTED]')
      expect(result).not.toContain('abc123')
    })
  })
})

describe('sanitizeJson', () => {
  it('redacts string values containing secrets', () => {
    const input = { message: 'Authorization: Bearer token123' }
    const result = sanitizeJson(input)
    expect(result.message).toContain('[REDACTED]')
    expect(result.message).not.toContain('token123')
  })

  it('redacts fields with sensitive key names', () => {
    const input = { username: 'admin', password: 'secret123' }
    const result = sanitizeJson(input)
    expect(result.username).toBe('admin')
    expect(result.password).toBe('[REDACTED]')
  })

  it('redacts nested objects with sensitive keys', () => {
    const input = {
      config: {
        apiKey: 'key123',
        endpoint: 'https://example.com',
      },
    }
    const result = sanitizeJson(input)
    expect(result.config.apiKey).toBe('[REDACTED]')
    expect(result.config.endpoint).toBe('https://example.com')
  })

  it('sanitizes arrays', () => {
    const input = ['normal', 'Bearer token123']
    const result = sanitizeJson(input)
    expect(result[0]).toBe('normal')
    expect(result[1]).toContain('[REDACTED]')
  })

  it('handles primitives', () => {
    expect(sanitizeJson(123)).toBe(123)
    expect(sanitizeJson(true)).toBe(true)
    expect(sanitizeJson(null)).toBe(null)
  })

  it('redacts TOKEN in key names', () => {
    const input = { API_TOKEN: 'token123' }
    const result = sanitizeJson(input)
    expect(result.API_TOKEN).toBe('[REDACTED]')
  })

  it('redacts SECRET in key names', () => {
    const input = { CLIENT_SECRET: 'secret123' }
    const result = sanitizeJson(input)
    expect(result.CLIENT_SECRET).toBe('[REDACTED]')
  })

  it('redacts CREDENTIAL in key names', () => {
    const input = { USER_CREDENTIAL: 'cred123' }
    const result = sanitizeJson(input)
    expect(result.USER_CREDENTIAL).toBe('[REDACTED]')
  })

  it('redacts KEY in key names', () => {
    const input = { API_KEY: 'key123' }
    const result = sanitizeJson(input)
    expect(result.API_KEY).toBe('[REDACTED]')
  })

  it('redacts AUTH in key names', () => {
    const input = { AUTH_HEADER: 'auth123' }
    const result = sanitizeJson(input)
    expect(result.AUTH_HEADER).toBe('[REDACTED]')
  })
})

describe('safeJsonStringify', () => {
  it('stringifies and sanitizes objects', () => {
    const input = { username: 'admin', password: 'secret123' }
    const result = safeJsonStringify(input)
    const parsed = JSON.parse(result)
    expect(parsed.username).toBe('admin')
    expect(parsed.password).toBe('[REDACTED]')
  })

  it('formats JSON with 2-space indentation', () => {
    const input = { a: 1 }
    const result = safeJsonStringify(input)
    expect(result).toContain('  ')
  })

  it('handles nested structures', () => {
    const input = {
      level1: {
        level2: {
          token: 'secret123',
          data: 'normal',
        },
      },
    }
    const result = safeJsonStringify(input)
    expect(result).toContain('[REDACTED]')
    expect(result).not.toContain('secret123')
    expect(result).toContain('normal')
  })
})
