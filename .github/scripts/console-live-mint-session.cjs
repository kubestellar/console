#!/usr/bin/env node

const crypto = require('node:crypto')

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
const ttlSeconds = Number(process.env.CONSOLE_LIVE_TEST_SESSION_TTL_SECONDS || '1800')

if (!Number.isFinite(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 7200) {
  throw new Error('CONSOLE_LIVE_TEST_SESSION_TTL_SECONDS must be between 60 and 7200 seconds')
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
  nbf: now - 5,
  exp: now + ttlSeconds,
}

const unsigned = `${base64url(header)}.${base64url(payload)}`
const signature = crypto.createHmac('sha256', jwtSecret).update(unsigned).digest('base64url')
process.stdout.write(`${unsigned}.${signature}`)
