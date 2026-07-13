#!/usr/bin/env node
/**
 * Enriches existing install missions with uninstall, upgrade, and troubleshooting sections.
 * Reads each install-*.json, calls LLM for the 3 missing sections, merges them back.
 *
 * Environment variables:
 *   GITHUB_TOKEN       — GitHub Models auth
 *   TARGET_PROJECTS    — comma-separated file names to process (empty = all)
 *   BATCH_INDEX        — batch index for parallelism
 *   BATCH_SIZE         — files per batch (default 20)
 *   DRY_RUN            — if 'true', no files written
 *   CONCURRENCY        — parallel LLM calls (default 3)
 */
import { writeFileSync, readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const DRY_RUN = process.env.DRY_RUN === 'true'
const BATCH_INDEX = process.env.BATCH_INDEX != null ? parseInt(process.env.BATCH_INDEX, 10) : null
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '20', 10)
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10)
const TARGET_PROJECTS = process.env.TARGET_PROJECTS
  ? process.env.TARGET_PROJECTS.split(',').map(s => s.trim()).filter(Boolean)
  : null
const SOLUTIONS_DIR = join(process.cwd(), 'fixes', 'cncf-install')

const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://models.inference.ai.azure.com/chat/completions'
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'
const LLM_TIMEOUT_MS = 60_000

export const ALLOWED_ENDPOINT_PREFIXES = [
  'https://models.inference.ai.azure.com/',
  'https://api.openai.com/',
  'https://api.githubcopilot.com/',
]

/**
 * Asserts that an LLM endpoint URL starts with an approved prefix (CWE-441: prevent SSRF).
 * Throws if the endpoint is not trusted.
 */
export function assertTrustedEndpoint(endpoint, allowedPrefixes = ALLOWED_ENDPOINT_PREFIXES) {
  if (!allowedPrefixes.some(prefix => endpoint.startsWith(prefix))) {
    throw new Error(`Untrusted LLM_ENDPOINT: ${endpoint}. Must start with one of: ${allowedPrefixes.join(', ')}`)
  }
}

// Validate LLM_ENDPOINT at module load time (CWE-441: prevent SSRF)
assertTrustedEndpoint(LLM_ENDPOINT)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ─── Prompt ──────────────────────────────────────────────────────────

const ENRICH_SYSTEM_PROMPT = `You are an expert Kubernetes technical writer. You are given an EXISTING install mission for a CNCF project. The mission already has install steps. Your job is to generate ONLY the missing sections: uninstall, upgrade, and troubleshooting.

Your output MUST be a JSON object with exactly these 3 fields:
{
  "uninstall": [
    {
      "title": "Short imperative title (e.g. 'Remove the Helm release')",
      "description": "Detailed step to cleanly remove the project. Include cleanup of CRDs, namespaces, PVCs, etc. Use code blocks for commands."
    }
  ],
  "upgrade": [
    {
      "title": "Short imperative title (e.g. 'Update the Helm repository')",
      "description": "Detailed step to upgrade/update an existing installation. Include backup steps, version checks, and rollback instructions. Use code blocks for commands."
    }
  ],
  "troubleshooting": [
    {
      "title": "Short title describing the issue (e.g. 'Pods stuck in CrashLoopBackOff')",
      "description": "Description of the problem, how to diagnose it, and the fix. Include exact diagnostic commands in code blocks."
    }
  ]
}

Rules:
- "uninstall" MUST have EXACTLY 3 separate steps as 3 separate objects: (1) remove the release/deployment, (2) clean up CRDs and persistent resources, (3) remove namespace and verify
- "upgrade" MUST have EXACTLY 3 separate steps as 3 separate objects: (1) backup current state, (2) update repo and run upgrade command, (3) verify the upgrade
- "troubleshooting" MUST have EXACTLY 4 separate items as 4 separate objects, each a different common issue
- IMPORTANT: Each step must be its OWN object in the array with its OWN title and description. Do NOT combine multiple steps into one.
- All commands must be copy-pasteable — never say "see the documentation"
- Use the SAME namespace, release name, and tool (helm/kubectl/etc.) from the existing install steps
- Pin versions where possible
- Do NOT repeat install steps — only generate the 3 new sections`

