#!/usr/bin/env bash
# Run Playwright UX sweep with browser-only reproduced findings output.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${ROOT_DIR}/web"
UX_DIR="${WEB_DIR}/test-results/ux-scan"
RAW_JSON="${UX_DIR}/ux-raw-results.json"
FINDINGS_JSON="${UX_DIR}/ux-findings.json"
SUMMARY_MD="${UX_DIR}/ux-summary.md"
LEGACY_RAW_JSON="${WEB_DIR}/e2e/user-flows/test-results/ux-scan/ux-raw-results.json"

DEFAULT_BASE_URL="http://localhost:8080"
WAIT_ON_TIMEOUT_MS=120000

BASE_URL="${PLAYWRIGHT_BASE_URL:-${DEFAULT_BASE_URL}}"
STORAGE_STATE="${PLAYWRIGHT_STORAGE_STATE:-auth.json}"
AUTO_START_SERVER="${UX_SCAN_AUTOSTART_SERVER:-true}"
PREVIEW_PID=""
PREVIEW_LOG=""

mkdir -p "${UX_DIR}"

cd "${WEB_DIR}"

cleanup() {
  if [[ -n "${PREVIEW_PID}" ]]; then
    kill "${PREVIEW_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${PREVIEW_LOG}" ]]; then
    rm -f "${PREVIEW_LOG}" || true
  fi
}

trap cleanup EXIT

if [[ ! -f "${STORAGE_STATE}" ]]; then
  echo "Missing storage state file: ${WEB_DIR}/${STORAGE_STATE}"
  echo "Generate one with: npx playwright codegen --save-storage=${STORAGE_STATE} ${BASE_URL}"
  exit 1
fi

if ! curl -fsS "${BASE_URL}" >/dev/null 2>&1; then
  BASE_HOST="$(node -e "const u=new URL(process.argv[1]); process.stdout.write(u.hostname)" "${BASE_URL}")"
  BASE_PORT="$(node -e "const u=new URL(process.argv[1]); process.stdout.write(u.port || (u.protocol === 'https:' ? '443' : '80'))" "${BASE_URL}")"

  if [[ "${AUTO_START_SERVER:-true}" == "true" ]] && [[ "${BASE_HOST}" == "localhost" || "${BASE_HOST}" == "127.0.0.1" ]]; then
    echo "Base URL ${BASE_URL} is not reachable. Building and starting local preview server..."
    npm run build
    PREVIEW_LOG="$(mktemp -t ux-scan-preview.XXXXXX.log)"
    npm run preview -- --host "${BASE_HOST}" --port "${BASE_PORT}" >"${PREVIEW_LOG}" 2>&1 &
    PREVIEW_PID=$!

    if ! npx wait-on "${BASE_URL}" --timeout "${WAIT_ON_TIMEOUT_MS}"; then
      echo "Timed out waiting for preview server at ${BASE_URL}"
      echo "Preview logs:"
      cat "${PREVIEW_LOG}" || true
      exit 1
    fi
  else
    echo "Base URL ${BASE_URL} is not reachable."
    echo "Start the app before scanning, or set UX_SCAN_AUTOSTART_SERVER=true for localhost URLs."
    exit 1
  fi
fi

echo "Running UX sweep against ${BASE_URL} with storage state ${STORAGE_STATE}"
set +e
PLAYWRIGHT_BASE_URL="${BASE_URL}" \
PLAYWRIGHT_STORAGE_STATE="${STORAGE_STATE}" \
npx playwright test --config=e2e/user-flows/ux-scan.config.ts
PW_EXIT=$?
set -e

if [[ ! -f "${RAW_JSON}" ]]; then
  if [[ -f "${LEGACY_RAW_JSON}" ]]; then
    mkdir -p "$(dirname "${RAW_JSON}")"
    cp "${LEGACY_RAW_JSON}" "${RAW_JSON}"
  else
    echo "Expected raw Playwright JSON not found at ${RAW_JSON}"
    exit 1
  fi
fi

RAW_JSON_PATH="${RAW_JSON}" FINDINGS_JSON_PATH="${FINDINGS_JSON}" SUMMARY_MD_PATH="${SUMMARY_MD}" node <<'NODE'
const fs = require('fs')
const path = require('path')

const rawPath = process.env.RAW_JSON_PATH
const findingsPath = process.env.FINDINGS_JSON_PATH
const summaryPath = process.env.SUMMARY_MD_PATH

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'))

function titlePathFor(test, suiteTitlePath) {
  const list = []
  if (Array.isArray(suiteTitlePath)) list.push(...suiteTitlePath)
  if (test && test.title) list.push(test.title)
  return list.filter(Boolean)
}

