/**
 * Cross-Stack Auth Contract Test
 *
 * Verifies that the Go backend and TypeScript frontend agree on the
 * /auth/refresh response shape (#6590 contract). The refreshed JWT is
 * delivered EXCLUSIVELY via the HttpOnly kc_auth cookie — it must NOT
 * appear in the JSON response body. The body carries only
 * { refreshed: true, onboarded: bool }.
 *
 * See: #6590 (established contract), #8087/#8091/#8092 (regression fix
 * after the contract was temporarily reversed).
 *
 * Run: npx vitest run src/test/auth-contract.test.ts
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ── Paths ───────────────────────────────────────────────────────────────────

// process.cwd() is the web/ directory when vitest runs; go up one level.
const REPO_ROOT = resolve(process.cwd(), '..')

const AUTH_HANDLER_PATH = join(
  REPO_ROOT,
  'pkg/api/handlers/auth.go',
)

const AUTH_CALLBACK_PATH = join(
  REPO_ROOT,
  'web/src/components/auth/AuthCallback.tsx',
)

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the body of the RefreshToken function from auth.go source. */
function getRefreshTokenBody(authGo: string): string {
  const refreshFnStart = authGo.indexOf('func (h *AuthHandler) RefreshToken')
  if (refreshFnStart < 0) return ''
  const afterFn = authGo.slice(refreshFnStart)
  const nextFuncIdx = afterFn.indexOf('\nfunc ', 1)
  return nextFuncIdx > 0 ? afterFn.slice(0, nextFuncIdx) : afterFn
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Cross-stack /auth/refresh contract (#6590)', () => {
  it('both files exist', () => {
    expect(
      existsSync(AUTH_HANDLER_PATH),
      `Backend handler missing: ${AUTH_HANDLER_PATH}`,
    ).toBe(true)
    expect(
      existsSync(AUTH_CALLBACK_PATH),
      `Frontend callback missing: ${AUTH_CALLBACK_PATH}`,
    ).toBe(true)
  })

  it('backend RefreshToken does NOT return "token" in the JSON body (#6590)', () => {
    const authGo = readFileSync(AUTH_HANDLER_PATH, 'utf-8')
    const fnBody = getRefreshTokenBody(authGo)
    expect(fnBody.length).toBeGreaterThan(0)

    // The fiber.Map returned by RefreshToken must NOT contain a "token" key.
    // Strip Go comments (// ...) so commentary that mentions "token" doesn't
    // false-positive against the assertion.
    const codeOnly = fnBody.replace(/\/\/[^\n]*/g, '')
    expect(
      codeOnly,
      'CONTRACT VIOLATION (#6590): RefreshToken must NOT include a "token" key ' +
      'in its fiber.Map response — the refreshed JWT is delivered exclusively ' +
      'via the HttpOnly kc_auth cookie.',
    ).not.toMatch(/"token"\s*:/)
  })

  it('backend RefreshToken returns "refreshed" and "onboarded" in the JSON body', () => {
    const authGo = readFileSync(AUTH_HANDLER_PATH, 'utf-8')
    const fnBody = getRefreshTokenBody(authGo)
    expect(fnBody).toMatch(/"refreshed"\s*:/)
    expect(fnBody).toMatch(/"onboarded"\s*:/)
  })

  it('backend RefreshToken still sets the HttpOnly cookie via setJWTCookie', () => {
    const authGo = readFileSync(AUTH_HANDLER_PATH, 'utf-8')
    const fnBody = getRefreshTokenBody(authGo)
    expect(
      fnBody,
      'RefreshToken must call setJWTCookie to deliver the new JWT via the ' +
      'HttpOnly cookie — without this, the user has no way to authenticate ' +
      'after refresh.',
    ).toMatch(/setJWTCookie/)
  })

  it('frontend AuthCallback reads data.refreshed from the response', () => {
    const callbackTsx = readFileSync(AUTH_CALLBACK_PATH, 'utf-8')
    // AuthCallback must reference data.refreshed (the success signal from
    // /auth/refresh). It must NOT depend on data.token any more.
    expect(
      callbackTsx,
      'AuthCallback must read data.refreshed (the cookie-only success signal)',
    ).toMatch(/data\.refreshed|\.refreshed/)
  })

  it('backend and frontend agree on the "onboarded" field', () => {
    const authGo = readFileSync(AUTH_HANDLER_PATH, 'utf-8')
    const callbackTsx = readFileSync(AUTH_CALLBACK_PATH, 'utf-8')

    // Backend must include "onboarded" in the response
    expect(
      authGo,
      'Backend must return "onboarded" in /auth/refresh response',
    ).toMatch(/"onboarded"/)

    // Frontend must read data.onboarded
    expect(
      callbackTsx,
      'Frontend must read data.onboarded from /auth/refresh response',
    ).toMatch(/data\.onboarded|\.onboarded/)
  })
})
