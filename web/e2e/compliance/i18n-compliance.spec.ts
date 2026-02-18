import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type I18nStatus = 'pass' | 'fail' | 'warn' | 'skip' | 'info'

interface I18nCheck {
  category: string
  name: string
  status: I18nStatus
  details: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
}

interface I18nReport {
  timestamp: string
  checks: I18nCheck[]
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

function writeReport(report: I18nReport, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  fs.writeFileSync(
    path.join(outDir, 'i18n-compliance-report.json'),
    JSON.stringify(report, null, 2)
  )

  const lines: string[] = [
    '# Internationalization Compliance Report',
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
    const statusIcon =
      c.status === 'pass' ? 'PASS' :
      c.status === 'fail' ? 'FAIL' :
      c.status === 'warn' ? 'WARN' :
      c.status === 'info' ? 'INFO' : 'SKIP'
    lines.push(`| ${c.category} | ${c.name} | ${c.severity} | ${statusIcon} | ${c.details.replace(/\|/g, '\\|')} |`)
  }

  lines.push('')
  fs.writeFileSync(path.join(outDir, 'i18n-compliance-summary.md'), lines.join('\n'))
}

/** Flatten nested JSON to dot-notation keys */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

// ---------------------------------------------------------------------------
// Mock server setup
// ---------------------------------------------------------------------------

async function setupMockServer(page: Page) {
  await page.route('**/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
  )

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

  await page.route('**/api/**', (route) => {
    const url = route.request().url()
    if (url.includes('/auth/session')) return route.fallback()
    if (url.includes('/stream') || url.includes('/events') || url.includes('/gpu-nodes')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: []\n\n',
      })
    }
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

test('i18n compliance — internationalization audit', async ({ page }) => {
  const checks: I18nCheck[] = []

  function addCheck(
    category: string,
    name: string,
    status: I18nStatus,
    details: string,
    severity: I18nCheck['severity'] = 'medium'
  ) {
    checks.push({ category, name, status, details, severity })
    console.log(`[i18n] ${status.toUpperCase()} [${severity}] ${category}: ${name} — ${details}`)
  }

  // ── Phase 1: Static locale file validation ───────────────────────────
  console.log('[i18n] Phase 1: Locale file validation')

  const localeDir = path.resolve(__dirname, '../../src/locales/en')
  const localeFiles = ['common.json', 'cards.json', 'status.json', 'errors.json']

  let totalKeys = 0
  let emptyValues = 0
  const emptyKeyExamples: string[] = []
  const allNamespaceKeys: Record<string, string[]> = {}

  for (const file of localeFiles) {
    const filePath = path.join(localeDir, file)
    const ns = file.replace('.json', '')

    // Check file exists
    if (!fs.existsSync(filePath)) {
      addCheck('Locale Files', `${file} exists`, 'fail', `Missing locale file: ${file}`, 'critical')
      continue
    }

    // Check valid JSON
    let data: Record<string, unknown>
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      data = JSON.parse(raw)
      addCheck('Locale Files', `${file} valid JSON`, 'pass', `Parsed successfully`, 'critical')
    } catch (e) {
      addCheck('Locale Files', `${file} valid JSON`, 'fail', `Invalid JSON: ${(e as Error).message}`, 'critical')
      continue
    }

    // Flatten and count keys
    const keys = flattenKeys(data)
    allNamespaceKeys[ns] = keys
    totalKeys += keys.length

    // Check for empty values
    for (const key of keys) {
      const parts = key.split('.')
      let val: unknown = data
      for (const p of parts) {
        val = (val as Record<string, unknown>)?.[p]
      }
      if (val === '' || val === null || val === undefined) {
        emptyValues++
        if (emptyKeyExamples.length < 5) {
          emptyKeyExamples.push(`${ns}:${key}`)
        }
      }
    }
  }

  addCheck('Locale Files', 'Translation key count', 'info',
    `${totalKeys} total keys across ${localeFiles.length} namespaces`, 'info')

  if (emptyValues === 0) {
    addCheck('Locale Files', 'No empty translation values', 'pass',
      'All translation keys have non-empty values', 'high')
  } else {
    addCheck('Locale Files', 'No empty translation values', 'warn',
      `${emptyValues} empty values: ${emptyKeyExamples.join(', ')}`, 'high')
  }

  // Check for interpolation patterns — all {{var}} should be consistent
  const interpolationKeys: string[] = []
  for (const [ns, keys] of Object.entries(allNamespaceKeys)) {
    const filePath = path.join(localeDir, `${ns}.json`)
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    for (const key of keys) {
      const parts = key.split('.')
      let val: unknown = data
      for (const p of parts) val = (val as Record<string, unknown>)?.[p]
      if (typeof val === 'string' && val.includes('{{')) {
        interpolationKeys.push(`${ns}:${key}`)
        // Check for malformed interpolation (missing closing braces)
        const openCount = (val.match(/\{\{/g) || []).length
        const closeCount = (val.match(/\}\}/g) || []).length
        if (openCount !== closeCount) {
          addCheck('Locale Files', `Interpolation syntax: ${ns}:${key}`, 'fail',
            `Mismatched interpolation braces in "${val}"`, 'high')
        }
      }
    }
  }

  addCheck('Locale Files', 'Interpolation patterns', 'info',
    `${interpolationKeys.length} keys use {{interpolation}}`, 'info')

  // Check for duplicate keys across namespaces (potential confusion)
  const commonKeys = allNamespaceKeys['common'] || []
  const otherNs = Object.entries(allNamespaceKeys).filter(([ns]) => ns !== 'common')
  const crossDupes: string[] = []
  for (const [ns, keys] of otherNs) {
    for (const key of keys) {
      // Only flag exact top-level duplicates
      const topKey = key.split('.')[0]
      if (commonKeys.some(ck => ck.split('.')[0] === topKey)) {
        crossDupes.push(`common.${topKey} vs ${ns}.${topKey}`)
      }
    }
  }
  // Deduplicate
  const uniqueDupes = [...new Set(crossDupes)]
  if (uniqueDupes.length === 0) {
    addCheck('Locale Files', 'No cross-namespace key conflicts', 'pass',
      'No top-level key collisions between namespaces', 'low')
  } else {
    addCheck('Locale Files', 'No cross-namespace key conflicts', 'info',
      `${uniqueDupes.length} shared top-level keys across namespaces (may be intentional)`, 'info')
  }

  // Check for plural rules — keys with {{count}} should have _one/_other pairs
  const pluralKeys: string[] = []
  const missingPluralForms: string[] = []
  for (const [ns, keys] of Object.entries(allNamespaceKeys)) {
    const filePath = path.join(localeDir, `${ns}.json`)
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    for (const key of keys) {
      const parts = key.split('.')
      let val: unknown = data
      for (const p of parts) val = (val as Record<string, unknown>)?.[p]
      if (typeof val === 'string' && val.includes('{{count}}')) {
        pluralKeys.push(`${ns}:${key}`)
        const baseKey = key.replace(/_one$|_other$|_zero$|_two$|_few$|_many$/, '')
        const hasOne = keys.includes(`${baseKey}_one`)
        const hasOther = keys.includes(`${baseKey}_other`)
        if (!hasOne && !hasOther && !key.endsWith('_one') && !key.endsWith('_other')) {
          missingPluralForms.push(`${ns}:${key}`)
        }
      }
    }
  }

  if (pluralKeys.length === 0) {
    addCheck('Locale Files', 'Plural rules', 'info',
      'No keys with {{count}} interpolation found', 'info')
  } else if (missingPluralForms.length === 0) {
    addCheck('Locale Files', 'Plural rules', 'pass',
      `${pluralKeys.length} plural keys — all have _one/_other forms`, 'medium')
  } else {
    addCheck('Locale Files', 'Plural rules', 'warn',
      `${missingPluralForms.length}/${pluralKeys.length} plural keys missing _one/_other: ${missingPluralForms.slice(0, 5).join(', ')}`, 'medium')
  }

  // ── Phase 2: i18n config validation ──────────────────────────────────
  console.log('[i18n] Phase 2: i18n config validation')

  const i18nConfigPath = path.resolve(__dirname, '../../src/lib/i18n.ts')
  if (fs.existsSync(i18nConfigPath)) {
    const configContent = fs.readFileSync(i18nConfigPath, 'utf-8')

    // Check fallbackLng is set
    if (configContent.includes("fallbackLng: 'en'") || configContent.includes('fallbackLng: "en"')) {
      addCheck('Config', 'Fallback language set to English', 'pass',
        'fallbackLng: "en" configured', 'high')
    } else if (configContent.includes('fallbackLng')) {
      addCheck('Config', 'Fallback language configured', 'pass',
        'fallbackLng is set', 'high')
    } else {
      addCheck('Config', 'Fallback language configured', 'fail',
        'No fallbackLng found — missing translations will show raw keys', 'high')
    }

    // Check escapeValue is false (React handles escaping)
    if (configContent.includes('escapeValue: false')) {
      addCheck('Config', 'React escape handling', 'pass',
        'escapeValue: false — React handles XSS prevention', 'medium')
    }

    // Check supported languages count
    const langMatch = configContent.match(/supportedLngs:\s*\[([^\]]+)\]/)
    if (langMatch) {
      const langs = langMatch[1].split(',').map(l => l.trim().replace(/['"]/g, ''))
      addCheck('Config', 'Supported languages', 'info',
        `${langs.length} languages: ${langs.join(', ')}`, 'info')
    }

    // Check namespace configuration
    if (configContent.includes("namespaces") || configContent.includes("ns:")) {
      addCheck('Config', 'Namespaces configured', 'pass',
        'Translation namespaces are defined', 'medium')
    }

    // Check type safety
    if (configContent.includes('CustomTypeOptions')) {
      addCheck('Config', 'Type-safe translations', 'pass',
        'i18next CustomTypeOptions configured for type-safe t() calls', 'low')
    }
  } else {
    addCheck('Config', 'i18n config file', 'fail', 'i18n.ts config file not found', 'critical')
  }

  // ── Phase 3: Runtime DOM checks ──────────────────────────────────────
  console.log('[i18n] Phase 3: Runtime DOM checks')

  // Capture missing translation warnings
  const missingKeys: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    // i18next logs missing keys as warnings
    if (text.includes('i18next::') && text.includes('missingKey')) {
      missingKeys.push(text.substring(0, 150))
    }
  })

  await setupAuth(page)
  await setupMockServer(page)
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(3_000)

  // Check 3.1: No raw translation keys visible in DOM
  // Raw keys look like "namespace:key.path" or "key.path.subpath" patterns
  const rawKeysInDOM = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const rawKeys: string[] = []
    // Patterns that look like untranslated i18n keys
    const keyPattern = /^(common|cards|status|errors)\.[a-zA-Z]+\.[a-zA-Z]+/
    const dotKeyPattern = /^[a-z]+\.[a-z]+\.[a-z]+$/i

    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim() || ''
      if (text.length > 3 && text.length < 100) {
        if (keyPattern.test(text) || dotKeyPattern.test(text)) {
          rawKeys.push(text.substring(0, 80))
        }
      }
    }
    return rawKeys
  })

  if (rawKeysInDOM.length === 0) {
    addCheck('Runtime', 'No raw translation keys in DOM', 'pass',
      'No namespace:key patterns found in visible text', 'critical')
  } else {
    addCheck('Runtime', 'No raw translation keys in DOM', 'fail',
      `Found ${rawKeysInDOM.length} raw keys: ${rawKeysInDOM.slice(0, 3).join(', ')}`, 'critical')
  }

  // Check 3.2: No unresolved {{interpolation}} in DOM
  const unresolvedInterpolation = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const unresolved: string[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent || ''
      if (/\{\{[a-zA-Z_]+\}\}/.test(text)) {
        unresolved.push(text.trim().substring(0, 80))
      }
    }
    return unresolved
  })

  if (unresolvedInterpolation.length === 0) {
    addCheck('Runtime', 'No unresolved {{interpolation}}', 'pass',
      'All interpolation variables resolved in DOM', 'high')
  } else {
    addCheck('Runtime', 'No unresolved {{interpolation}}', 'fail',
      `Found ${unresolvedInterpolation.length} unresolved: ${unresolvedInterpolation.slice(0, 3).join(', ')}`, 'high')
  }

  // Check 3.3: Spot-check known translations appear correctly
  const spotChecks = [
    { text: 'Dashboard', key: 'common:navigation.dashboard' },
    { text: 'Settings', key: 'common:navigation.settings' },
    { text: 'Add Card', key: 'common:buttons.addCard' },
  ]

  for (const check of spotChecks) {
    const found = await page.evaluate((searchText) => {
      const body = document.body.textContent || ''
      return body.includes(searchText)
    }, check.text)

    if (found) {
      addCheck('Runtime', `Spot check: "${check.text}"`, 'pass',
        `Translation key ${check.key} rendered correctly`, 'medium')
    } else {
      addCheck('Runtime', `Spot check: "${check.text}"`, 'warn',
        `"${check.text}" not found in DOM (may not be visible on this page)`, 'medium')
    }
  }

  // Check 3.4: Missing key warnings from i18next
  if (missingKeys.length === 0) {
    addCheck('Runtime', 'No missing translation key warnings', 'pass',
      'i18next reported no missing keys during page load', 'high')
  } else {
    addCheck('Runtime', 'No missing translation key warnings', 'warn',
      `${missingKeys.length} missing key warning(s): ${missingKeys.slice(0, 3).join('; ')}`, 'high')
  }

  // Check 3.5: html lang attribute set
  const htmlLang = await page.evaluate(() => document.documentElement.lang)
  if (htmlLang && htmlLang.length >= 2) {
    addCheck('Runtime', 'HTML lang attribute set', 'pass',
      `<html lang="${htmlLang}">`, 'medium')
  } else {
    addCheck('Runtime', 'HTML lang attribute set', 'warn',
      'Missing or empty lang attribute on <html> — affects accessibility/SEO', 'medium')
  }

  // ── Phase 4: Language switching ──────────────────────────────────────
  console.log('[i18n] Phase 4: Language switching')

  // Check i18n instance is accessible and language can be changed
  const langSwitchResult = await page.evaluate(() => {
    const i18nInstance = (window as unknown as { i18next?: { language: string; changeLanguage: (lng: string) => Promise<void>; t: (key: string) => string } }).i18next
    if (!i18nInstance) return { available: false, currentLang: '', error: 'i18next not on window' }

    return {
      available: true,
      currentLang: i18nInstance.language,
      // Check a known key translates
      testTranslation: i18nInstance.t('actions.save'),
    }
  })

  if (langSwitchResult.available) {
    addCheck('Language', 'i18next instance accessible', 'pass',
      `Current language: ${langSwitchResult.currentLang}`, 'medium')

    if (langSwitchResult.testTranslation === 'Save') {
      addCheck('Language', 'Translation lookup works', 'pass',
        'actions.save → "Save" (correct)', 'high')
    } else if (langSwitchResult.testTranslation && !langSwitchResult.testTranslation.includes('.')) {
      addCheck('Language', 'Translation lookup works', 'pass',
        `actions.save → "${langSwitchResult.testTranslation}"`, 'high')
    } else {
      addCheck('Language', 'Translation lookup works', 'fail',
        `actions.save returned raw key: "${langSwitchResult.testTranslation}"`, 'high')
    }
  } else {
    addCheck('Language', 'i18next instance accessible', 'skip',
      'i18next not exposed on window — runtime check skipped', 'medium')
  }

  // Check that changing language updates localStorage
  const langPersistence = await page.evaluate(() => {
    const stored = localStorage.getItem('i18nextLng')
    return { stored }
  })

  if (langPersistence.stored) {
    addCheck('Language', 'Language persisted to localStorage', 'pass',
      `i18nextLng="${langPersistence.stored}" in localStorage`, 'medium')
  } else {
    addCheck('Language', 'Language persisted to localStorage', 'info',
      'No i18nextLng in localStorage (may use browser default)', 'info')
  }

  // ── Phase 5: Hardcoded string audit ──────────────────────────────────
  console.log('[i18n] Phase 5: Hardcoded string detection')

  // Check for long English strings in DOM that should probably be translated
  // This is heuristic — we look for strings > 20 chars that are likely user-facing
  const hardcodedStrings = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const candidates: string[] = []
    // Words that suggest user-facing text (not technical labels or data)
    const userFacingPatterns = [
      /^(Click|Press|Drag|Select|Choose|Enter|Type|Please|You can|This will|Are you sure)/i,
      /\b(failed|success|error|warning|loading|saving|deleting)\b.*\./i,
    ]

    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim() || ''
      // Skip very short, very long, or purely numeric text
      if (text.length < 25 || text.length > 200) continue
      // Skip if inside script/style
      const parent = node.parentElement
      if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') continue
      // Skip if parent is hidden
      if (parent.offsetParent === null && parent.tagName !== 'BODY') continue

      if (userFacingPatterns.some(p => p.test(text))) {
        candidates.push(text.substring(0, 80))
      }
    }
    return candidates
  })

  if (hardcodedStrings.length === 0) {
    addCheck('Hardcoded Strings', 'No obvious hardcoded user-facing text', 'pass',
      'No long English instruction strings detected outside i18n', 'medium')
  } else if (hardcodedStrings.length <= 5) {
    addCheck('Hardcoded Strings', 'Potential hardcoded strings detected', 'info',
      `${hardcodedStrings.length} candidate(s): ${hardcodedStrings.slice(0, 2).join('; ')}`, 'info')
  } else {
    addCheck('Hardcoded Strings', 'Potential hardcoded strings detected', 'warn',
      `${hardcodedStrings.length} potential hardcoded strings — consider extracting to locale files`, 'medium')
  }

  // Phase 5b: Classify hardcoded strings by element type (severity based on context)
  const classifiedStrings = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const results: Array<{ text: string; element: string; severity: 'high' | 'medium' | 'low' }> = []
    const highPriorityTags = ['BUTTON', 'LABEL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A', 'TH']
    const mediumPriorityTags = ['P', 'SPAN', 'LI', 'TD', 'LEGEND', 'SUMMARY']
    const userFacingPatterns = [
      /^(Click|Press|Select|Choose|Enter|Please|You can|This will)/i,
      /\b(failed|success|error|warning|loading|saving)\b.*\./i,
    ]

    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim() || ''
      if (text.length < 20 || text.length > 200) continue
      const parent = node.parentElement
      if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') continue
      if (!userFacingPatterns.some(p => p.test(text))) continue

      const tag = parent.tagName
      let severity: 'high' | 'medium' | 'low' = 'low'
      if (highPriorityTags.includes(tag)) severity = 'high'
      else if (mediumPriorityTags.includes(tag)) severity = 'medium'

      results.push({ text: text.substring(0, 60), element: tag, severity })
    }
    return results
  })

  const highPriority = classifiedStrings.filter(s => s.severity === 'high')
  const medPriority = classifiedStrings.filter(s => s.severity === 'medium')

  if (highPriority.length > 0) {
    addCheck('Hardcoded Strings', 'High-priority untranslated strings', 'fail',
      `${highPriority.length} in buttons/headings/labels: ${highPriority.slice(0, 2).map(s => `<${s.element}> "${s.text}"`).join('; ')}`, 'high')
  }
  if (medPriority.length > 0) {
    addCheck('Hardcoded Strings', 'Medium-priority untranslated strings', 'warn',
      `${medPriority.length} in body text: ${medPriority.slice(0, 2).map(s => `<${s.element}> "${s.text}"`).join('; ')}`, 'medium')
  }
  if (highPriority.length === 0 && medPriority.length === 0 && classifiedStrings.length === 0) {
    addCheck('Hardcoded Strings', 'No classified hardcoded strings', 'pass',
      'No user-facing strings found in high/medium priority elements', 'medium')
  }

  // ── Phase 5c: Known translation spot-checks ─────────────────────────
  console.log('[i18n] Phase 5c: Known translation spot-checks')

  // Verify known UI strings are actually translated (not raw keys)
  const spotCheckRoutes = [
    { route: '/', checks: ['Dashboard', 'Clusters', 'Settings'] },
    { route: '/clusters', checks: ['Clusters', 'Status', 'Nodes'] },
    { route: '/settings', checks: ['Settings', 'Theme', 'Language'] },
    { route: '/security', checks: ['Security'] },
    { route: '/deployments', checks: ['Deployments'] },
  ]

  let spotChecksPassed = 0
  let spotChecksFailed = 0

  for (const { route, checks: expectedTexts } of spotCheckRoutes) {
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 10_000 })
      await page.waitForTimeout(1_500)

      const bodyText = await page.evaluate(() => document.body.innerText || '')

      for (const expected of expectedTexts) {
        if (bodyText.includes(expected)) {
          spotChecksPassed++
        } else {
          spotChecksFailed++
          addCheck('SpotCheck', `"${expected}" on ${route}`, 'warn',
            `Expected text "${expected}" not found on ${route} — may be untranslated or missing`, 'medium')
        }
      }
    } catch {
      addCheck('SpotCheck', `Route ${route}`, 'skip',
        `Could not load ${route} for spot-check`, 'low')
    }
  }

  const totalSpotChecks = spotChecksPassed + spotChecksFailed
  if (totalSpotChecks > 0) {
    addCheck('SpotCheck', `Known translations verification`, spotChecksFailed === 0 ? 'pass' : 'warn',
      `${spotChecksPassed}/${totalSpotChecks} known translations found`, 'medium')
  }

  // ── Phase 6: Navigate multiple pages to expand coverage ──────────────
  console.log('[i18n] Phase 6: Multi-page navigation checks')

  const pages = ['/clusters', '/settings', '/compute', '/security', '/deployments', '/gpu-reservations', '/helm']
  let pagesWithRawKeys = 0

  for (const pagePath of pages) {
    await page.goto(pagePath, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForTimeout(1_500)

    const rawKeys = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const found: string[] = []
      const keyPattern = /^(common|cards|status|errors)[:.][\w.]+$/
      let node: Node | null
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim() || ''
        if (text.length > 3 && text.length < 100 && keyPattern.test(text)) {
          found.push(text)
        }
      }
      return found
    })

    if (rawKeys.length > 0) {
      pagesWithRawKeys++
      addCheck('Multi-Page', `Raw keys on ${pagePath}`, 'fail',
        `Found ${rawKeys.length}: ${rawKeys.slice(0, 3).join(', ')}`, 'high')
    }

    // Check for unresolved interpolation on this page too
    const unresolved = await page.evaluate(() => {
      const body = document.body.textContent || ''
      const matches = body.match(/\{\{[a-zA-Z_]+\}\}/g) || []
      return matches
    })

    if (unresolved.length > 0) {
      addCheck('Multi-Page', `Unresolved interpolation on ${pagePath}`, 'warn',
        `Found ${unresolved.length}: ${unresolved.slice(0, 3).join(', ')}`, 'medium')
    }
  }

  if (pagesWithRawKeys === 0) {
    addCheck('Multi-Page', 'No raw keys across pages', 'pass',
      `Checked ${pages.length} additional pages — all clean`, 'high')
  }

  // ── Phase 7: RTL readiness check ─────────────────────────────────────
  console.log('[i18n] Phase 7: RTL readiness')

  const rtlReadiness = await page.evaluate(() => {
    const html = document.documentElement
    const hasDir = html.hasAttribute('dir')
    const dirValue = html.getAttribute('dir') || 'not set'

    // Check if CSS uses logical properties (a sign of RTL readiness)
    const styles = document.querySelectorAll('style')
    let hasLogicalProps = false
    styles.forEach(s => {
      const text = s.textContent || ''
      if (/margin-inline|padding-inline|inset-inline|border-inline/.test(text)) {
        hasLogicalProps = true
      }
    })

    return { hasDir, dirValue, hasLogicalProps }
  })

  addCheck('RTL', 'Text direction attribute', rtlReadiness.hasDir ? 'pass' : 'info',
    rtlReadiness.hasDir ? `dir="${rtlReadiness.dirValue}"` : 'No dir attribute — defaults to LTR',
    'low')

  // ══════════════════════════════════════════════════════════════════════
  // Generate Report
  // ══════════════════════════════════════════════════════════════════════
  console.log('[i18n] Phase 8: Generating report')

  const passCount = checks.filter(c => c.status === 'pass').length
  const failCount = checks.filter(c => c.status === 'fail').length
  const warnCount = checks.filter(c => c.status === 'warn').length
  const skipCount = checks.filter(c => c.status === 'skip' || c.status === 'info').length
  const criticalFails = checks.filter(c => c.status === 'fail' && c.severity === 'critical').length
  const highFails = checks.filter(c => c.status === 'fail' && c.severity === 'high').length

  const report: I18nReport = {
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

  console.log(`[i18n] Report: ${path.join(outDir, 'i18n-compliance-report.json')}`)
  console.log(`[i18n] Summary: ${path.join(outDir, 'i18n-compliance-summary.md')}`)
  console.log(`[i18n] Pass: ${passCount}, Fail: ${failCount}, Warn: ${warnCount}, Skip: ${skipCount}`)

  // Fail the test only on critical or high-severity issues
  expect(criticalFails, `${criticalFails} critical i18n failures found`).toBe(0)
  expect(highFails, `${highFails} high-severity i18n failures found`).toBe(0)
})
