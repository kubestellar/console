import { describe, it, expect } from 'vitest'
import { AuthRefreshResponseSchema, UserSchema } from '../auth'

describe('AuthRefreshResponseSchema', () => {
  it('parses valid response with both fields', () => {
    const result = AuthRefreshResponseSchema.parse({ refreshed: true, onboarded: false })
    expect(result.refreshed).toBe(true)
    expect(result.onboarded).toBe(false)
  })

  it('parses response with optional fields missing', () => {
    const result = AuthRefreshResponseSchema.parse({})
    expect(result.refreshed).toBeUndefined()
    expect(result.onboarded).toBeUndefined()
  })

  it('rejects invalid types', () => {
    expect(() => AuthRefreshResponseSchema.parse({ refreshed: 'yes' })).toThrow()
  })
})

describe('UserSchema', () => {
  const validUser = {
    id: '1',
    github_id: '12345',
    github_login: 'testuser',
    onboarded: true,
  }

  it('parses valid user with required fields only', () => {
    const result = UserSchema.parse(validUser)
    expect(result.github_login).toBe('testuser')
    expect(result.onboarded).toBe(true)
  })

  it('parses user with all optional fields', () => {
    const result = UserSchema.parse({
      ...validUser,
      email: 'test@example.com',
      slack_id: 'U123',
      avatar_url: 'https://example.com/avatar.png',
      role: 'admin',
    })
    expect(result.email).toBe('test@example.com')
    expect(result.role).toBe('admin')
  })

  it('rejects invalid role', () => {
    expect(() => UserSchema.parse({ ...validUser, role: 'superadmin' })).toThrow()
  })

  it('rejects missing required fields', () => {
    expect(() => UserSchema.parse({ id: '1' })).toThrow()
  })

  it('accepts all valid roles', () => {
    for (const role of ['admin', 'editor', 'viewer']) {
      const result = UserSchema.parse({ ...validUser, role })
      expect(result.role).toBe(role)
    }
  })
})
