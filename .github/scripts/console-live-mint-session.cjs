#!/usr/bin/env node

const crypto = require('node:crypto')

const DEFAULT_TTL_SECONDS = 1_800
const MIN_TTL_SECONDS = 60
const MAX_TTL_SECONDS = 7_200
// Allow small CI clock differences between the runner and live service.
const CLOCK_SKEW_SECONDS = 5

function requiredEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value.trim()
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

const jwtSecret = requiredEnv('CONSOLE_LIVE_JWT_SECRET')
const userId = requiredEnv('CONSOLE_LIVE_TEST_USER_ID')
const githubLogin = requiredEnv('CONSOLE_LIVE_TEST_GITHUB_LOGIN')
const role = (process.env.CONSOLE_LIVE_TEST_USER_ROLE || 'admin').trim() || 'admin'
const now = Math.floor(Date.now() / 1000)
const ttlSeconds = Number(process.env.CONSOLE_LIVE_TEST_SESSION_TTL_SECONDS || String(DEFAULT_TTL_SECONDS))

if (!Number.isFinite(ttlSeconds) || ttlSeconds < MIN_TTL_SECONDS || ttlSeconds > MAX_TTL_SECONDS) {
  throw new Error(`CONSOLE_LIVE_TEST_SESSION_TTL_SECONDS must be between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS} seconds`)
}

const header = { alg: 'HS256', typ: 'JWT' }
const payload = {
  user_id: userId,
  github_login: githubLogin,
  role,
  sub: userId,
  iss: 'console-live-canary',
  aud: 'kubestellar-console',
  jti: crypto.randomUUID(),
  iat: now,
  nbf: now - CLOCK_SKEW_SECONDS,
  exp: now + ttlSeconds,
}

const unsigned = `${base64url(header)}.${base64url(payload)}`
const signature = crypto.createHmac('sha256', jwtSecret).update(unsigned).digest('base64url')
process.stdout.write(`${unsigned}.${signature}`)
