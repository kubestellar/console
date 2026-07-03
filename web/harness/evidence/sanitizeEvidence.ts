const SENSITIVE_KEY_PATTERN = /(SECRET|TOKEN|PASSWORD|KEY|KUBECONFIG|AUTH|CREDENTIAL|COOKIE|CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN|ID_TOKEN)/i
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const TOKEN_PARAM_PATTERN = /([?&#](?:access_token|refresh_token|id_token|token|client_secret|code)=)[^&#\s"]+/gi
const HEADER_PATTERN = /\b(authorization|cookie|set-cookie|x-api-key|kc-agent-token)\s*[:=]\s*[^,\n\r]+/gi
const KUBECONFIG_PATTERN = /\b(apiVersion:\s*v1[\s\S]{0,400}?(?:clusters:|users:|contexts:)[\s\S]{0,1200})/gi
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g

function sensitiveEnvValues(): string[] {
  return Object.entries(process.env)
    .filter(([key, value]) => SENSITIVE_KEY_PATTERN.test(key) && typeof value === 'string' && value.length >= 6)
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length)
}

export function sanitizeText(input: unknown): string {
  let text = String(input ?? '')
  text = text.replace(PRIVATE_KEY_PATTERN, '[REDACTED_PRIVATE_KEY]')
  text = text.replace(BEARER_PATTERN, 'Bearer [REDACTED]')
  text = text.replace(TOKEN_PARAM_PATTERN, '$1[REDACTED]')
  text = text.replace(HEADER_PATTERN, (_match, header) => `${header}: [REDACTED]`)
  text = text.replace(KUBECONFIG_PATTERN, '[REDACTED_KUBECONFIG]')
  text = text.replace(JWT_PATTERN, '[REDACTED_JWT]')

  for (const value of sensitiveEnvValues()) {
    text = text.split(value).join('[REDACTED_ENV_VALUE]')
  }

  return text
}

export function sanitizeJson<T>(value: T, keyHint = ''): T {
  if (SENSITIVE_KEY_PATTERN.test(keyHint)) return '[REDACTED]' as T
  if (typeof value === 'string') return sanitizeText(value) as T
  if (Array.isArray(value)) return value.map(item => sanitizeJson(item)) as T
  if (!value || typeof value !== 'object') return value

  const sanitized: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    sanitized[key] = sanitizeJson(entry, key)
  }
  return sanitized as T
}

export function safeJsonStringify(value: unknown): string {
  return JSON.stringify(sanitizeJson(value), null, 2)
}