function buildEnrichPrompt(mission) {
  const title = mission.mission?.title || 'Unknown'
  const description = mission.mission?.description || ''
  const steps = (mission.mission?.steps || [])
    .map((s, i) => `${i + 1}. **${s.title}**\n${s.description}`)
    .join('\n\n')
  const methods = (mission.metadata?.installMethods || []).join(', ')
  const projects = (mission.metadata?.cncfProjects || []).join(', ')

  return `# Existing Install Mission

**Title:** ${title}
**Description:** ${description}
**CNCF Project(s):** ${projects}
**Install Methods:** ${methods}

## Current Install Steps

${steps}

---

Based on the above install mission, generate the uninstall, upgrade, and troubleshooting sections. Use the same namespace, release name, and tools shown in the install steps. Return JSON only.`
}

/**
 * Sanitizes file-derived mission content before including it in an HTTP request body.
 * File content is considered untrusted input (contributor PRs can modify it);
 * explicit length limits and allowlist checks prevent exfiltration of unexpected
 * data and SSRF via embedded URLs (CWE-441 / file-access-to-http).
 */
function sanitizeMissionForHTTP(mission) {
  const clampStr = (s, max) => (typeof s === 'string' ? s.slice(0, max) : '')
  const steps = (mission.mission?.steps || []).slice(0, 20).map(s => ({
    title: clampStr(s.title, 200),
    description: clampStr(s.description, 2000),
  }))
  const installMethods = (mission.metadata?.installMethods || [])
    .filter(m => typeof m === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(m))
    .slice(0, 10)
  const cncfProjects = (mission.metadata?.cncfProjects || [])
    .filter(p => typeof p === 'string' && /^[a-z][a-z0-9-]{0,60}$/.test(p))
    .slice(0, 10)
  return {
    mission: {
      title: clampStr(mission.mission?.title, 200),
      description: clampStr(mission.mission?.description, 500),
      steps,
    },
    metadata: { installMethods, cncfProjects },
  }
}

// ─── LLM Call ────────────────────────────────────────────────────────

async function callLLM(mission) {
  const token = process.env.LLM_TOKEN || GITHUB_TOKEN
  if (!token) return null

  const prompt = buildEnrichPrompt(mission)

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const response = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            { role: 'system', content: ENRICH_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 2500,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      })

      if (response.status === 429) {
        const wait = parseInt(response.headers.get('retry-after') || '10', 10)
        console.warn(`  [LLM] Rate limited, waiting ${wait}s`)
        await sleep(wait * 1000)
        continue
      }
      if (!response.ok) {
        console.warn(`  [LLM] API error ${response.status}`)
        return null
      }

      // Validate Content-Type and enforce a response size ceiling before using HTTP-derived
      // bytes that will be merged into file-backed mission data (CWE-434 / http-to-file).
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        console.warn(`  [LLM] Unexpected Content-Type: ${contentType.slice(0, 100)}`)
        return null
      }
      const MAX_LLM_RESPONSE_BYTES = 500_000
      const rawText = await response.text()
      if (rawText.length > MAX_LLM_RESPONSE_BYTES) {
        console.warn(`  [LLM] Response too large (${rawText.length} bytes), rejecting`)
        return null
      }
      const data = JSON.parse(rawText)
      const content = data.choices?.[0]?.message?.content
      if (!content) return null

      const parsed = JSON.parse(content)
      return parsed
    } catch (err) {
      console.warn(`  [LLM] ${err.name === 'AbortError' ? 'Timeout' : err.message} (attempt ${attempt + 1})`)
      if (attempt < 2) await sleep(3000 * (attempt + 1))
    }
  }
  return null
}

// ─── Validation ──────────────────────────────────────────────────────

function validateSection(steps, name, minCount) {
  if (!Array.isArray(steps) || steps.length < minCount) return false
  return steps.every(s => s.title && typeof s.title === 'string' && s.description && typeof s.description === 'string')
}

function sanitizeSteps(steps, maxTitle = 120, maxDesc = 3000) {
  return steps.map(s => ({
    title: s.title.slice(0, maxTitle),
    description: s.description.slice(0, maxDesc),
  }))
}

// ─── Main ────────────────────────────────────────────────────────────

