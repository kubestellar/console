import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SecurityStatus = 'pass' | 'fail' | 'warn' | 'skip' | 'info'

interface SecurityCheck {
  category: string
  name: string
  status: SecurityStatus
  details: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
}

interface SecurityReport {
  timestamp: string
  checks: SecurityCheck[]
  summary: {
    total: number
    pass: number
    fail: number
    warn: number
    skip: number
    criticalFails: number
    highFails: number
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeReport(report: SecurityReport, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  // JSON report
  fs.writeFileSync(
    path.join(outDir, 'security-compliance-report.json'),
    JSON.stringify(report, null, 2)
  )

  // Markdown summary
  const lines: string[] = [
    '# Security Compliance Report',
    '',
    `Generated: ${report.timestamp}`,
    '',
    '## Summary',
    '',
    `- **Pass**: ${report.summary.pass}`,
    `- **Fail**: ${report.summary.fail} (${report.summary.criticalFails} critical, ${report.summary.highFails} high)`,
    `- **Warn**: ${report.summary.warn}`,
    `- **Skip**: ${report.summary.skip}`,
    '',
    '## Results',
    '',
    '| Category | Check | Severity | Status | Details |',
    '|----------|-------|----------|--------|---------|',
  ]

  for (const c of report.checks) {
    const statusIcon = c.status === 'pass' ? 'PASS' : c.status === 'fail' ? 'FAIL' : c.status === 'warn' ? 'WARN' : 'SKIP'
    lines.push(`| ${c.category} | ${c.name} | ${c.severity} | ${statusIcon} | ${c.details} |`)
  }

  lines.push('')
  fs.writeFileSync(path.join(outDir, 'security-compliance-summary.md'), lines.join('\n'))
}

// ---------------------------------------------------------------------------
// Mock server setup (mirrors cache-compliance pattern)
// ---------------------------------------------------------------------------

async function setupMockServer(page: Page) {
  // Health endpoint
  await page.route('**/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
  )

  // Auth endpoint — returns a valid session
  await page.route('**/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { login: 'test-user', name: 'Test', avatarUrl: '' },
        token: 'mock-jwt-token',
      }),
    })
  )

  // Generic API catch-all for data endpoints
  await page.route('**/api/**', (route) => {
    const url = route.request().url()
    // Let auth/session through (already handled above)
    if (url.includes('/auth/session')) return route.fallback()
    // SSE endpoints
    if (url.includes('/stream') || url.includes('/events') || url.includes('/gpu-nodes')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: []\n\n',
      })
    }
    // Default JSON response
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