function flattenSuites(suites, parentTitles = [], out = []) {
  for (const suite of suites || []) {
    const nextTitles = suite.title ? [...parentTitles, suite.title] : [...parentTitles]

    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        out.push({
          file: spec.file,
          line: spec.line,
          column: spec.column,
          suiteTitlePath: nextTitles,
          specTitle: spec.title,
          test,
        })
      }
    }

    flattenSuites(suite.suites || [], nextTitles, out)
  }
  return out
}

function normalizeSeverity(status, message) {
  if (status === 'timedOut') return 'high'
  const lower = (message || '').toLowerCase()
  if (lower.includes('console error') || lower.includes('exception')) return 'high'
  if (
    lower.includes('visual') ||
    lower.includes('snapshot') ||
    lower.includes('layout') ||
    lower.includes('overflow') ||
    lower.includes('truncat') ||
    lower.includes('clipped') ||
    lower.includes('color') ||
    lower.includes('spacing')
  ) return 'low'
  if (lower.includes('tohaveurl') || lower.includes('tobevisible') || lower.includes('not.to')) return 'medium'
  return 'medium'
}

function collectAttachments(results) {
  const out = []
  for (const result of results || []) {
    for (const att of result.attachments || []) {
      if (att && att.path) out.push(att.path)
    }
  }
  return out
}

function firstFailureText(results) {
  for (const result of results || []) {
    for (const err of result.errors || []) {
      if (err && (err.message || err.value)) {
        return String(err.message || err.value)
      }
    }
  }
  return 'Playwright assertion failed in browser run.'
}

const tests = flattenSuites(raw.suites || [])
const findings = []

for (const item of tests) {
  const status = item.test.status
  // Only failed/timedOut/interrupted tests are considered issues.
  if (!['failed', 'timedOut', 'interrupted'].includes(status)) continue

  const failureText = firstFailureText(item.test.results)
  const pathBits = titlePathFor(item.test, item.suiteTitlePath)
  const prettyPath = pathBits.join(' > ')

  const attachments = collectAttachments(item.test.results)
  const steps = [
    `Run test: ${prettyPath}`,
    'Open browser at configured base URL and perform the same interaction path.',
    'Observe assertion failure and attached artifact evidence.',
  ]

  findings.push({
    issue: `${item.specTitle || item.test.title} failed`,
    steps,
    expected: 'User flow should complete without UX regressions or assertion failures.',
    actual: failureText,
    severity: normalizeSeverity(status, failureText),
    source: {
      file: item.file,
      line: item.line,
      project: item.test.projectName || 'chromium',
      status,
      reproducedInBrowser: true,
      attachments,
    },
  })
}

const stats = {
  totalTests: tests.length,
  failedTests: findings.length,
  passedTests: tests.filter((t) => t.test.status === 'passed').length,
}

fs.writeFileSync(
  findingsPath,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    reproducedInBrowserOnly: true,
    stats,
    findings,
  }, null, 2),
)

const summaryLines = [
  '# UX Scan Summary',
  '',
  `- Generated: ${new Date().toISOString()}`,
  `- Total tests: ${stats.totalTests}`,
  `- Passed tests: ${stats.passedTests}`,
  `- Findings (browser reproduced): ${stats.failedTests}`,
  '',
]

if (findings.length === 0) {
  summaryLines.push('## Findings')
  summaryLines.push('')
  summaryLines.push('No browser-reproduced UX issues were detected in this run.')
} else {
  summaryLines.push('## Findings')
  summaryLines.push('')
  findings.forEach((f, idx) => {
    summaryLines.push(`### ${idx + 1}. ${f.issue}`)
    summaryLines.push(`- Severity: ${f.severity}`)
    summaryLines.push(`- Expected: ${f.expected}`)
    summaryLines.push(`- Actual: ${f.actual}`)
    summaryLines.push(`- Source: ${f.source.file}:${f.source.line}`)
    if (f.source.attachments.length > 0) {
      summaryLines.push(`- Artifacts: ${f.source.attachments.join(', ')}`)
    }
    summaryLines.push('')
  })
}

fs.writeFileSync(summaryPath, `${summaryLines.join('\n')}\n`)
NODE

echo ""
echo "UX scan completed with Playwright exit code: ${PW_EXIT}"
echo "Reports:"
echo "  Raw Playwright JSON: ${RAW_JSON}"
echo "  Browser findings JSON: ${FINDINGS_JSON}"
echo "  Markdown summary: ${SUMMARY_MD}"
echo "  HTML report: ${UX_DIR}/playwright-report/index.html"
echo "  Artifacts (screenshots/traces/videos): ${UX_DIR}/artifacts"

exit ${PW_EXIT}
