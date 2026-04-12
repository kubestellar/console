/**
 * Cross-Stack Auth Contract Test
 *
 * Verifies that the Go backend and TypeScript frontend agree on the
 * /auth/refresh response shape. If either side changes the field name,
 * this test fails BEFORE the code ships.
 *
 * See: commit 25e464fa (broke the contract), commit be946db9 (fixed it).
 * DO NOT remove this test without coordinating both sides.
 *
 * Run: npx vitest run src/test/auth-contract.test.ts
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ── Paths ───────────────────────────────────────────────────────────────────

// process.cwd() is the web/ directory when vitest runs; go up one level.
const REPO_ROOT = path.resolve(process.cwd(), '..')

const AUTH_HANDLER_PATH = path.join(
  REPO_ROOT,
  'pkg/api/handlers/auth.go',
)

const AUTH_CALLBACK_PATH = path.join(
  REPO_ROOT,
  'web/src/components/auth/AuthCallback.tsx',
)

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Cross-stack /auth/refresh contract', () => {
  it('both files exist', () => {
    expect(
      fs.existsSync(AUTH_HANDLER_PATH),
      `Backend handler missing: ${AUTH_HANDLER_PATH}`,
    ).toBe(true)
    expect(
      fs.existsSync(AUTH_CALLBACK_PATH),
      `Frontend callback missing: ${AUTH_CALLBACK_PATH}`,
    ).toBe(true)
  })

  it('backend RefreshToken returns "token" in the JSON response', () => {
    const authGo = fs.readFileSync(AUTH_HANDLER_PATH, 'utf-8')

    // The RefreshToken handler uses fiber.Map{ "token": newToken, ... }
    // We verify the string "token" appears in a fiber.Map near RefreshToken.
    const refreshFnStart = authGo.indexOf('func (h *AuthHandler) RefreshToken')
    expect(refreshFnStart).toBeGreaterThan(-1)

    // Grab the function body (until the next top-level func or EOF)
    const afterFn = authGo.slice(refreshFnStart)
    const nextFuncIdx = afterFn.indexOf('\nfunc ', 1)
    const fnBody = nextFuncIdx > 0
      ? afterFn.slice(0, nextFuncIdx)
      : afterFn

    // The response MUST include "token" in a fiber.Map
    expect(
      fnBody,
      'CONTRACT VIOLATION: RefreshToken must return "token" in fiber.Map — ' +
      'AuthCallback.tsx depends on data.token for OAuth login',
    ).toMatch(/"token"/)
  })

  it('frontend AuthCallback reads data.token from the response', () => {
    const callbackTsx = fs.readFileSync(AUTH_CALLBACK_PATH, 'utf-8')

    // AuthCallback must reference data.token (the field from /auth/refresh)
    expect(
      callbackTsx,
      'CONTRACT VIOLATION: AuthCallback must read data.token — ' +
      'this is the JWT returned by /auth/refresh',
    ).toMatch(/data\.token/)
  })

  it('frontend AuthCallback throws when token is missing', () => {
    const callbackTsx = fs.readFileSync(AUTH_CALLBACK_PATH, 'utf-8')

    // AuthCallback must have a guard like: if (!token) throw ...
    // This ensures a missing token field is treated as an error, not silently ignored.
    expect(
      callbackTsx,
      'AuthCallback must throw/reject when token is missing from response',
    ).toMatch(/(!token|token.*throw|No token)/)
  })

  it('backend and frontend agree on the "onboarded" field', () => {
    const authGo = fs.readFileSync(AUTH_HANDLER_PATH, 'utf-8')
    const callbackTsx = fs.readFileSync(AUTH_CALLBACK_PATH, 'utf-8')

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