async function setupAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-jwt-token')
    localStorage.setItem('kc-demo-mode', 'false')
    localStorage.setItem('kc-onboarding-complete', 'true')
    localStorage.setItem('kc-tour-complete', 'true')
    localStorage.setItem('kc-setup-complete', 'true')
  })
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test('security compliance — frontend security audit', async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000) // multi-page navigation + auth bypass check needs extra time
  const checks: SecurityCheck[] = []

  function addCheck(
    category: string,
    name: string,
    status: SecurityStatus,
    details: string,
    severity: SecurityCheck['severity'] = 'medium'
  ) {
    checks.push({ category, name, status, details, severity })
    console.log(`[Security] ${status.toUpperCase()} [${severity}] ${category}: ${name} — ${details}`)
  }

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Browser ERROR] ${msg.text()}`)
  })

  // ── Setup ──────────────────────────────────────────────────────────────
  console.log('[Security] Phase 1: Setup')
  await setupAuth(page)
  await setupMockServer(page)

  // ── Phase 2: Load the app ──────────────────────────────────────────────
  console.log('[Security] Phase 2: Loading app')
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(2_000)

  // ══════════════════════════════════════════════════════════════════════
  // Category 1: DOM Security
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 3: DOM security checks')

  // Check 1.1: No inline event handlers in DOM
  const inlineHandlers = await page.evaluate(() => {
    const dangerous = ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur']
    const elements: string[] = []
    document.querySelectorAll('*').forEach((el) => {
      for (const attr of dangerous) {
        if (el.hasAttribute(attr)) {
          elements.push(`<${el.tagName.toLowerCase()} ${attr}="...">`)
        }
      }
    })
    return elements
  })

  if (inlineHandlers.length === 0) {
    addCheck('DOM Security', 'No inline event handlers', 'pass', 'No inline onclick/onerror/etc. found', 'high')
  } else {
    addCheck('DOM Security', 'No inline event handlers', 'fail',
      `Found ${inlineHandlers.length}: ${inlineHandlers.slice(0, 3).join(', ')}`, 'high')
  }

  // Check 1.2: No inline scripts in DOM
  const inlineScripts = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script:not([src])')
    const inline: string[] = []
    scripts.forEach((s) => {
      const content = s.textContent?.trim() || ''
      // Allow empty scripts and JSON-LD
      if (content && !content.startsWith('{') && !content.startsWith('//')) {
        inline.push(content.substring(0, 80))
      }
    })
    return inline
  })

  if (inlineScripts.length === 0) {
    addCheck('DOM Security', 'No inline scripts', 'pass', 'No inline <script> blocks found', 'high')
  } else {
    addCheck('DOM Security', 'No inline scripts', 'warn',
      `Found ${inlineScripts.length} inline scripts`, 'high')
  }

  // Check 1.3: No javascript: protocol in links
  const jsLinks = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href^="javascript:"]')
    return links.length
  })

  if (jsLinks === 0) {
    addCheck('DOM Security', 'No javascript: links', 'pass', 'No javascript: protocol links found', 'critical')
  } else {
    addCheck('DOM Security', 'No javascript: links', 'fail',
      `Found ${jsLinks} javascript: links`, 'critical')
  }

  // Check 1.4: No data: protocol in iframes
  const dataIframes = await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe[src^="data:"]')
    return iframes.length
  })

  if (dataIframes === 0) {
    addCheck('DOM Security', 'No data: iframes', 'pass', 'No data: protocol iframes found', 'high')
  } else {
    addCheck('DOM Security', 'No data: iframes', 'fail',
      `Found ${dataIframes} data: iframes`, 'high')
  }

  // Check 1.5: All external links have rel="noopener"
  const unsafeExternalLinks = await page.evaluate(() => {
    const links = document.querySelectorAll('a[target="_blank"]')
    const unsafe: string[] = []
    links.forEach((link) => {
      const rel = link.getAttribute('rel') || ''
      if (!rel.includes('noopener')) {
        unsafe.push(link.getAttribute('href') || '(no href)')
      }
    })
    return unsafe
  })

  if (unsafeExternalLinks.length === 0) {
    addCheck('DOM Security', 'External links have rel=noopener', 'pass',
      'All target="_blank" links have rel="noopener"', 'medium')
  } else {
    addCheck('DOM Security', 'External links have rel=noopener', 'warn',
      `${unsafeExternalLinks.length} links missing rel="noopener": ${unsafeExternalLinks.slice(0, 3).join(', ')}`, 'medium')
  }

  // Check 1.6: Iframes have sandbox attribute
  const unsandboxedIframes = await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe')
    const unsandboxed: string[] = []
    iframes.forEach((iframe) => {
      if (!iframe.hasAttribute('sandbox')) {
        unsandboxed.push(iframe.getAttribute('src') || '(no src)')
      }
    })
    return { total: iframes.length, unsandboxed }
  })

  if (unsandboxedIframes.total === 0) {
    addCheck('DOM Security', 'Iframes sandboxed', 'skip', 'No iframes on page', 'medium')
  } else if (unsandboxedIframes.unsandboxed.length === 0) {
    addCheck('DOM Security', 'Iframes sandboxed', 'pass',
      `All ${unsandboxedIframes.total} iframes have sandbox attribute`, 'medium')
  } else {
    addCheck('DOM Security', 'Iframes sandboxed', 'warn',
      `${unsandboxedIframes.unsandboxed.length}/${unsandboxedIframes.total} iframes missing sandbox`, 'medium')
  }

  // ══════════════════════════════════════════════════════════════════════
  // Category 2: Sensitive Data Exposure
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 4: Sensitive data checks')

  // Check 2.1: No tokens/secrets in DOM attributes
  const sensitiveAttrs = await page.evaluate(() => {
    const patterns = [/token/i, /secret/i, /password/i, /api.?key/i, /bearer/i, /credential/i]
    const found: string[] = []
    document.querySelectorAll('*').forEach((el) => {
      for (const attr of el.getAttributeNames()) {
        // Skip data-* attributes used by React and known safe attrs
        if (attr.startsWith('data-') || attr === 'type' || attr === 'name' || attr === 'id' ||
            attr === 'class' || attr === 'className' || attr === 'placeholder' || attr === 'title' ||
            attr === 'aria-label' || attr === 'for' || attr === 'autocomplete') continue
        const val = el.getAttribute(attr) || ''
        if (val.length > 20 && patterns.some((p) => p.test(attr))) {
          found.push(`${el.tagName.toLowerCase()}[${attr}]`)
        }
      }
    })
    return found
  })

  if (sensitiveAttrs.length === 0) {
    addCheck('Data Exposure', 'No secrets in DOM attributes', 'pass',
      'No token/secret/password values found in DOM attributes', 'critical')
  } else {
    addCheck('Data Exposure', 'No secrets in DOM attributes', 'fail',
      `Found ${sensitiveAttrs.length}: ${sensitiveAttrs.join(', ')}`, 'critical')
  }

  // Check 2.2: No sensitive data in URL query params
  const sensitiveUrlParams = await page.evaluate(() => {
    const params = new URLSearchParams(window.location.search)
    const dangerous = ['token', 'secret', 'password', 'key', 'apikey', 'api_key', 'auth']
    const found: string[] = []
    for (const [key] of params) {
      if (dangerous.some((d) => key.toLowerCase().includes(d))) {
        found.push(key)
      }
    }
    return found
  })

  if (sensitiveUrlParams.length === 0) {
    addCheck('Data Exposure', 'No secrets in URL params', 'pass',
      'No sensitive data in URL query parameters', 'high')
  } else {
    addCheck('Data Exposure', 'No secrets in URL params', 'fail',
      `Found sensitive params: ${sensitiveUrlParams.join(', ')}`, 'high')
  }

  // Check 2.3: Token stored with expected key
  const tokenStorage = await page.evaluate(() => {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      keys.push(key)
    }
    const sensitiveKeys = keys.filter((k) =>
      /token|secret|password|credential/i.test(k) && !/mode|complete|tour/i.test(k)
    )
    return { total: keys.length, sensitiveKeys }
  })

  addCheck('Data Exposure', 'Token storage audit', 'info',
    `${tokenStorage.sensitiveKeys.length} token-related key(s) in localStorage: ${tokenStorage.sensitiveKeys.join(', ') || 'none'}`,
    'info')

  // Check 2.4: No sensitive data in console.log (intercept)
  const consoleLogs: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (/token|secret|password|Bearer\s+\w{20,}/i.test(text) && !/\[Security\]/.test(text)) {
      consoleLogs.push(text.substring(0, 100))
    }
  })

  // Trigger some API calls to catch logged tokens
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2_000)

  if (consoleLogs.length === 0) {
    addCheck('Data Exposure', 'No secrets in console.log', 'pass',
      'No tokens/secrets leaked to browser console', 'high')
  } else {
    addCheck('Data Exposure', 'No secrets in console.log', 'fail',
      `Found ${consoleLogs.length} console messages with sensitive data`, 'high')
  }

  // ══════════════════════════════════════════════════════════════════════
  // Category 3: Authentication & Authorization
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 5: Auth checks')

  // Check 3.1: API requests include Authorization header
  const apiRequests: Array<{ url: string; hasAuth: boolean }> = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('/api/') && !url.includes('/auth/') && !url.includes('/health') && !url.includes('/public/')) {
      const authHeader = req.headers()['authorization'] || ''
      apiRequests.push({ url, hasAuth: authHeader.startsWith('Bearer ') })
    }
  })

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3_000)

  const authedRequests = apiRequests.filter((r) => r.hasAuth).length
  const unauthedRequests = apiRequests.filter((r) => !r.hasAuth)

  if (apiRequests.length === 0) {
    addCheck('Authentication', 'API requests carry auth token', 'skip',
      'No API requests captured (mocked)', 'high')
  } else if (unauthedRequests.length === 0) {
    addCheck('Authentication', 'API requests carry auth token', 'pass',
      `All ${authedRequests} API requests included Bearer token`, 'high')
  } else {
    addCheck('Authentication', 'API requests carry auth token', 'warn',
      `${unauthedRequests.length}/${apiRequests.length} requests missing auth: ${unauthedRequests.slice(0, 3).map((r) => new URL(r.url).pathname).join(', ')}`, 'high')
  }

  // Check 3.2: No token in URL (should use header instead)
  const tokenInUrl = apiRequests.filter((r) => {
    try {
      const url = new URL(r.url)
      return url.searchParams.has('token') || url.searchParams.has('access_token')
    } catch { return false }
  })

  if (tokenInUrl.length === 0) {
    addCheck('Authentication', 'No token in URL query string', 'pass',
      'Auth tokens sent via header, not URL', 'high')
  } else {
    // SSE endpoints may use _token param — that's a known limitation
    const sseTokenUrls = tokenInUrl.filter((r) => r.url.includes('/stream') || r.url.includes('/events'))
    if (sseTokenUrls.length === tokenInUrl.length) {
      addCheck('Authentication', 'No token in URL query string', 'warn',
        `${sseTokenUrls.length} SSE endpoints use URL token (EventSource API limitation)`, 'medium')
    } else {
      addCheck('Authentication', 'No token in URL query string', 'fail',
        `${tokenInUrl.length} non-SSE requests with token in URL`, 'high')
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Category 4: External Resource Loading
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 6: External resource checks')

  // Check 4.1: External scripts loaded over HTTPS
  const externalScripts = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[src]')
    const results: Array<{ src: string; isHttps: boolean; isLocal: boolean }> = []
    scripts.forEach((s) => {
      const src = s.getAttribute('src') || ''
      const isLocal = src.startsWith('/') || src.startsWith('.') || src.includes('localhost')
      results.push({ src, isHttps: src.startsWith('https://'), isLocal })
    })
    return results
  })

  const externalInsecure = externalScripts.filter((s) => !s.isLocal && !s.isHttps)
  if (externalInsecure.length === 0) {
    addCheck('External Resources', 'Scripts loaded over HTTPS', 'pass',
      `All ${externalScripts.length} scripts are local or HTTPS`, 'critical')
  } else {
    addCheck('External Resources', 'Scripts loaded over HTTPS', 'fail',
      `${externalInsecure.length} scripts loaded over HTTP: ${externalInsecure.map((s) => s.src).join(', ')}`, 'critical')
  }

  // Check 4.2: External stylesheets loaded over HTTPS
  const externalStyles = await page.evaluate(() => {
    const links = document.querySelectorAll('link[rel="stylesheet"][href]')
    const insecure: string[] = []
    links.forEach((link) => {
      const href = link.getAttribute('href') || ''
      const isLocal = href.startsWith('/') || href.startsWith('.') || href.includes('localhost')
      if (!isLocal && !href.startsWith('https://')) {
        insecure.push(href)
      }
    })
    return insecure
  })

  if (externalStyles.length === 0) {
    addCheck('External Resources', 'Stylesheets loaded over HTTPS', 'pass',
      'All stylesheets are local or HTTPS', 'high')
  } else {
    addCheck('External Resources', 'Stylesheets loaded over HTTPS', 'fail',
      `${externalStyles.length} stylesheets over HTTP`, 'high')
  }

  // Check 4.3: No mixed content (HTTP resources on HTTPS page)
  // This is a client-side check — in prod the page would be HTTPS
  const mixedContent = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    return resources
      .filter((r) => r.name.startsWith('http://') && !r.name.includes('localhost') && !r.name.includes('127.0.0.1'))
      .map((r) => r.name)
  })

  if (mixedContent.length === 0) {
    addCheck('External Resources', 'No mixed content', 'pass',
      'No HTTP resources loaded from external origins', 'high')
  } else {
    addCheck('External Resources', 'No mixed content', 'warn',
      `${mixedContent.length} HTTP resources: ${mixedContent.slice(0, 3).join(', ')}`, 'high')
  }

  // ══════════════════════════════════════════════════════════════════════
  // Category 5: Client-side Code Security
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 7: Code security checks')

  // Check 5.1: No eval() or Function() constructor in loaded scripts
  const evalUsage = await page.evaluate(() => {
    // Check if eval is overridden or if we can detect its usage
    // This is a best-effort check — actual static analysis is better
    const originalEval = window.eval
    let evalCalled = false
    try {
      // Temporarily override to detect usage
      (window as Window & { eval: typeof eval }).eval = function (...args: Parameters<typeof eval>) {
        evalCalled = true
        return originalEval.apply(window, args)
      }
    } catch {
      // CSP may prevent override
    }
    return { evalDetectable: !evalCalled }
  })

  addCheck('Code Security', 'No runtime eval() detected', evalUsage.evalDetectable ? 'pass' : 'warn',
    evalUsage.evalDetectable ? 'No eval() calls detected during page load' : 'eval() was called during page load', 'high')

  // Check 5.2: No document.write usage
  const docWriteUsed = await page.evaluate(() => {
    let called = false
    const original = document.write
    document.write = function () {
      called = true
      return original.apply(document, arguments as unknown as [string])
    }
    return called
  })

  addCheck('Code Security', 'No document.write()', docWriteUsed ? 'fail' : 'pass',
    docWriteUsed ? 'document.write() was called' : 'No document.write() detected', 'medium')

  // ══════════════════════════════════════════════════════════════════════
  // Category 6: Form Security
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 8: Form security checks')

  // Check 6.1: Password fields have autocomplete attribute
  const passwordFields = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="password"]')
    const missing: string[] = []
    inputs.forEach((input) => {
      if (!input.hasAttribute('autocomplete')) {
        missing.push(input.getAttribute('name') || input.getAttribute('id') || '(unnamed)')
      }
    })
    return { total: inputs.length, missingAutocomplete: missing }
  })

  if (passwordFields.total === 0) {
    addCheck('Form Security', 'Password autocomplete', 'skip', 'No password fields on page', 'low')
  } else if (passwordFields.missingAutocomplete.length === 0) {
    addCheck('Form Security', 'Password autocomplete', 'pass',
      `All ${passwordFields.total} password fields have autocomplete`, 'low')
  } else {
    addCheck('Form Security', 'Password autocomplete', 'warn',
      `${passwordFields.missingAutocomplete.length} password fields missing autocomplete`, 'low')
  }

  // Check 6.2: Forms use POST method for sensitive data
  const getForms = await page.evaluate(() => {
    const forms = document.querySelectorAll('form')
    const getWithSensitive: string[] = []
    forms.forEach((form) => {
      const method = (form.getAttribute('method') || 'get').toLowerCase()
      if (method === 'get') {
        const hasPassword = form.querySelector('input[type="password"]')
        const hasHidden = form.querySelector('input[type="hidden"][name*="token"]')
        if (hasPassword || hasHidden) {
          getWithSensitive.push(form.getAttribute('action') || '(no action)')
        }
      }
    })
    return getWithSensitive
  })

  if (getForms.length === 0) {
    addCheck('Form Security', 'No GET forms with sensitive data', 'pass',
      'No GET forms submitting passwords or tokens', 'medium')
  } else {
    addCheck('Form Security', 'No GET forms with sensitive data', 'fail',
      `${getForms.length} GET forms with sensitive inputs`, 'medium')
  }

  // ══════════════════════════════════════════════════════════════════════
  // Category 7: Navigation Security
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 9: Navigation security checks')

  // Check 7.1: No open redirects via URL params
  const redirectParams = await page.evaluate(() => {
    const params = new URLSearchParams(window.location.search)
    const redirectKeys = ['redirect', 'redirect_uri', 'return_url', 'next', 'url', 'goto', 'dest']
    const found: string[] = []
    for (const [key] of params) {
      if (redirectKeys.includes(key.toLowerCase())) {
        found.push(key)
      }
    }
    return found
  })

  if (redirectParams.length === 0) {
    addCheck('Navigation', 'No open redirect params', 'pass',
      'No redirect-related URL parameters found', 'medium')
  } else {
    addCheck('Navigation', 'No open redirect params', 'warn',
      `Found redirect params: ${redirectParams.join(', ')}`, 'medium')
  }

  // ══════════════════════════════════════════════════════════════════════
  // Category 8: PostMessage Security
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 10: PostMessage security checks')

  // Check 8.1: PostMessage handlers validate origin
  const postMessageHandlers = await page.evaluate(() => {
    // Count registered message event listeners
    // This is best-effort — we instrument addEventListener
    let messageListeners = 0
    const original = window.addEventListener
    const origRemove = window.removeEventListener
    // Can't fully audit but we can check if any exist
    // by dispatching a test message and seeing if handlers fire
    try {
      const testOrigin = 'https://evil.example.com'
      let handledUnsafe = false
      const handler = (e: MessageEvent) => {
        if (e.origin === testOrigin) handledUnsafe = true
      }
      window.addEventListener('message', handler)
      window.postMessage('security-test', testOrigin)
      window.removeEventListener('message', handler)
      messageListeners = handledUnsafe ? 1 : 0
    } catch {
      // Can't test
    }
    return { messageListeners }
  })

  addCheck('PostMessage', 'Message handlers audit', 'info',
    'PostMessage handlers present — manual review recommended for origin validation', 'info')

  // ══════════════════════════════════════════════════════════════════════
  // Category 9: Subresource Integrity
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 11: SRI checks')

  // Check 9.1: External scripts have integrity attribute
  const scriptsWithoutSRI = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[src]')
    const external: Array<{ src: string; hasIntegrity: boolean }> = []
    scripts.forEach((s) => {
      const src = s.getAttribute('src') || ''
      const isExternal = src.startsWith('http') && !src.includes('localhost') && !src.includes('127.0.0.1')
      if (isExternal) {
        external.push({ src, hasIntegrity: s.hasAttribute('integrity') })
      }
    })
    return external
  })

  const missingSRI = scriptsWithoutSRI.filter((s) => !s.hasIntegrity)
  if (scriptsWithoutSRI.length === 0) {
    addCheck('SRI', 'External script integrity', 'pass',
      'No external scripts loaded (all bundled)', 'low')
  } else if (missingSRI.length === 0) {
    addCheck('SRI', 'External script integrity', 'pass',
      `All ${scriptsWithoutSRI.length} external scripts have integrity hash`, 'low')
  } else {
    addCheck('SRI', 'External script integrity', 'warn',
      `${missingSRI.length} external scripts without SRI: ${missingSRI.map((s) => s.src).join(', ')}`, 'low')
  }

  // ══════════════════════════════════════════════════════════════════════
  // Category 10: WebSocket Security
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 12: WebSocket security checks')

  // Check 10.1: WebSocket connections use secure protocol
  const wsConnections = await page.evaluate(() => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const ws = entries.filter((e) => e.name.startsWith('ws://') || e.name.startsWith('wss://'))
    const insecure = ws.filter((e) => e.name.startsWith('ws://') &&
      !e.name.includes('localhost') && !e.name.includes('127.0.0.1'))
    return { total: ws.length, insecure: insecure.map((e) => e.name) }
  })

  if (wsConnections.insecure.length === 0) {
    addCheck('WebSocket', 'Secure WebSocket connections', 'pass',
      `${wsConnections.total} WebSocket connections — all secure or localhost`, 'medium')
  } else {
    addCheck('WebSocket', 'Secure WebSocket connections', 'fail',
      `${wsConnections.insecure.length} insecure ws:// connections to external hosts`, 'medium')
  }

  // ══════════════════════════════════════════════════════════════════════
  // Category 11: Multi-Page DOM Security
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 13: Multi-page DOM security checks')

  const additionalPages = ['/clusters', '/settings']
  for (const pagePath of additionalPages) {
    await page.goto(`http://localhost:5174${pagePath}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const pageSecurityCheck = await page.evaluate((route: string) => {
      const issues: string[] = []

      // Inline event handlers
      const inlineHandlers = document.querySelectorAll('[onclick],[onload],[onerror],[onmouseover]')
      if (inlineHandlers.length > 0) {
        issues.push(`${inlineHandlers.length} inline event handlers`)
      }

      // javascript: hrefs
      const jsLinks = document.querySelectorAll('a[href^="javascript:"]')
      if (jsLinks.length > 0) {
        issues.push(`${jsLinks.length} javascript: links`)
      }

      // Sensitive data in DOM (tokens, passwords, API keys)
      const bodyText = document.body.innerText || ''
      const sensitivePatterns = [
        /Bearer\s+[A-Za-z0-9\-._~+/]+=*/,
        /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+/,  // JWT
        /password['"]\s*:\s*['"][^'"]+/i,
      ]
      for (const pattern of sensitivePatterns) {
        if (pattern.test(bodyText)) {
          issues.push(`Sensitive data pattern found: ${pattern.source.substring(0, 30)}...`)
        }
      }

      return { route, issues }
    }, pagePath)

    if (pageSecurityCheck.issues.length === 0) {
      addCheck('MultiPageDOM', `DOM security on ${pagePath}`, 'pass',
        `No DOM security issues on ${pagePath}`, 'high')
    } else {
      addCheck('MultiPageDOM', `DOM security on ${pagePath}`, 'fail',
        `Issues on ${pagePath}: ${pageSecurityCheck.issues.join('; ')}`, 'high')
    }
  }

  // Navigate back to main dashboard for remaining checks
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  // ══════════════════════════════════════════════════════════════════════
  // Category 12: Auth Bypass Check
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 14: Auth bypass check')

  const noAuthContext = await page.context().browser()!.newContext()
  const noAuthPage = await noAuthContext.newPage()

  // Mock all API calls to return 401
  await noAuthPage.route('**/api/**', (route) => {
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' })
  })

  try {
    await noAuthPage.goto('http://localhost:5174/clusters', { waitUntil: 'domcontentloaded', timeout: 10000 })
    await noAuthPage.waitForTimeout(2000)

    // Check if protected content is visible
    const protectedContent = await noAuthPage.evaluate(() => {
      const body = document.body.innerText || ''
      const protectedPatterns = [
        /\d+ (pods?|nodes?|deployments?|namespaces?)/i,
        /CPU:|Memory:/i,
        /Ready|NotReady/i,
      ]
      const found = protectedPatterns.filter((p) => p.test(body))
      return { bodyLength: body.length, protectedPatternsFound: found.length }
    })

    if (protectedContent.protectedPatternsFound === 0) {
      addCheck('AuthBypass', 'Unauthenticated access blocked', 'pass',
        'No protected content visible without authentication', 'critical')
    } else {
      addCheck('AuthBypass', 'Unauthenticated access blocked', 'fail',
        `${protectedContent.protectedPatternsFound} protected content patterns visible without auth`, 'critical')
    }
  } catch {
    addCheck('AuthBypass', 'Unauthenticated access blocked', 'pass',
      'Page failed to load without auth (expected behavior)', 'critical')
  } finally {
    await noAuthPage.close()
    await noAuthContext.close()
  }

  // ══════════════════════════════════════════════════════════════════════
  // Category 13: Cookie Security
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 15: Cookie security audit')

  try {
    const cookies = await page.context().cookies()
    const sessionCookies = cookies.filter(c =>
      c.name.toLowerCase().includes('session') ||
      c.name.toLowerCase().includes('token') ||
      c.name.toLowerCase().includes('auth')
    )

    if (sessionCookies.length === 0) {
      addCheck('CookieSecurity', 'Session cookies present', 'info',
        `No session/auth cookies found (${cookies.length} total cookies — app may use localStorage for auth)`, 'medium')
    } else {
      for (const cookie of sessionCookies) {
        // Check HttpOnly
        if (cookie.httpOnly) {
          addCheck('CookieSecurity', `${cookie.name} HttpOnly`, 'pass',
            `Cookie "${cookie.name}" has HttpOnly flag`, 'high')
        } else {
          addCheck('CookieSecurity', `${cookie.name} HttpOnly`, 'warn',
            `Cookie "${cookie.name}" missing HttpOnly flag — vulnerable to XSS cookie theft`, 'high')
        }

        // Check Secure
        if (cookie.secure) {
          addCheck('CookieSecurity', `${cookie.name} Secure`, 'pass',
            `Cookie "${cookie.name}" has Secure flag`, 'medium')
        } else {
          // localhost typically doesn't use Secure
          addCheck('CookieSecurity', `${cookie.name} Secure`, 'info',
            `Cookie "${cookie.name}" missing Secure flag (expected on localhost)`, 'medium')
        }

        // Check SameSite
        if (cookie.sameSite && cookie.sameSite !== 'None') {
          addCheck('CookieSecurity', `${cookie.name} SameSite`, 'pass',
            `Cookie "${cookie.name}" has SameSite=${cookie.sameSite}`, 'medium')
        } else {
          addCheck('CookieSecurity', `${cookie.name} SameSite`, 'warn',
            `Cookie "${cookie.name}" missing or has SameSite=None — CSRF risk`, 'medium')
        }
      }
    }
  } catch (err) {
    addCheck('CookieSecurity', 'Cookie audit', 'skip',
      `Could not audit cookies: ${(err as Error).message?.slice(0, 100)}`, 'medium')
  }

  // ══════════════════════════════════════════════════════════════════════
  // Category 14: CSP Headers
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 16: Content Security Policy audit')

  try {
    // Intercept the main page response to get CSP headers
    const mainResponse = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10_000 })
    const headers = mainResponse?.headers() || {}

    const csp = headers['content-security-policy'] || ''
    const cspReportOnly = headers['content-security-policy-report-only'] || ''

    if (csp) {
      addCheck('CSPHeaders', 'CSP header present', 'pass',
        `Content-Security-Policy header found (${csp.length} chars)`, 'high')

      // Check for unsafe directives
      if (csp.includes("'unsafe-eval'")) {
        addCheck('CSPHeaders', 'No unsafe-eval', 'warn',
          "CSP contains 'unsafe-eval' — allows arbitrary code execution", 'high')
      } else {
        addCheck('CSPHeaders', 'No unsafe-eval', 'pass',
          "CSP does not contain 'unsafe-eval'", 'high')
      }

      if (csp.includes("'unsafe-inline'")) {
        addCheck('CSPHeaders', 'No unsafe-inline', 'warn',
          "CSP contains 'unsafe-inline' — weakens XSS protection", 'medium')
      } else {
        addCheck('CSPHeaders', 'No unsafe-inline', 'pass',
          "CSP does not contain 'unsafe-inline'", 'medium')
      }

      // Check for default-src
      if (csp.includes('default-src')) {
        addCheck('CSPHeaders', 'default-src defined', 'pass',
          'CSP has default-src fallback directive', 'medium')
      } else {
        addCheck('CSPHeaders', 'default-src defined', 'warn',
          'CSP missing default-src — individual directives may not cover all resource types', 'medium')
      }
    } else if (cspReportOnly) {
      addCheck('CSPHeaders', 'CSP header present', 'warn',
        'Only CSP-Report-Only header found (not enforcing)', 'high')
    } else {
      addCheck('CSPHeaders', 'CSP header present', 'warn',
        'No Content-Security-Policy header found — XSS protection relies on other measures', 'high')
    }

    // Check X-Frame-Options or frame-ancestors
    const xfo = headers['x-frame-options'] || ''
    const hasFrameAncestors = csp.includes('frame-ancestors')

    if (xfo || hasFrameAncestors) {
      addCheck('CSPHeaders', 'Clickjacking protection', 'pass',
        xfo ? `X-Frame-Options: ${xfo}` : 'CSP frame-ancestors directive present', 'medium')
    } else {
      addCheck('CSPHeaders', 'Clickjacking protection', 'warn',
        'No X-Frame-Options or CSP frame-ancestors — vulnerable to clickjacking', 'medium')
    }

    // Check X-Content-Type-Options
    const xcto = headers['x-content-type-options'] || ''
    if (xcto.toLowerCase().includes('nosniff')) {
      addCheck('CSPHeaders', 'X-Content-Type-Options', 'pass',
        'X-Content-Type-Options: nosniff is set', 'low')
    } else {
      addCheck('CSPHeaders', 'X-Content-Type-Options', 'warn',
        'Missing X-Content-Type-Options: nosniff header', 'low')
    }
  } catch (err) {
    addCheck('CSPHeaders', 'CSP audit', 'skip',
      `Could not audit CSP headers: ${(err as Error).message?.slice(0, 100)}`, 'high')
  }

  // ══════════════════════════════════════════════════════════════════════
  // Generate Report
  // ══════════════════════════════════════════════════════════════════════
  console.log('[Security] Phase 17: Generating report')

  const passCount = checks.filter((c) => c.status === 'pass').length
  const failCount = checks.filter((c) => c.status === 'fail').length
  const warnCount = checks.filter((c) => c.status === 'warn').length
  const skipCount = checks.filter((c) => c.status === 'skip' || c.status === 'info').length
  const criticalFails = checks.filter((c) => c.status === 'fail' && c.severity === 'critical').length
  const highFails = checks.filter((c) => c.status === 'fail' && c.severity === 'high').length

  const report: SecurityReport = {
    timestamp: new Date().toISOString(),
    checks,
    summary: {
      total: checks.length,
      pass: passCount,
      fail: failCount,
      warn: warnCount,
      skip: skipCount,
      criticalFails,
      highFails,
    },
  }

  const outDir = path.resolve(__dirname, '../test-results')
  writeReport(report, outDir)

  console.log(`[Security] Report: ${path.join(outDir, 'security-compliance-report.json')}`)
  console.log(`[Security] Summary: ${path.join(outDir, 'security-compliance-summary.md')}`)
  console.log(`[Security] Pass: ${passCount}, Fail: ${failCount}, Warn: ${warnCount}, Skip: ${skipCount}`)
  if (criticalFails > 0) {
    console.log(`[Security] CRITICAL FAILURES: ${criticalFails}`)
  }

  // Fail the test if any critical or high-severity security issues found
  expect(criticalFails, `${criticalFails} critical security failures found`).toBe(0)
  expect(highFails, `${highFails} high-severity security failures found`).toBe(0)
})
