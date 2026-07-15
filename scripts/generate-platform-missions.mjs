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
import { join, dirname, basename, resolve } from 'path'
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

const ALLOWED_ENDPOINT_PREFIXES = [
  'https://models.inference.ai.azure.com/',
  'https://api.openai.com/',
  'https://api.githubcopilot.com/',
]

/**
 * Asserts that an LLM endpoint URL starts with an approved prefix (CWE-441: prevent SSRF).
 * Throws if the endpoint is not trusted.
 */
function assertTrustedEndpoint(endpoint, allowedPrefixes = ALLOWED_ENDPOINT_PREFIXES) {
  if (!allowedPrefixes.some(prefix => endpoint.startsWith(prefix))) {
    throw new Error(`Untrusted LLM_ENDPOINT: ${endpoint}. Must start with one of: ${allowedPrefixes.join(', ')}`)
  }
  return endpoint
}

// Validate LLM_ENDPOINT at module load time (CWE-441: prevent SSRF)
const TRUSTED_LLM_ENDPOINT = assertTrustedEndpoint(LLM_ENDPOINT)

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

async function githubFetch(url, options = {}) {
  await waitForRateLimit()
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
  rateLimitRemaining = parseInt(response.headers.get('x-ratelimit-remaining') || '5000', 10)
  rateLimitReset = parseInt(response.headers.get('x-ratelimit-reset') || '0', 10)
  return response
}

async function fetchRepoMeta(owner, repo) {
  const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}`)
  if (!res.ok) return null
  return res.json()
}

async function fetchReleases(owner, repo) {
  const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`)
  if (!res.ok) return []
  return res.json()
}

async function fetchReadme(owner, repo) {
  const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/readme`)
  if (!res.ok) return null
  const data = await res.json()
  return Buffer.from(data.content, 'base64').toString('utf-8').slice(0, 8000)
}

async function fetchHelmChart(owner, repo) {
  const paths = ['charts/', 'chart/', 'helm/', '']
  for (const p of paths) {
    const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${p}Chart.yaml`)
    if (res.ok) {
      const data = await res.json()
      return Buffer.from(data.content, 'base64').toString('utf-8').slice(0, 4000)
    }
  }
  return null
}

async function fetchHelmValues(owner, repo) {
  const paths = ['charts/', 'chart/', 'helm/', '']
  for (const p of paths) {
    const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${p}values.yaml`)
    if (res.ok) {
      const data = await res.json()
      return Buffer.from(data.content, 'base64').toString('utf-8').slice(0, 4000)
    }
  }
  return null
}

async function fetchKustomize(owner, repo) {
  for (const p of ['config/default/', 'deploy/', 'manifests/', '']) {
    const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${p}kustomization.yaml`)
    if (res.ok) {
      const data = await res.json()
      return Buffer.from(data.content, 'base64').toString('utf-8').slice(0, 3000)
    }
  }
  return null
}

async function checkHelmRepoUrl(helmRepoUrl) {
  if (!helmRepoUrl) return false
  try {
    const res = await fetch(`${helmRepoUrl}/index.yaml`, { signal: AbortSignal.timeout(10000) })
    return res.ok
  } catch {
    return false
  }
}

// ─── Platform Context Builder ────────────────────────────────────────

async function gatherPlatformContext(platform) {
  const context = {
    readme: null,
    helmChart: null,
    helmValues: null,
    kustomize: null,
    releases: [],
    repoMeta: null,
  }

  const [owner, repo] = (platform.repo || '').split('/')
  if (!owner || !repo) return context

  const [repoMeta, releases, readme, helmChart, helmValues, kustomize] = await Promise.all([
    fetchRepoMeta(owner, repo),
    fetchReleases(owner, repo),
    fetchReadme(owner, repo),
    fetchHelmChart(owner, repo),
    fetchHelmValues(owner, repo),
    fetchKustomize(owner, repo),
  ])

  return { repoMeta, releases: releases.slice(0, 5), readme, helmChart, helmValues, kustomize }
}

// ─── Prompt Builder ──────────────────────────────────────────────────

