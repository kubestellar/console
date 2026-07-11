#!/usr/bin/env node
/**
 * Generates install + configure missions for Kubernetes platforms, managed
 * services, and popular cluster operators — version-aware.
 *
 * Reuses the same scanner / quality-scorer / index builder as the CNCF
 * install generator, but with a platform-specific LLM prompt that asks
 * for version-specific instructions, provider-specific CLI steps,
 * and upgrade/troubleshooting paths per platform version.
 *
 * Environment variables:
 *   GITHUB_TOKEN       — GitHub API auth
 *   LLM_TOKEN          — GitHub Models PAT (falls back to GITHUB_TOKEN)
 *   TARGET_PLATFORMS    — comma-separated platform names (empty = all)
 *   BATCH_INDEX / BATCH_SIZE — for parallelised workflow runs
 *   DRY_RUN            — if 'true', no files written
 *   FORCE_REGENERATE   — if 'true', overwrite existing missions
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { K8S_PLATFORMS, getPlatformByName } from './k8s-platforms.mjs'
import { OTHER_PROJECTS } from './other-projects.mjs'
import { validateMissionExport, scanForSensitiveData, scanForMaliciousContent } from './scanner.mjs'
import { scoreMission } from './quality-scorer.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Config ──────────────────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const LLM_TOKEN = process.env.LLM_TOKEN || GITHUB_TOKEN
const TARGET_PLATFORMS = process.env.TARGET_PLATFORMS
  ? process.env.TARGET_PLATFORMS.split(',').map(s => s.trim()).filter(Boolean)
  : null
const DRY_RUN = process.env.DRY_RUN === 'true'
const BATCH_INDEX = process.env.BATCH_INDEX != null ? parseInt(process.env.BATCH_INDEX, 10) : null
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '20', 10)
const FORCE_REGENERATE = process.env.FORCE_REGENERATE === 'true'
const QUALITY_THRESHOLD = parseInt(process.env.QUALITY_THRESHOLD || '60', 10)
const DRAFT_THRESHOLD = parseInt(process.env.DRAFT_THRESHOLD || '40', 10)
const SOLUTIONS_DIR = join(process.cwd(), 'fixes', 'platform-install')

/** Missions older than this are considered stale and will be regenerated */
const STALENESS_THRESHOLD_DAYS = parseInt(process.env.STALENESS_DAYS || '14', 10)

const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://models.inference.ai.azure.com/chat/completions'
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '90000', 10)

let rateLimitRemaining = 5000
let rateLimitReset = 0

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

// ─── GitHub API helpers ──────────────────────────────────────────────
async function waitForRateLimit() {
  if (rateLimitRemaining < 10) {
    const waitMs = Math.max(0, (rateLimitReset * 1000) - Date.now()) + 1000
    console.log(`  Rate limit low (${rateLimitRemaining}), waiting ${Math.round(waitMs / 1000)}s...`)
    await sleep(waitMs)
  }
}

async function githubApi(url, options = {}) {
  await waitForRateLimit()
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'platform-install-gen/1.0',
  }
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
    const rem = response.headers.get('x-ratelimit-remaining')
    const rst = response.headers.get('x-ratelimit-reset')
    if (rem != null) rateLimitRemaining = parseInt(rem, 10)
    if (rst != null) rateLimitReset = parseInt(rst, 10)

    if (response.status === 403 && rateLimitRemaining < 5) {
      await sleep(60_000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      console.warn(`  GitHub API ${response.status}: ${url}`)
      return null
    }
    return response.json()
  }
  return null
}

// ─── Knowledge Source Crawling ────────────────────────────────────────
async function crawlPlatformKnowledge(platform) {
  const ctx = { repoMeta: null, readme: '', release: null, helm: '', configs: [] }

  // 1. Repo metadata
  if (platform.repo) {
    ctx.repoMeta = await githubApi(`https://api.github.com/repos/${platform.repo}`)
  }

  // 2. README
  if (platform.repo) {
    const readmeData = await githubApi(`https://api.github.com/repos/${platform.repo}/readme`)
    if (readmeData?.content) {
      try {
        ctx.readme = Buffer.from(readmeData.content, 'base64').toString('utf-8').slice(0, 4000)
      } catch { /* ignore */ }
    }
  }

  // 3. Latest release
  if (platform.repo) {
    ctx.release = await githubApi(`https://api.github.com/repos/${platform.repo}/releases/latest`)
  }

  // 4. Helm chart if it exists
  if (platform.repo) {
    for (const path of ['charts', 'deploy/helm', 'helm', 'chart']) {
      const contents = await githubApi(`https://api.github.com/repos/${platform.repo}/contents/${path}`)
      if (Array.isArray(contents) && contents.length > 0) {
        // Try to find Chart.yaml
        const chartYaml = contents.find(f => f.name === 'Chart.yaml')
        if (chartYaml) {
          const raw = await githubApi(chartYaml.url)
          if (raw?.content) {
            try { ctx.helm = Buffer.from(raw.content, 'base64').toString('utf-8').slice(0, 1500) } catch { /* */ }
          }
        }
        break
      }
    }
  }

  // 5. Configs / manifests
  if (platform.repo) {
    for (const path of ['deploy', 'install', 'config', 'manifests', 'examples']) {
      const contents = await githubApi(`https://api.github.com/repos/${platform.repo}/contents/${path}`)
      if (Array.isArray(contents)) {
        const yamls = contents.filter(f => /\.(ya?ml|json)$/i.test(f.name)).slice(0, 3)
        for (const file of yamls) {
          const raw = await githubApi(file.url)
          if (raw?.content) {
            try {
              ctx.configs.push({
                name: file.name,
                content: Buffer.from(raw.content, 'base64').toString('utf-8').slice(0, 2000)
              })
            } catch { /* */ }
          }
        }
        break
      }
    }
  }

  return ctx
}