async function enrichFile(filePath, fileName) {
  const raw = readFileSync(filePath, 'utf-8')
  const mission = JSON.parse(raw)

  // Skip if already enriched
  const m = mission.mission || {}
  if (m.uninstall?.length > 0 && m.upgrade?.length > 0 && m.troubleshooting?.length > 0) {
    return { status: 'skipped', reason: 'already enriched' }
  }

  console.log(`  Enriching ${fileName}...`)
  const result = await callLLM(sanitizeMissionForHTTP(mission))

  if (!result) {
    return { status: 'error', reason: 'LLM returned null' }
  }

  // Validate all 3 sections
  const hasUninstall = validateSection(result.uninstall, 'uninstall', 1)
  const hasUpgrade = validateSection(result.upgrade, 'upgrade', 1)
  const hasTrouble = validateSection(result.troubleshooting, 'troubleshooting', 1)

  if (!hasUninstall && !hasUpgrade && !hasTrouble) {
    return { status: 'error', reason: 'All sections invalid' }
  }

  // Merge into mission — only add sections that are valid AND missing
  let sectionsAdded = 0
  if (hasUninstall && !(m.uninstall?.length > 0)) {
    mission.mission.uninstall = sanitizeSteps(result.uninstall)
    sectionsAdded++
  }
  if (hasUpgrade && !(m.upgrade?.length > 0)) {
    mission.mission.upgrade = sanitizeSteps(result.upgrade)
    sectionsAdded++
  }
  if (hasTrouble && !(m.troubleshooting?.length > 0)) {
    mission.mission.troubleshooting = sanitizeSteps(result.troubleshooting)
    sectionsAdded++
  }

  if (sectionsAdded === 0) {
    return { status: 'skipped', reason: 'no new sections needed' }
  }

  if (!DRY_RUN) {
    writeFileSync(filePath, JSON.stringify(mission, null, 2) + '\n')
  }

  return {
    status: 'enriched',
    sections: sectionsAdded,
    uninstall: hasUninstall ? (result.uninstall?.length || 0) : 0,
    upgrade: hasUpgrade ? (result.upgrade?.length || 0) : 0,
    troubleshooting: hasTrouble ? (result.troubleshooting?.length || 0) : 0,
  }
}

async function main() {
  console.log('=== Enrich Install Missions ===')
  console.log(`Model: ${LLM_MODEL} | DRY_RUN: ${DRY_RUN} | Concurrency: ${CONCURRENCY}`)

  if (!GITHUB_TOKEN && !process.env.LLM_TOKEN) {
    console.error('GITHUB_TOKEN or LLM_TOKEN required')
    process.exit(1)
  }

  let files = readdirSync(SOLUTIONS_DIR)
    .filter(f => f.startsWith('install-') && f.endsWith('.json'))
    .sort()

  if (TARGET_PROJECTS) {
    files = files.filter(f => TARGET_PROJECTS.some(t => f.includes(t)))
  }

  // Batch slicing
  if (BATCH_INDEX != null) {
    const start = BATCH_INDEX * BATCH_SIZE
    const end = start + BATCH_SIZE
    console.log(`Batch ${BATCH_INDEX}: files ${start}–${Math.min(end, files.length) - 1} of ${files.length}`)
    files = files.slice(start, end)
  }

  console.log(`Processing ${files.length} files\n`)

  const report = { enriched: 0, skipped: 0, errors: 0, total: files.length }

  // Process with concurrency limit
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (fileName) => {
        const filePath = join(SOLUTIONS_DIR, fileName)
        try {
          const result = await enrichFile(filePath, fileName)
          if (result.status === 'enriched') {
            console.log(`  ✅ ${fileName}: +${result.sections} sections (u:${result.uninstall} up:${result.upgrade} t:${result.troubleshooting})`)
            report.enriched++
          } else if (result.status === 'skipped') {
            console.log(`  ⏭️  ${fileName}: ${result.reason}`)
            report.skipped++
          } else {
            console.log(`  ❌ ${fileName}: ${result.reason}`)
            report.errors++
          }
          return result
        } catch (err) {
          console.error(`  ❌ ${fileName}: ${err.message}`)
          report.errors++
          return { status: 'error', reason: err.message }
        }
      })
    )
    // Brief pause between batches
    if (i + CONCURRENCY < files.length) await sleep(500)
  }

  console.log(`\n=== Report ===`)
  console.log(`Enriched: ${report.enriched} | Skipped: ${report.skipped} | Errors: ${report.errors} | Total: ${report.total}`)

  if (report.errors > report.total * 0.3) {
    console.error('Too many errors (>30%), exiting with failure')
    process.exit(1)
  }
}

if (process.argv[1]?.endsWith('enrich-install-missions.mjs')) {
  main().catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
}
