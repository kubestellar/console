import { describe, it, expect } from 'vitest'
import {
  GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS,
  GITHUB_TOKEN_CREATE_URL,
  GITHUB_TOKEN_CLASSIC_URL,
} from '../github-token'

describe('github-token constants', () => {
  it('defines fine-grained permissions with Issues scope', () => {
    expect(GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS).toHaveLength(1)
    expect(GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS[0].scope).toContain('Issues')
  })

  it('permissions include a reason string', () => {
    for (const perm of GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS) {
      expect(perm.reason).toBeTruthy()
      expect(typeof perm.reason).toBe('string')
    }
  })

  it('token create URL points to GitHub settings', () => {
    expect(GITHUB_TOKEN_CREATE_URL).toContain('github.com/settings/personal-access-tokens')
  })

  it('classic token URL includes repo scope', () => {
    expect(GITHUB_TOKEN_CLASSIC_URL).toContain('scopes=repo')
  })
})