// ─── LLM Prompt ──────────────────────────────────────────────────────
const PLATFORM_SYSTEM_PROMPT = `You are a senior Kubernetes platform engineer writing PRODUCTION-GRADE, copy-paste-ready installation missions.

The goal: a user reads your mission and completes the install WITHOUT searching the web. Every command must work. Every step must be specific. Save the user's time.

OUTPUT FORMAT — a single JSON object:
{
  "description": "2-3 sentences: what this is, when to use it, key trade-offs.",
  "platformType": "managed|distribution|local|operator",
  "supportedVersions": ["v1.30","v1.31"],
  "supportedK8sVersions": ["1.29","1.30","1.31"],
  "steps": [
    {
      "title": "Imperative title (e.g. 'Install the CLI')",
      "description": "Plain text explanation of what this step does and why.",
      "commands": [
        { "cmd": "exact shell command", "note": "optional: when/why to use this variant" }
      ]
    }
  ],
  "uninstall": [
    {
      "title": "Imperative title",
      "description": "What gets removed and any data-loss warnings.",
      "commands": [{ "cmd": "exact command" }]
    }
  ],
  "upgrade": [
    {
      "title": "Imperative title",
      "description": "Pre-upgrade checklist, backup, the upgrade, post-upgrade verification, rollback.",
      "commands": [{ "cmd": "exact command", "note": "optional note" }]
    }
  ],
  "troubleshooting": [
    {
      "symptom": "Exact error message or observable symptom",
      "cause": "Root cause in 1-2 sentences",
      "fix": "Exact commands or config change to resolve it",
      "versions": "Which versions are affected (e.g. '<= 1.29' or 'all')"
    }
  ],
  "versionNotes": [
    {
      "version": "v1.31",
      "changes": "Specific features: e.g. 'Added gateway API v1 support, new --enable-feature flag'",
      "deprecations": "Specific deprecations: e.g. 'Removed --legacy-mode flag, PodSecurityPolicy no longer supported'",
      "migrationSteps": "If upgrading from prior version requires action, list exact steps"
    }
  ],
  "resolution": "What the user should see when everything is working (exact kubectl output patterns).",
  "difficulty": "beginner|intermediate|advanced",
  "estimatedMinutes": 15,
  "installMethods": ["cli","helm","kubectl"],
  "prerequisites": {
    "kubernetes": ">=1.25",
    "tools": ["kubectl","helm 3.x"],
    "cloudCLI": "gcloud >= 450.0",
    "resources": "Minimum 2 vCPU, 4GB RAM per node",
    "description": "Prerequisites sentence"
  },
  "containerImages": ["registry/image:tag"],
  "skip": false
}

STRICT RULES:
1. STEPS: Minimum 4 steps for managed/distribution, 3 for operators/local. Each step MUST have a "commands" array with real commands — NEVER "see docs" or "visit website".
2. COMMANDS: Pin every version. Use specific Helm chart versions (e.g. --version 4.10.1), not controller versions. Use release URLs with version tags, never /master/ or /main/ branch refs.
3. MANAGED K8S: Must include (a) CLI install, (b) cluster create with version + node count + region, (c) kubeconfig setup, (d) verify nodes, (e) post-install (autoscaling/monitoring/RBAC), (f) costs warning.
4. DISTRIBUTIONS: Must include (a) binary install, (b) init/bootstrap, (c) kubeconfig, (d) join worker nodes, (e) verify, (f) HA setup notes.
5. OPERATORS: Must include (a) add Helm repo with CORRECT URL, (b) install CRDs if separate, (c) helm install with namespace + version, (d) create example CR, (e) verify the CR is ready.
6. UNINSTALL: Must warn about data loss. For cloud: mention orphaned resources (load balancers, PVCs, DNS records). Minimum 2 steps.
7. UPGRADE: Must include backup step, drain/cordon if needed, the upgrade command, post-upgrade verify. Minimum 3 steps.
8. TROUBLESHOOTING: Minimum 4 real-world issues with exact error messages, not vague "check logs". Include version-specific bugs.
9. VERSION NOTES: Be SPECIFIC — name the actual features/flags/APIs that changed. Never say "improved performance" without specifics.
10. CLOUD CLI: For managed services, specify exact CLI + minimum version (e.g. "gcloud >= 450.0", "aws-cli >= 2.x + eksctl >= 0.170"). For operators that don't need one, set to "none".
11. CONTAINER IMAGES: List the actual images deployed (e.g. "registry.k8s.io/ingress-nginx/controller:v1.10.1").
12. ONLY use URLs and image names from the provided context or well-known registries (registry.k8s.io, ghcr.io, docker.io, quay.io). Do not guess.`