const PLATFORM_SYSTEM_PROMPT = `You are an expert Kubernetes platform engineer. Your task is to generate a comprehensive, accurate, and practical install mission JSON for a specific Kubernetes platform or managed service.

Rules:
- Generate REAL install steps with actual CLI commands, not placeholders
- Use the latest stable version from the releases provided
- Include version-specific flags and options
- Steps must be actionable — no "see documentation" or vague instructions
- Include verification steps with kubectl commands
- Follow the exact JSON schema provided
- For cloud providers: include cloud-specific CLI commands (aws, gcloud, az)
- For helm: include proper repo add, update, install commands with specific chart versions
- For kubectl: include apply commands with specific manifest URLs or inline YAML
- Include prerequisites: specific tool versions required
- The "description" of each step must include the actual command in a code block

IMPORTANT: Return ONLY the JSON object, no markdown fences.`

function buildPlatformPrompt(platform, context) {
  const sections = []

  sections.push(`## Platform: ${platform.name}`)
  sections.push(`Category: ${platform.category || 'Kubernetes platform'}`)
  sections.push(`Description: ${platform.description || ''}`)
  if (platform.version) sections.push(`Latest Version: ${platform.version}`)
  if (platform.provider) sections.push(`Provider: ${platform.provider}`)

  if (context.releases?.length > 0) {
    const latest = context.releases[0]
    sections.push(`\nLatest Release: ${latest.tag_name} (${latest.published_at?.slice(0, 10) || 'unknown'})`)
  }

  if (context.repoMeta) {
    sections.push(`\nRepository: ${context.repoMeta.full_name}`)
    sections.push(`Stars: ${context.repoMeta.stargazers_count} | Language: ${context.repoMeta.language}`)
  }

  if (context.readme) {
    sections.push(`\n## README (excerpt)\n${context.readme.slice(0, 3000)}`)
  }

  if (context.helmChart) {
    sections.push(`\n## Chart.yaml\n\`\`\`yaml\n${context.helmChart}\n\`\`\``)
  }

  if (context.helmValues) {
    sections.push(`\n## values.yaml (excerpt)\n\`\`\`yaml\n${context.helmValues.slice(0, 2000)}\n\`\`\``)
  }

  if (context.kustomize) {
    sections.push(`\n## kustomization.yaml\n\`\`\`yaml\n${context.kustomize}\n\`\`\``)
  }

  const slug = slugify(platform.name)
  const installMethods = platform.installMethods || ['kubectl']

  sections.push(`\n## Required Output Schema\n\`\`\`json\n${JSON.stringify({
    version: 'kc-mission-v1',
    name: `platform-${slug}`,
    missionClass: 'installer',
    author: 'KubeStellar Bot',
    authorGithub: 'kubestellar',
    mission: {
      title: `${platform.name}: Complete Install Guide`,
      description: `Step-by-step installation guide for ${platform.name}.`,
      type: 'configuration',
      status: 'completed',
      steps: [
        { title: 'Step title', description: 'Step with actual commands' },
      ],
      resolution: {
        summary: 'Summary of what was installed and how to verify.',
        codeSnippets: ['key command or config snippet'],
      },
    },
    metadata: {
      category: platform.category || 'platform',
      installMethods,
      cncfProjects: platform.cncfProjects || [],
      qualityScore: 0,
    },
    prerequisites: {
      tools: platform.prerequisites?.tools || ['kubectl'],
      permissions: ['cluster-admin'],
    },
    security: {
      rbacRequired: true,
      networkPolicies: false,
    },
  }, null, 2)}\n\`\`\``)

  return sections.join('\n')
}

