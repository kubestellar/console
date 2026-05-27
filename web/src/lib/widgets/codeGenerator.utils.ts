/**
 * Utility functions for widget code generation
 */

import { UBERSICHT_FALLBACK_URL, WIDGET_TOKEN_CACHE } from './codeGenerator.constants'

// Resolve the API endpoint for widget curl commands.
// For nightly E2E, use the public (no-auth) endpoint so widgets work without JWT.
export function resolveWidgetEndpoint(apiEndpoint: string, cardApiPath: string): string {
  const base = apiEndpoint || UBERSICHT_FALLBACK_URL
  if (cardApiPath === '/api/nightly-e2e/runs') {
    return `${base}/api/public/nightly-e2e/runs`
  }
  return `${base}${cardApiPath}`
}

// Generate the shell command that authenticates with the agent token and fetches data.
// On first run (or after token rotation), fetches the token and caches it.
// On subsequent runs, reads from cache; retries with a fresh token on 401.
export function generateWidgetCommand(baseUrl: string, curlUrl: string): string {
  const tokenUrl = `${baseUrl}/api/agent/token?source=ubersicht-widget`
  // Try with cached token; if response contains "Missing authorization", refresh and retry.
  // No HTTP status parsing needed — avoids sed/awk/$-escaping issues inside JS backticks.
  return `TOKEN=$(cat ${WIDGET_TOKEN_CACHE} 2>/dev/null); OUT=$(/usr/bin/curl -s --connect-timeout 5 -H "Authorization: Bearer $TOKEN" '${curlUrl}' 2>/dev/null); if echo "$OUT" | grep -q "Missing authorization" || [ -z "$TOKEN" ]; then TOKEN=$(/usr/bin/curl -s --connect-timeout 3 '${tokenUrl}' 2>/dev/null | /usr/bin/python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null); echo "$TOKEN" > ${WIDGET_TOKEN_CACHE}; /usr/bin/curl -s --connect-timeout 5 -H "Authorization: Bearer $TOKEN" '${curlUrl}' 2>/dev/null || echo '{"error":"Load failed"}'; else echo "$OUT"; fi`
}