function buildPlatformPrompt(platform, context) {
  const sections = [`# Platform install mission for: ${platform.displayName}`]
  sections.push(`Type: ${platform.type} | Category: ${platform.category} | Provider: ${platform.provider}`)
  sections.push(`Docs: ${platform.docs}`)
  sections.push(`Supported versions: ${platform.versions.join(', ')}`)
  sections.push(`Kubernetes versions: ${platform.k8sVersions.join(', ')}`)

  if (platform.repo) sections.push(`Repo: github.com/${platform.repo}`)

  if (context.repoMeta) {
    sections.push(`\n## Project Info\n- Stars: ${context.repoMeta.stargazers_count}\n- Language: ${context.repoMeta.language}\n- Description: ${context.repoMeta.description || 'N/A'}`)
    if (context.repoMeta.homepage) sections.push(`- Homepage: ${context.repoMeta.homepage}`)
  }

  if (context.release) {
    sections.push(`\n## Latest Release\n- Tag: ${context.release.tag_name}\n- Published: ${context.release.published_at}`)
  }

  if (context.readme) {
    sections.push(`\n## README (excerpt)\n${context.readme.slice(0, 3000)}`)
  }

  if (context.helm) {
    sections.push(`\n## Helm Chart\n\`\`\`yaml\n${context.helm}\n\`\`\``)
  }

  if (context.configs.length > 0) {
    sections.push('\n## Configuration Examples')
    for (const cfg of context.configs) {
      sections.push(`### ${cfg.name}\n\`\`\`yaml\n${cfg.content}\n\`\`\``)
    }
  }

  return sections.join('\n')
}

// ─── LLM Synthesis ───────────────────────────────────────────────────
async function synthesizePlatformMission(platform, context) {
  const prompt = buildPlatformPrompt(platform, context)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  try {
    const response = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_TOKEN}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: PLATFORM_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
      }),
    })

    clearTimeout(timeout)
    if (!response.ok) {
      const err = await response.text()
      console.error(`  LLM API error ${response.status}: ${err.slice(0, 200)}`)
      return null
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null
    return JSON.parse(content)
  } catch (err) {
    clearTimeout(timeout)
    console.error(`  LLM error: ${err.message}`)
    return null
  }
}

// ─── Sanitization helpers ────────────────────────────────────────────

/** Sanitize real infrastructure details from scraped content */
function sanitizeInfraDetails(text) {
  // Replace real public IPs with RFC 5737 documentation IPs (preserve private ranges)
  let sanitized = text.replace(
    /\b(?!10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    '192.0.2.1'
  )
  // Replace AWS EC2 internal hostnames
  sanitized = sanitized.replace(
    /\bip-\d+-\d+-\d+-\d+\.\w+-\w+-\d+\.compute\.internal\b/g,
    'ip-10-0-1-100.us-east-1.compute.internal'
  )
  // Replace AWS EC2 public hostnames
  sanitized = sanitized.replace(
    /\bec2-\d+-\d+-\d+-\d+\.\w+\.compute\.amazonaws\.com\b/g,
    'ec2-192-0-2-1.us-east-1.compute.amazonaws.com'
  )
  // Replace GCP instance hostnames
  sanitized = sanitized.replace(
    /\b[\w-]+\.[\w-]+\.c\.[\w-]+\.internal\b/g,
    'instance-1.us-central1-a.c.project-id.internal'
  )
  return sanitized
}

/** Detect and redact potential credentials in scraped content */
function redactCredentials(text) {
  // Redact password values in YAML/JSON-like content
  return text
    .replace(/(password|passwd|secret|token|apiKey|api_key|admin_password)["']?\s*[:=]\s*["']?(?!<[A-Z_]+>|changeme|CHANGE_ME|your-|YOUR_|xxx|placeholder|\$\{)([^\s"'}{,]{4,})/gi,
      '$1: <REDACTED>')
}