// ─── LLM Synthesis ───────────────────────────────────────────────────
async function synthesizePlatformMission(platform, context) {
  const prompt = buildPlatformPrompt(platform, context)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  try {
    const response = await fetch(TRUSTED_LLM_ENDPOINT, {
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

    // Validate Content-Type and enforce a response size ceiling before parsing
    // HTTP-derived bytes into the mission object that will be written to disk (CWE-434).
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      console.error(`  LLM response has unexpected Content-Type: ${contentType.slice(0, 100)}`)
      return null
    }
    const MAX_LLM_RESPONSE_BYTES = 1_000_000
    const rawText = await response.text()
    if (rawText.length > MAX_LLM_RESPONSE_BYTES) {
      console.error(`  LLM response too large (${rawText.length} bytes), rejecting`)
      return null
    }
    const data = JSON.parse(rawText)
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

/**
 * Sanitize HTML content to prevent XSS (CWE-79, CWE-80).
 * Uses loop-until-stable to handle nested/overlapping tags.
 */
function replaceUntilStable(input, pattern, replacement = '') {
  let previous
  do {
    previous = input
    input = input.replace(pattern, replacement)
  } while (input !== previous)
  return input
}

function sanitizeHtml(text) {
  let sanitized = text
  
  // Decode HTML entities first to catch entity-encoded attacks
  sanitized = sanitized
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&amp;/gi, '&')
  
  // Loop each multi-character sanitizer to a fixed point (CWE-80/116).
  // Match closing </script> with any content before > to cover variants like </script\t\n bar> (js/bad-tag-filter).
  sanitized = replaceUntilStable(sanitized, /<script[\s\S]*?<\/\s*script[^>]*>/gi)
  sanitized = replaceUntilStable(sanitized, /\bon\w+[\s\u0000-\u001F\u007F]*=[\s\u0000-\u001F\u007F]*(?:["'][^"']*["']|[^\s>]+)/gi)
  sanitized = replaceUntilStable(sanitized, /javascript[\s\u0000-\u001F\u007F]*:/gi)
  sanitized = replaceUntilStable(sanitized, /<[^>]+>/g)
  
  return sanitized
}

/** Sanitize real infrastructure details from scraped content */
function sanitizeInfraDetails(text) {
  // First sanitize HTML/XSS content
  let sanitized = sanitizeHtml(text)
  let prev = ''
  
  // Use loop-until-stable to handle overlapping patterns (defense-in-depth)
  // Loop until no more changes to catch edge cases with overlapping patterns
  while (sanitized !== prev) {
    prev = sanitized
    
    // Replace real public IPs with RFC 5737 documentation IPs (preserve private ranges)
    sanitized = sanitized.replace(
      /\b(?!10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      '192.0.2.1'
    )
    // Replace AWS EC2 internal hostnames
    sanitized = sanitized.replace(
      /\bip-\d+-\d+-\d+-\d+\.\w+-\w+-\d+\.compute\.internal\b/g,
      'ip-10-0-0-1.us-east-1.compute.internal'
    )
    // Replace GKE node names
    sanitized = sanitized.replace(
      /\bgke-[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\b/g,
      'gke-cluster-default-pool-node'
    )
    // Redact cloud account IDs
    sanitized = sanitized.replace(/\b\d{12}\b/g, '123456789012')
  }
  
  return sanitized
}

// ─── Quality Gate ─────────────────────────────────────────────────────

const INSTALL_CMD_RE = /helm install|helm upgrade|kubectl apply|kubectl create|docker run|operator-sdk|kustomize build|kubectl kustomize/i
const VERIFY_CMD_RE = /kubectl get|kubectl describe|kubectl logs|curl.*health|curl.*ready|kubectl port-forward|kubectl rollout status/i

function applyQualityGate(mission) {
  const issues = []
  const steps = mission.mission?.steps || []

  // Must have at least 3 steps
  if (steps.length < 3) issues.push(`Only ${steps.length} steps (min 3)`)

  // Must have install command
  const hasInstallCmd = steps.some(s =>
    INSTALL_CMD_RE.test(s.description || '') || INSTALL_CMD_RE.test(s.title || '')
  )
  if (!hasInstallCmd) issues.push('No install command found (helm/kubectl/docker)')

  // Must have verification step
  const hasVerify = steps.some(s =>
    VERIFY_CMD_RE.test(s.description || '') || VERIFY_CMD_RE.test(s.title || '')
  )
  if (!hasVerify) issues.push('No verification step found')

  // Resolution summary required
  if (!mission.mission?.resolution?.summary) issues.push('No resolution summary')

  // Security scan
  const sensitiveFindings = scanForSensitiveData(mission)
  if (sensitiveFindings.findings.length > 0) {
    issues.push(`Sensitive data detected: ${sensitiveFindings.findings.map(f => f.type).join(', ')}`)
  }

  const maliciousFindings = scanForMaliciousContent(mission)
  if (maliciousFindings.findings.length > 0) {
    issues.push(`Malicious content detected: ${maliciousFindings.findings.map(f => f.type).join(', ')}`)
  }

  const score = scoreMission(mission)
  const pass = issues.length === 0 && score >= QUALITY_THRESHOLD
  const verdict = !pass
    ? (score >= DRAFT_THRESHOLD ? 'draft' : 'rejected')
    : 'pass'

  return { pass, score, verdict, issues }
}

// ─── Path helpers ─────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function assertSafeSlug(slug, source = 'unknown') {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    throw new Error(`Unsafe slug derived from ${source}: ${JSON.stringify(slug)}`)
  }
}

export function assertSafePath(resolvedTarget, resolvedAllowedDir) {
  if (!resolvedTarget.startsWith(resolvedAllowedDir + '/') && resolvedTarget !== resolvedAllowedDir) {
    throw new Error(`Path traversal detected: ${resolvedTarget} is outside ${resolvedAllowedDir}`)
  }
}

function serializeSanitizedMissionForFile(mission) {
  const missionJson = JSON.stringify(mission, null, 2)
  if (missionJson.length > 1_000_000) {
    throw new Error(`Refusing to write oversized mission (${missionJson.length} bytes)`)
  }
  if (/<\s*script\b/i.test(missionJson) || /\bon\w+\s*=/i.test(missionJson)) {
    throw new Error('Refusing to write mission containing unsafe HTML after sanitization')
  }
  return missionJson
}

// ─── Helm validation ─────────────────────────────────────────────────

const HELM_VALIDATE_TIMEOUT_MS = 10000

async function checkVersionFreshness(helmRepoUrl, chartName, version) {
  try {
    const res = await fetch(`${helmRepoUrl}/index.yaml`, { signal: AbortSignal.timeout(HELM_VALIDATE_TIMEOUT_MS) })
    if (!res.ok) return true
    const text = await res.text()
    // Escape ALL regex metacharacters in the HTTP-derived version string before
    // interpolating into a RegExp (js/incomplete-sanitization — CWE-116/20).
    const escapeRegExpChars = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const versionRe = new RegExp(`version:\\s+${escapeRegExpChars(version)}`, 'm')
    return versionRe.test(text)
  } catch {
    return true
  }
}

// ─── Staleness check ─────────────────────────────────────────────────

function isMissionStale(filePath) {
  if (FORCE_REGENERATE) return true
  try {
    const mission = JSON.parse(readFileSync(filePath, 'utf-8'))
    const generatedAt = mission.metadata?.generatedAt
    if (!generatedAt) return true
    const age = (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60 * 24)
    return age > STALENESS_THRESHOLD_DAYS
  } catch {
    return true
  }
}

// ─── Report ───────────────────────────────────────────────────────────

function formatReport(results) {
  const lines = ['# Platform Mission Generation Report', `Generated: ${new Date().toISOString()}`, '']
  const published = results.filter(r => r.verdict === 'publish')
  const drafted = results.filter(r => r.verdict === 'draft')
  const rejected = results.filter(r => r.verdict === 'rejected')
  const skipped = results.filter(r => r.verdict === 'skipped')
  const failed = results.filter(r => r.verdict === 'failed')

  lines.push(`## Summary`)
  lines.push(`- Published: ${published.length}`)
  lines.push(`- Drafted: ${drafted.length}`)
  lines.push(`- Rejected: ${rejected.length}`)
  lines.push(`- Skipped: ${skipped.length}`)
  lines.push(`- Failed: ${failed.length}`)
  lines.push('')

  if (published.length > 0) {
    lines.push('## Published')
    for (const r of published) lines.push(`- **${r.platform}** (score: ${r.score})`)
    lines.push('')
  }

  if (drafted.length > 0) {
    lines.push('## Drafted (needs review)')
    for (const r of drafted) {
      lines.push(`- **${r.platform}** (score: ${r.score})`)
      if (r.issues?.length) lines.push(`  Issues: ${r.issues.join('; ')}`)
    }
    lines.push('')
  }

  if (rejected.length > 0) {
    lines.push('## Rejected')
    for (const r of rejected) {
      lines.push(`- **${r.platform}** (score: ${r.score})`)
      if (r.issues?.length) lines.push(`  Issues: ${r.issues.join('; ')}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Platform Mission Generator ===')
  if (!LLM_TOKEN) {
    console.error('LLM_TOKEN or GITHUB_TOKEN required')
    process.exit(1)
  }

  mkdirSync(SOLUTIONS_DIR, { recursive: true })

  // Collect platforms
  let platforms = [...K8S_PLATFORMS, ...OTHER_PROJECTS]
  if (TARGET_PLATFORMS?.length) {
    platforms = platforms.filter(p =>
      TARGET_PLATFORMS.some(t => p.name.toLowerCase().includes(t.toLowerCase()))
    )
    console.log(`Filtered to ${platforms.length} platforms matching: ${TARGET_PLATFORMS.join(', ')}`)
  }

  // Batch slicing
  if (BATCH_INDEX != null) {
    const start = BATCH_INDEX * BATCH_SIZE
    const end = start + BATCH_SIZE
    console.log(`Batch ${BATCH_INDEX}: platforms ${start}–${Math.min(end, platforms.length) - 1} of ${platforms.length}`)
    platforms = platforms.slice(start, end)
  }

  console.log(`Processing ${platforms.length} platforms\n`)

  const results = []

  for (const platform of platforms) {
    const slug = slugify(platform.name)
    assertSafeSlug(slug, 'platform.name')
    const outFilename = basename(`platform-${slug}.json`)
    if (!/^platform-[a-z0-9-]+\.json$/.test(outFilename)) {
      throw new Error(`Unexpected output filename: ${outFilename}`)
    }
    const outPath = join(SOLUTIONS_DIR, outFilename)

    // Check if exists and is fresh
    if (existsSync(outPath) && !isMissionStale(outPath)) {
      console.log(`  Skipping ${platform.name} — mission exists and is fresh`)
      results.push({ platform: platform.name, verdict: 'skipped', score: 0, issues: [] })
      continue
    }

    console.log(`Processing: ${platform.name}`)

    // Gather context from GitHub
    const context = await gatherPlatformContext(platform)

    // Synthesize mission via LLM
    let llmResult = await synthesizePlatformMission(platform, context)
    if (!llmResult) {
      console.log(`  LLM returned null — skipping`)
      results.push({ platform: platform.name, verdict: 'failed', score: 0, issues: ['LLM returned null'] })
      continue
    }

    // Build mission object
    const mission = {
      version: 'kc-mission-v1',
      name: `platform-${slug}`,
      missionClass: llmResult.missionClass || 'installer',
      author: 'KubeStellar Bot',
      authorGithub: 'kubestellar',
      mission: {
        title: llmResult.mission?.title || `${platform.name}: Install Guide`,
        description: llmResult.mission?.description || '',
        type: llmResult.mission?.type || 'configuration',
        status: 'completed',
        steps: (llmResult.mission?.steps || []).map(s => ({
          title: String(s.title || '').slice(0, 200),
          description: String(s.description || '').slice(0, 5000),
        })),
        resolution: {
          summary: String(llmResult.mission?.resolution?.summary || '').slice(0, 1000),
          codeSnippets: (llmResult.mission?.resolution?.codeSnippets || []).slice(0, 10).map(c => String(c).slice(0, 2000)),
        },
      },
      metadata: {
        category: platform.category || 'platform',
        installMethods: platform.installMethods || ['kubectl'],
        cncfProjects: platform.cncfProjects || [],
        qualityScore: 0,
        generatedAt: new Date().toISOString(),
      },
      prerequisites: {
        tools: platform.prerequisites?.tools || ['kubectl'],
        permissions: ['cluster-admin'],
      },
      security: {
        rbacRequired: true,
        networkPolicies: false,
      },
    }

    // 1. Sanitize any real infra details that crept in via context
    const stepsText = JSON.stringify(mission.mission.steps)
    if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(stepsText)) {
      mission.mission.steps = JSON.parse(sanitizeInfraDetails(stepsText))
    }

    // 2. Validate Helm repo URL if install method is helm
    if (llmResult.installMethods?.includes('helm') && llmResult.helmRepoUrl) {
      const isValidHelmRepo = await checkHelmRepoUrl(llmResult.helmRepoUrl)
      if (!isValidHelmRepo) {
        console.log(`  Helm repo URL ${llmResult.helmRepoUrl} unreachable — flagging for review`)
        const HELM_URL_PENALTY = 30
        mission.metadata.qualityScore = Math.max(0, (mission.metadata.qualityScore || 100) - HELM_URL_PENALTY)
      }
    }

    // 3. Apply quality gate
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

    // 4. Sanitize the mission text after LLM synthesis
    const sanitizeMissionText = (obj, maxLen = 5000) => {
      if (typeof obj === 'string') {
        // Redact infra details, HTML-encode angle brackets (js/bad-tag-filter,
        // js/incomplete-multi-character-sanitization — CWE-80/79), strip control
        // chars, and cap length (CWE-434, fixes #2896).
        return sanitizeInfraDetails(obj)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
          .slice(0, maxLen)
      }
      if (Array.isArray(obj)) return obj.map(item => sanitizeMissionText(item, maxLen))
      if (obj && typeof obj === 'object') {
        const result = {}
        for (const [k, v] of Object.entries(obj)) result[k] = sanitizeMissionText(v, maxLen)
        return result
      }
      return obj
    }
    mission.mission = sanitizeMissionText(mission.mission)

    // 5. Write mission file
    const platformSlug = slugify(platform.name)
    assertSafeSlug(platformSlug, 'platform.name')
    // Sanitize HTTP-derived verdict before using it to construct the file path (CWE-73).
    // The verdict is computed from LLM output; use an explicit allowlist to prevent
    // tainted data from influencing the filename beyond the '.draft.' infix.
    // path.basename() strips any residual path separators as a final safeguard.
    const VERDICT_SUFFIX_MAP = Object.freeze({ draft: '.draft', pass: '', review: '' })
    const verdictSuffix = Object.prototype.hasOwnProperty.call(VERDICT_SUFFIX_MAP, gateResult.verdict)
      ? VERDICT_SUFFIX_MAP[gateResult.verdict]
      : ''
    const finalFilename = basename(`platform-${platformSlug}${verdictSuffix}.json`)
    if (!/^platform-[a-z0-9-]+(?:\.draft)?\.json$/.test(finalFilename)) {
      throw new Error(`Unexpected output filename derived from HTTP-sourced verdict: ${finalFilename}`)
    }
    const finalPath = join(SOLUTIONS_DIR, finalFilename)

    // Path traversal guard (CWE-22)
    const resolvedPath = resolve(finalPath)
    const resolvedSolutionsDir = resolve(SOLUTIONS_DIR)
    assertSafePath(resolvedPath, resolvedSolutionsDir)
    const missionJson = serializeSanitizedMissionForFile(mission)

    if (!DRY_RUN) {
      // mission.mission is sanitized by sanitizeMissionText() above;
      // path validated via basename allowlist and assertSafePath(); serializeSanitizedMissionForFile()
      // applies a final integrity check before the bytes reach disk (fixes #2909).
      writeFileSync(resolvedPath, missionJson) // codeql[js/http-to-file-access]
      console.log(`  Wrote: ${finalPath}`)
    } else {
      console.log(`  [DRY RUN] Would write: ${finalPath}`)
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
  const skipped = results.filter(r => r.verdict === 'skipped').length
  const failed = results.filter(r => r.verdict === 'failed').length
  console.log(`\n=== Summary ===`)
  console.log(`Published: ${published} | Drafted: ${drafted} | Rejected: ${rejected} | Skipped: ${skipped} | Failed: ${failed}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