/** Check if a Helm chart version is reasonably fresh by querying the repo */
async function checkVersionFreshness(helmRepoUrl, chartName, currentVersion) {
  if (!helmRepoUrl || !chartName || !currentVersion) return true
  try {
    const res = await fetch(`${helmRepoUrl}/index.yaml`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return true // Can't check, assume OK
    const text = await res.text()
    // Extract versions for this chart from index.yaml
    const chartSection = text.split(new RegExp(`^\\s*${chartName}:`, 'm'))[1]
    if (!chartSection) return true
    const versions = [...chartSection.matchAll(/version:\s*(\S+)/g)].map(m => m[1]).slice(0, 5)
    if (versions.length === 0) return true
    // If currentVersion is not in the top 5 most recent, flag as stale
    if (!versions.includes(currentVersion)) {
      console.log(`  ⚠ Version ${currentVersion} not in latest 5 releases: ${versions.join(', ')}`)
      return false
    }
    return true
  } catch {
    return true // Network error, can't check
  }
}

// ─── Slug / Title helpers ────────────────────────────────────────────
export function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') }
function titleCase(s) { return s.replace(/(^|[\s-])(\w)/g, (_, p, c) => p + c.toUpperCase()) }

/**
 * Asserts that a slug is safe for use in file-path construction (CWE-20).
 * Throws if the slug contains path separators, dots, or starts with a dash.
 */
export function assertSafeSlug(slug, source = 'unknown') {
  if (!slug || slug.includes('/') || slug.includes('\\') || slug.includes('.') || slug.startsWith('-')) {
    throw new Error(`Unsafe slug generated from ${source}: ${slug}`)
  }
}

/**
 * Asserts that a resolved file path stays within the allowed directory (CWE-22).
 * Throws if the path escapes the allowed directory root.
 */
export function assertSafePath(resolvedTarget, resolvedAllowedDir) {
  if (!resolvedTarget.startsWith(resolvedAllowedDir + '/') && resolvedTarget !== resolvedAllowedDir) {
    throw new Error(`Path traversal detected: ${resolvedTarget}`)
  }
}

// ─── Quality Gate ────────────────────────────────────────────────────
const SAFE_CLI_COMMANDS = /\b(kubectl|helm|gcloud|eksctl|az|oci|aws|doctl|linode-cli|vkectl|oc|k3s|k0s|microk8s|snap|curl|wget|apt|yum|dnf|brew)\b/

function applyQualityGate(mission) {
  const issues = []
  let score = 0

  // 1. Schema validation
  const schemaResult = validateMissionExport(mission)
  if (!schemaResult.valid) {
    return { pass: false, verdict: 'rejected', score: 0, issues: [`Schema invalid: ${schemaResult.errors.join(', ')}`] }
  }

  // 2. Security scan
  const jsonStr = JSON.stringify(mission)
  const sensitiveResult = scanForSensitiveData(jsonStr)
  if (sensitiveResult.found) {
    return { pass: false, verdict: 'rejected', score: 0, issues: [`Security: sensitive data found — ${sensitiveResult.matches.join(', ')}`] }
  }
  const maliciousResult = scanForMaliciousContent(jsonStr)
  if (maliciousResult.found) {
    return { pass: false, verdict: 'rejected', score: 0, issues: [`Security: malicious content — ${maliciousResult.matches.join(', ')}`] }
  }

  // 3. Base score from shared quality scorer
  try {
    const scoreResult = scoreMission(mission)
    score = scoreResult.score || 0
  } catch {
    score = 40
  }

  const steps = mission.mission?.steps || []
  const uninstall = mission.mission?.uninstall || []
  const upgrade = mission.mission?.upgrade || []
  const troubleshooting = mission.mission?.troubleshooting || []
  const versionNotes = mission.mission?.versionNotes || []
  const platformType = mission.metadata?.platformType || 'operator'
  const allText = JSON.stringify(mission.mission)

  // ── Bonuses (up to +40) ──

  // Commands actually present in steps
  const totalCmds = steps.reduce((n, s) => n + (s.commands?.length || 0), 0)
  if (totalCmds >= 6) score += 10
  else if (totalCmds >= 3) score += 5

  // Version-pinned commands (helm --version, image:tag, release/vX.Y)
  const versionPinned = (allText.match(/--version\s+[\w.]+|:v?\d+\.\d+\.\d+|releases\/(?:download\/)?v?\d+\.\d+/g) || []).length
  if (versionPinned >= 3) score += 10
  else if (versionPinned >= 1) score += 5

  // Verification step (kubectl get, status check)
  if (/kubectl get (nodes|pods|deploy|all|crd)|kubectl cluster-info|kubectl wait/i.test(allText)) score += 5

  // Complete sections
  if (uninstall.length >= 2) score += 5
  if (upgrade.length >= 3) score += 5
  if (troubleshooting.length >= 4) score += 5

  // Specific versionNotes (not vague)
  const specificNotes = versionNotes.filter(v =>
    v.changes && !/improved (performance|stability)|various (improvements|fixes)/i.test(v.changes)
  )
  if (specificNotes.length >= 2) score += 5

  // ── Penalties (up to -50) ──

  // Too few steps
  const minSteps = platformType === 'operator' || platformType === 'local' ? 3 : 4
  if (steps.length < minSteps) {
    score -= 15
    issues.push(`Only ${steps.length} steps (min ${minSteps} for ${platformType})`)
  }

  // No commands at all
  if (totalCmds === 0) {
    score -= 20
    issues.push('No executable commands in steps')
  }

  // Vague content
  if (/see the documentation|refer to docs|check the website|visit the official/i.test(allText)) {
    score -= 10
    issues.push('Contains "see docs" instead of actual instructions')
  }

  // /master/ or /main/ branch URLs (fragile)
  if (/^https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/(master|main)\//mi.test(allText)) {
    score -= 5
    issues.push('Uses /master/ or /main/ branch URL (should pin to release tag)')
  }

  // :latest image tag
  if (/:latest\b/.test(allText)) {
    score -= 5
    issues.push('Uses :latest image tag')
  }

  // Missing uninstall
  if (uninstall.length === 0) {
    score -= 10
    issues.push('No uninstall section')
  }

  // Missing upgrade
  if (upgrade.length === 0) {
    score -= 10
    issues.push('No upgrade section')
  }

  // Vague versionNotes
  const vagueNotes = versionNotes.filter(v =>
    v.changes && /^improved (performance|stability|security)/i.test(v.changes) && v.changes.length < 60
  )
  if (vagueNotes.length > 0) {
    score -= 5
    issues.push(`${vagueNotes.length} vague versionNotes (no specifics)`)
  }

  // Generic cloudCLI for managed services
  if (['managed'].includes(platformType) && (!mission.prerequisites?.cloudCLI || /optional/i.test(mission.prerequisites.cloudCLI))) {
    score -= 5
    issues.push('Managed service missing specific cloudCLI requirement')
  }

  score = Math.max(0, Math.min(100, score))

  if (score >= QUALITY_THRESHOLD) {
    return { pass: true, verdict: 'publish', score, issues }
  } else if (score >= DRAFT_THRESHOLD) {
    return { pass: true, verdict: 'draft', score, issues: [...issues, `Score ${score} below publish threshold ${QUALITY_THRESHOLD}`] }
  } else {
    return { pass: false, verdict: 'rejected', score, issues: [...issues, `Score ${score} below minimum ${DRAFT_THRESHOLD}`] }
  }
}

// ─── Build Mission JSON ──────────────────────────────────────────────

/** Extract commands from a step — handles both new {cmd,note} format and legacy markdown */
function extractCommands(step) {
  // New format: commands array
  if (Array.isArray(step.commands) && step.commands.length > 0) {
    return step.commands.map(c => typeof c === 'string' ? c : c.cmd).filter(Boolean)
  }
  // Legacy: extract from markdown code blocks in description
  const desc = step.description || ''
  const matches = desc.match(/```(?:bash|console|shell|sh|yaml)?\n([\s\S]*?)```/g)
  if (matches) {
    return matches
      .map(m => m.replace(/```(?:bash|console|shell|sh|yaml)?\n?/g, '').replace(/```$/g, '').trim())
      .filter(Boolean)
  }
  return []
}

/** Build a rich description from step fields */
function buildStepDescription(step) {
  const parts = []
  if (step.description) parts.push(step.description.replace(/```[\s\S]*?```/g, '').trim())

  const cmds = extractCommands(step)
  if (cmds.length > 0) {
    parts.push('```bash')
    for (const c of cmds) {
      parts.push(c)
    }
    parts.push('```')
  }

  // Add command notes
  if (Array.isArray(step.commands)) {
    const notes = step.commands.filter(c => c.note).map(c => `> ${c.note}`)
    if (notes.length) parts.push(notes.join('\n'))
  }

  return parts.filter(Boolean).join('\n\n')
}

/** Map troubleshooting to consistent format */
function mapTroubleshooting(items) {
  return (items || []).map(t => {
    // New format has symptom/cause/fix; legacy has title/description
    const title = t.symptom || t.title || 'Issue'
    const parts = []
    if (t.cause) parts.push(`**Cause:** ${t.cause}`)
    if (t.fix) parts.push(`**Fix:**\n${t.fix}`)
    if (t.versions && t.versions !== 'all') parts.push(`**Affected versions:** ${t.versions}`)
    if (t.description) parts.push(t.description)
    return {
      title: String(title).slice(0, 200),
      description: parts.length ? parts.join('\n\n') : String(t.description || t.fix || '').slice(0, 3000),
    }
  })
}

function buildMissionJson(platform, llmResult, context) {
  const slug = slugify(platform.name)

  // Collect all commands for the resolution codeSnippets
  const allCommands = (llmResult.steps || []).flatMap(s => extractCommands(s)).slice(0, 8)

  // Determine cloudCLI — normalize "none" and generic fallbacks
  let cloudCLI = llmResult.prerequisites?.cloudCLI
  if (!cloudCLI || cloudCLI === 'none' || /optional/i.test(cloudCLI)) {
    // Use platform catalog's known CLI
    const cliMap = {
      gke: 'gcloud >= 450.0', eks: 'aws-cli >= 2.x, eksctl >= 0.170',
      aks: 'az >= 2.50', oke: 'oci >= 3.x', doks: 'doctl >= 1.100',
      lke: 'linode-cli', iks: 'ibmcloud >= 2.x', vke: 'vultr-cli',
      openshift: 'oc >= 4.14',
    }
    cloudCLI = cliMap[platform.name] || (platform.type === 'operator' ? undefined : cloudCLI)
  }

  const mission = {
    version: 'kc-mission-v1',
    name: `platform-${slug}`,
    missionClass: 'install',
    author: 'KubeStellar Bot',
    authorGithub: 'kubestellar',
    mission: {
      title: `Install and Configure ${platform.displayName}`,
      description: llmResult.description || `Setup guide for ${platform.displayName}.`,
      type: 'deploy',
      status: 'completed',
      estimatedMinutes: llmResult.estimatedMinutes || (platform.type === 'managed' ? 20 : platform.type === 'operator' ? 10 : 15),
      steps: (llmResult.steps || []).map(s => ({
        title: String(s.title || '').slice(0, 200),
        description: buildStepDescription(s),
        commands: extractCommands(s),
      })),
      uninstall: (llmResult.uninstall || []).map(s => ({
        title: String(s.title || '').slice(0, 200),
        description: buildStepDescription(s),
        commands: extractCommands(s),
      })),
      upgrade: (llmResult.upgrade || []).map(s => ({
        title: String(s.title || '').slice(0, 200),
        description: buildStepDescription(s),
        commands: extractCommands(s),
      })),
      troubleshooting: mapTroubleshooting(llmResult.troubleshooting),
      versionNotes: (llmResult.versionNotes || []).map(v => ({
        version: String(v.version || ''),
        changes: String(v.changes || ''),
        deprecations: String(v.deprecations || ''),
        migrationSteps: v.migrationSteps ? String(v.migrationSteps) : undefined,
      })),
      resolution: {
        summary: typeof llmResult.resolution === 'string'
          ? llmResult.resolution
          : llmResult.resolution?.summary || `${platform.displayName} is installed and running.`,
        codeSnippets: allCommands,
      },
    },
    metadata: {
      tags: [
        'installation',
        'configuration',
        platform.type,
        platform.category,
        platform.provider.toLowerCase().replace(/\s+/g, '-'),
      ],
      platform: platform.name,
      platformType: platform.type,
      platformProvider: platform.provider,
      platformVersions: llmResult.supportedVersions || platform.versions,
      supportedK8sVersions: llmResult.supportedK8sVersions || platform.k8sVersions,
      cncfProjects: [],
      targetResourceKinds: ['Namespace', 'Deployment', 'Service'],
      difficulty: llmResult.difficulty || 'intermediate',
      issueTypes: ['installation', 'configuration'],
      installMethods: llmResult.installMethods || ['cli'],
      containerImages: llmResult.containerImages || [],
      sourceUrls: {
        docs: platform.docs,
        repo: platform.repo ? `https://github.com/${platform.repo}` : undefined,
      },
      qualityScore: 0,
    },
    prerequisites: {
      kubernetes: llmResult.prerequisites?.kubernetes || '>=1.25',
      tools: llmResult.prerequisites?.tools || ['kubectl'],
      cloudCLI,
      resources: llmResult.prerequisites?.resources || undefined,
      description: llmResult.prerequisites?.description || `Ensure you have the required CLI tools installed.`,
    },
    security: {
      scannedAt: new Date().toISOString(),
      scannerVersion: 'platform-install-gen-2.0.0',
      sanitized: true,
      findings: [],
    },
  }

  return mission
}

// ─── Report Generation ───────────────────────────────────────────────
function formatReport(results) {
  const lines = ['# Platform Install Mission Generation Report', '', `Generated: ${new Date().toISOString()}`, '']

  const published = results.filter(r => r.verdict === 'publish')
  const drafted = results.filter(r => r.verdict === 'draft')
  const rejected = results.filter(r => r.verdict === 'rejected')
  const skipped = results.filter(r => r.verdict === 'skipped')

  lines.push(`| Status | Count |`, `|--------|-------|`)
  lines.push(`| ✅ Published | ${published.length} |`)
  lines.push(`| 📝 Draft | ${drafted.length} |`)
  lines.push(`| ❌ Rejected | ${rejected.length} |`)
  lines.push(`| ⏭️ Skipped | ${skipped.length} |`)
  lines.push('')

  for (const r of results) {
    const icon = r.verdict === 'publish' ? '✅' : r.verdict === 'draft' ? '📝' : r.verdict === 'skipped' ? '⏭️' : '❌'
    lines.push(`## ${icon} ${r.platform} (score: ${r.score})`)
    if (r.issues.length) lines.push(`Issues: ${r.issues.join('; ')}`)
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Platform Install Mission Generator ===')
  const ALL_PROJECTS = [...K8S_PLATFORMS, ...OTHER_PROJECTS]
  console.log(`Projects in catalog: ${ALL_PROJECTS.length} (${K8S_PLATFORMS.length} platforms + ${OTHER_PROJECTS.length} other)`)

  // Determine which platforms to process
  let platforms = [...ALL_PROJECTS]
  if (TARGET_PLATFORMS && TARGET_PLATFORMS.length > 0) {
    platforms = TARGET_PLATFORMS
      .map(name => getPlatformByName(name) || OTHER_PROJECTS.find(p => p.name === name))
      .filter(Boolean)
    console.log(`Targeting ${platforms.length} platform(s): ${platforms.map(p => p.name).join(', ')}`)
  }

  // Apply batch index
  if (BATCH_INDEX != null) {
    const start = BATCH_INDEX * BATCH_SIZE
    const end = start + BATCH_SIZE
    platforms = platforms.slice(start, end)
    console.log(`Batch ${BATCH_INDEX}: platforms ${start}-${end - 1} (${platforms.length} items)`)
  }

  // Filter already-generated unless force — with staleness detection
  if (!FORCE_REGENERATE) {
    const existing = existsSync(SOLUTIONS_DIR)
      ? readdirSync(SOLUTIONS_DIR).filter(f => f.endsWith('.json'))
      : []
    const existingNames = new Set(existing.map(f => f.replace(/\.json$/, '')))
    const before = platforms.length
    const staleNames = []

    platforms = platforms.filter(p => {
      const filename = `platform-${slugify(p.name)}`
      if (!existingNames.has(filename)) return true // new — needs generation

      // Check staleness: if the repo was updated after the mission was generated
      const missionPath = join(SOLUTIONS_DIR, `${filename}.json`)
      try {
        const mission = JSON.parse(readFileSync(missionPath, 'utf-8'))
        const scannedAt = mission.security?.scannedAt
        if (!scannedAt) return true // no timestamp — regenerate

        const scannedDate = new Date(scannedAt)
        const ageMs = Date.now() - scannedDate.getTime()
        const MS_PER_DAY = 86_400_000
        const ageDays = ageMs / MS_PER_DAY

        if (ageDays > STALENESS_THRESHOLD_DAYS) {
          staleNames.push(p.name)
          return true // too old — regenerate
        }
      } catch {
        return true // unreadable — regenerate
      }

      return false // fresh — skip
    })

    const skipped = before - platforms.length
    if (skipped > 0) {
      console.log(`Skipping ${skipped} fresh platforms (generated within ${STALENESS_THRESHOLD_DAYS} days)`)
    }
    if (staleNames.length > 0) {
      console.log(`Regenerating ${staleNames.length} stale platform(s): ${staleNames.join(', ')}`)
    }
  }

  if (platforms.length === 0) {
    console.log('No platforms to process.')
    return
  }

  console.log(`Processing ${platforms.length} platform(s)...`)
  mkdirSync(SOLUTIONS_DIR, { recursive: true })

  const results = []

  for (const platform of platforms) {
    console.log(`\n── ${platform.displayName} (${platform.type}) ──`)

    // 1. Crawl knowledge sources
    console.log('  Crawling knowledge sources...')
    const context = await crawlPlatformKnowledge(platform)

    // 2. Synthesize via LLM
    console.log('  Synthesizing via LLM...')
    const llmResult = await synthesizePlatformMission(platform, context)
    if (!llmResult) {
      results.push({ platform: platform.name, verdict: 'rejected', score: 0, issues: ['LLM returned no result'] })
      continue
    }

    if (llmResult.skip) {
      results.push({ platform: platform.name, verdict: 'skipped', score: 0, issues: ['Platform marked as skip by LLM'] })
      continue
    }

    // 3. Build mission JSON
    const mission = buildMissionJson(platform, llmResult, context)

    // 3.1. Post-generation validation — reject fabricated content
    const allMissionText = JSON.stringify(mission.mission)

    // Reject nonexistent Kubernetes versions (>v1.33)
    const NONEXISTENT_K8S_VERSION_RE = /v1\.(3[4-9]|[4-9][0-9])/
    if (NONEXISTENT_K8S_VERSION_RE.test(allMissionText)) {
      console.log('  Rejected: references nonexistent Kubernetes version (>v1.33)')
      results.push({ platform: platform.name, verdict: 'rejected', score: 0, issues: ['References nonexistent K8s version'] })
      continue
    }

    // Reject pip install kubectl/helm (wrong install method)
    const PIP_INSTALL_WRONG_TOOL_RE = /pip install (kubectl|helm)\b/
    if (PIP_INSTALL_WRONG_TOOL_RE.test(allMissionText)) {
      console.log('  Rejected: uses pip install kubectl/helm — these are not the real tools')
      results.push({ platform: platform.name, verdict: 'rejected', score: 0, issues: ['Uses pip install kubectl/helm'] })
      continue
    }

    // Reject placeholder container image patterns
    const PLACEHOLDER_IMAGE_RE = /registry\/[a-z]+\/[a-z]+:tag|registry\/org\/image/
    if (PLACEHOLDER_IMAGE_RE.test(allMissionText)) {
      console.log('  Rejected: contains placeholder container image pattern')
      results.push({ platform: platform.name, verdict: 'rejected', score: 0, issues: ['Placeholder container image not replaced'] })
      continue
    }

    // 3.2. Sanitize infrastructure details and redact credentials from mission content
    const sanitizeMissionText = (obj) => {
      if (typeof obj === 'string') return redactCredentials(sanitizeInfraDetails(obj))
      if (Array.isArray(obj)) return obj.map(sanitizeMissionText)
      if (obj && typeof obj === 'object') {
        const result = {}
        for (const [k, v] of Object.entries(obj)) result[k] = sanitizeMissionText(v)
        return result
      }
      return obj
    }
    mission.mission = sanitizeMissionText(mission.mission)

    // 3.5. Validate Helm repo URL if install method is helm
    if (llmResult.installMethods?.includes('helm') && llmResult.helmRepoUrl) {
      try {
        const HELM_VALIDATE_TIMEOUT_MS = 10000
        const indexRes = await fetch(`${llmResult.helmRepoUrl}/index.yaml`, { signal: AbortSignal.timeout(HELM_VALIDATE_TIMEOUT_MS) })
        if (!indexRes.ok) {
          console.log(`  Helm repo URL ${llmResult.helmRepoUrl} returned ${indexRes.status} — flagging for review`)
          const HELM_URL_PENALTY = 30
          mission.metadata.qualityScore = Math.max(0, (mission.metadata.qualityScore || 100) - HELM_URL_PENALTY)
        }
      } catch {
        console.log(`  Helm repo URL ${llmResult.helmRepoUrl} unreachable — flagging for review`)
        const HELM_URL_PENALTY = 30
        mission.metadata.qualityScore = Math.max(0, (mission.metadata.qualityScore || 100) - HELM_URL_PENALTY)
      }
    }

    // 3.6. Check version freshness against Helm repo index
    if (llmResult.installMethods?.includes('helm') && llmResult.helmRepoUrl && llmResult.helmChart) {
      // Extract chart version from the generated steps
      const stepsText = JSON.stringify(mission.mission.steps || [])
      const chartVersionMatch = stepsText.match(/--version\s+([\w.]+)/)
      if (chartVersionMatch) {
        const VERSION_STALENESS_PENALTY = 15
        const isFresh = await checkVersionFreshness(llmResult.helmRepoUrl, llmResult.helmChart, chartVersionMatch[1])
        if (!isFresh) {
          mission.metadata.qualityScore = Math.max(0, (mission.metadata.qualityScore || 100) - VERSION_STALENESS_PENALTY)
        }
      }
    }

    // 4. Apply quality gate
    const gateResult = applyQualityGate(mission)
    mission.metadata.qualityScore = gateResult.score

    console.log(`  Score: ${gateResult.score} → ${gateResult.verdict}`)
    if (gateResult.issues.length > 0) {
      console.log(`  Issues: ${gateResult.issues.join('; ')}`)
    }

    results.push({
      platform: platform.name,
      verdict: gateResult.verdict,
      score: gateResult.score,
      issues: gateResult.issues,
    })

    if (!gateResult.pass) continue

    // 5. Write mission file
    const slug = slugify(platform.name)
    assertSafeSlug(slug, 'platform.name')
    const filename = `platform-${slug}.json`
    const isDraft = gateResult.verdict === 'draft'
    const outPath = join(SOLUTIONS_DIR, isDraft ? filename.replace('.json', '.draft.json') : filename)

    // Path traversal guard (CWE-22)
    const resolvedPath = join(process.cwd(), outPath)
    const resolvedSolutionsDir = join(process.cwd(), SOLUTIONS_DIR)
    assertSafePath(resolvedPath, resolvedSolutionsDir)

    if (!DRY_RUN) {
      writeFileSync(outPath, JSON.stringify(mission, null, 2))
      console.log(`  Wrote: ${outPath}`)
    } else {
      console.log(`  [DRY RUN] Would write: ${outPath}`)
    }

    // Rate-limit between platforms
    await sleep(2000)
  }

  // Write report
  const report = formatReport(results)
  const reportPath = join(process.cwd(), `platform-report-${BATCH_INDEX ?? 'all'}.md`)
  if (!DRY_RUN) {
    writeFileSync(reportPath, report)
    console.log(`\nReport: ${reportPath}`)
  }

  // Summary
  const published = results.filter(r => r.verdict === 'publish').length
  const drafted = results.filter(r => r.verdict === 'draft').length
  const rejected = results.filter(r => r.verdict === 'rejected').length
  console.log(`\n=== Summary: ${published} published, ${drafted} draft, ${rejected} rejected ===`)

  if (rejected > 0) process.exitCode = 0 // Don't fail workflow for quality rejections
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
