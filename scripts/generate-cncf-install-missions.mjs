#!/usr/bin/env node
/**
 * Generates 1 canonical install + configure mission per CNCF project.
 * Crawls 6 knowledge sources (docs, README, Helm, containers, configs, manifests),
 * synthesizes via LLM, and applies a 7-gate quality gate.
 *
 * Environment variables:
 *   GITHUB_TOKEN       — GitHub API + GitHub Models auth
 *   TARGET_PROJECTS    — comma-separated project names (empty = all)
 *   BATCH_INDEX        — batch index for parallelism
 *   BATCH_SIZE         — projects per batch (default 20)
 *   DRY_RUN            — if 'true', no files written
 *   QUALITY_THRESHOLD  — minimum score (default 60)
 *   FORCE_REGENERATE   — if 'true', overwrite existing missions
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import { CNCF_PROJECTS } from './cncf-projects.mjs'
import { validateMissionExport, scanForSensitiveData, scanForMaliciousContent } from './scanner.mjs'
import { scoreMission } from './quality-scorer.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Config ──────────────────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const TARGET_PROJECTS = process.env.TARGET_PROJECTS
  ? process.env.TARGET_PROJECTS.split(',').map(s => s.trim()).filter(Boolean)
  : null
const DRY_RUN = process.env.DRY_RUN === 'true'
const BATCH_INDEX = process.env.BATCH_INDEX != null ? parseInt(process.env.BATCH_INDEX, 10) : null
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '20', 10)
const FORCE_REGENERATE = process.env.FORCE_REGENERATE === 'true'
const QUALITY_THRESHOLD = parseInt(process.env.QUALITY_THRESHOLD || '60', 10)
const DRAFT_THRESHOLD = parseInt(process.env.DRAFT_THRESHOLD || '40', 10)
const SOLUTIONS_DIR = join(process.cwd(), 'fixes', 'cncf-install')

const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://models.inference.ai.azure.com/chat/completions'
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10)

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
}

// Validate LLM_ENDPOINT at module load time (CWE-441: prevent SSRF)
assertTrustedEndpoint(LLM_ENDPOINT)

let rateLimitRemaining = 5000
let rateLimitReset = 0

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function loadInstallSourcesConfig() {
  const configPath = join(__dirname, 'install-sources.yaml')
  if (!existsSync(configPath)) {
    console.warn('Warning: install-sources.yaml not found, using defaults')
    return { sources: {}, quality: { minScore: 60, draftMinScore: 40 }, author: { name: 'KubeStellar Bot', github: 'kubestellar' } }
  }
  return parseYaml(readFileSync(configPath, 'utf-8'))
}

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
    'User-Agent': 'cncf-install-mission-gen/1.0',
  }
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
    const rem = response.headers.get('x-ratelimit-remaining')
    const rst = response.headers.get('x-ratelimit-reset')
    if (rem != null) rateLimitRemaining = parseInt(rem, 10)
    if (rst != null) rateLimitReset = parseInt(rst, 10)

    if (response.status === 403 && rateLimitRemaining === 0) {
      const waitMs = Math.max(0, (rateLimitReset * 1000) - Date.now()) + 2000
      console.log(`  GitHub rate limit hit, waiting ${Math.round(waitMs / 1000)}s...`)
      await sleep(waitMs)
      continue
    }
    return response
  }
  throw new Error(`GitHub API request failed after 3 attempts: ${url}`)
}

async function fetchRawFile(owner, repo, path) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
  const res = await githubApi(url)
  if (!res.ok) return null
  const data = await res.json()
  if (data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8')
  }
  return data.content || null
}

// ─── Knowledge source fetchers ───────────────────────────────────────

async function fetchReadme(owner, repo) {
  const res = await githubApi(`https://api.github.com/repos/${owner}/${repo}/readme`)
  if (!res.ok) return null
  const data = await res.json()
  return Buffer.from(data.content, 'base64').toString('utf-8').slice(0, 8000)
}

async function fetchRepoMeta(owner, repo) {
  const res = await githubApi(`https://api.github.com/repos/${owner}/${repo}`)
  if (!res.ok) return null
  return res.json()
}

async function fetchLatestRelease(owner, repo) {
  const res = await githubApi(`https://api.github.com/repos/${owner}/${repo}/releases/latest`)
  if (!res.ok) return null
  return res.json()
}

async function fetchHelmCharts(owner, repo) {
  const paths = ['charts/', 'chart/', 'helm/', '']
  const charts = []
  for (const p of paths) {
    const chartYaml = await fetchRawFile(owner, repo, `${p}Chart.yaml`)
    if (chartYaml) {
      const valuesYaml = await fetchRawFile(owner, repo, `${p}values.yaml`)
      charts.push({ path: p, chartYaml: chartYaml.slice(0, 3000), valuesYaml: valuesYaml?.slice(0, 3000) })
      // Also look for sub-charts
      try {
        const dirRes = await githubApi(`https://api.github.com/repos/${owner}/${repo}/contents/${p}charts`)
        if (dirRes.ok) {
          const entries = await dirRes.json()
          for (const entry of entries.slice(0, 3)) {
            const nested = await fetchRawFile(owner, repo, `${p}${entry.name}/Chart.yaml`)
            if (nested) {
              const vals = await fetchRawFile(owner, repo, `${p}${entry.name}/values.yaml`)
              charts.push({ path: `${p}${entry.name}/`, chartYaml: nested.slice(0, 2000), valuesYaml: vals?.slice(0, 2000) })
            }
          }
        }
      } catch { /* ignore */ }
      break
    }
  }
  return charts
}

async function fetchKustomizeManifests(owner, repo) {
  const paths = ['config/default/', 'deploy/', 'manifests/', 'kustomize/', '']
  for (const p of paths) {
    const kustomization = await fetchRawFile(owner, repo, `${p}kustomization.yaml`)
    if (kustomization) {
      // Fetch a few related manifests
      const manifests = []
      try {
        const dirRes = await githubApi(`https://api.github.com/repos/${owner}/${repo}/contents/${p}`)
        if (dirRes.ok) {
          const entries = await dirRes.json()
          for (const f of entries.filter(e => e.name.endsWith('.yaml') && e.name !== 'kustomization.yaml').slice(0, 3)) {
            const content = await fetchRawFile(owner, repo, `${p}${f.name}`)
            if (content) manifests.push({ name: f.name, content: content.slice(0, 2000) })
          }
        }
      } catch { /* ignore */ }
      return { kustomization: kustomization.slice(0, 3000), manifests }
    }
  }
  return null
}

async function fetchDockerImages(owner, repo) {
  const images = []
  // Try Dockerfile
  for (const path of ['Dockerfile', 'docker/Dockerfile', 'build/Dockerfile']) {
    const content = await fetchRawFile(owner, repo, path)
    if (content) {
      images.push({ path, content: content.slice(0, 2000) })
      break
    }
  }
  // Try docker-compose
  for (const path of ['docker-compose.yml', 'docker-compose.yaml']) {
    const content = await fetchRawFile(owner, repo, path)
    if (content) {
      images.push({ path, content: content.slice(0, 2000) })
      break
    }
  }
  return images
}

async function fetchOperatorManifests(owner, repo) {
  const paths = ['deploy/operator.yaml', 'config/manager/manager.yaml', 'operator.yaml']
  for (const p of paths) {
    const content = await fetchRawFile(owner, repo, p)
    if (content) return content.slice(0, 3000)
  }
  return null
}

async function fetchArtifactHubChart(projectName) {
  try {
    const response = await fetch(
      `https://artifacthub.io/api/v1/packages/search?kind=0&ts_query_web=${encodeURIComponent(projectName)}&limit=3`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!response.ok) return null
    const data = await response.json()
    const pkg = data.packages?.[0]
    if (!pkg) return null
    return {
      repoUrl: pkg.repository?.url,
      chartName: pkg.name,
      latestVersion: pkg.version,
    }
  } catch {
    return null
  }
}

async function checkHelmRepoUrl(url) {
  try {
    const response = await fetch(`${url}/index.yaml`, {
      signal: AbortSignal.timeout(10000),
    })
    return response.ok
  } catch {
    return false
  }
}

async function fetchArtifactHubIndexForRepo(helmRepoUrl) {
  try {
    const response = await fetch(`${helmRepoUrl}/index.yaml`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    return response.text()
  } catch {
    return null
  }
}

// ─── Context builder ─────────────────────────────────────────────────

async function gatherProjectContext(project) {
  const [owner, repo] = (project.repo || '').split('/')
  if (!owner || !repo) return {}

  const [repoMeta, readme, latestRelease, helmCharts, kustomize, dockerImages, operatorManifests] = await Promise.all([
    fetchRepoMeta(owner, repo),
    fetchReadme(owner, repo),
    fetchLatestRelease(owner, repo),
    fetchHelmCharts(owner, repo),
    fetchKustomizeManifests(owner, repo),
    fetchDockerImages(owner, repo),
    fetchOperatorManifests(owner, repo),
  ])

  return {
    repoMeta,
    readme,
    latestRelease,
    helmCharts,
    kustomize,
    dockerImages,
    operatorManifests,
  }
}

// ─── Prompt builder ──────────────────────────────────────────────────

const INSTALL_SYSTEM_PROMPT = `You are an expert Kubernetes DevOps engineer. Your task is to generate a complete, accurate, and practical install mission for a CNCF project.

Rules:
- Generate REAL install steps with actual CLI commands, not placeholders
- Include verification steps using kubectl get/describe/logs
- Steps must be actionable — no "see documentation" or vague instructions
- For Helm: include helm repo add, update, install commands with specific versions
- For kubectl: include apply commands with specific manifest URLs
- Use the latest stable version from the context provided
- Each step description MUST contain the actual command in a markdown code block
- Return ONLY valid JSON, no markdown fences

IMPORTANT: If the project is not a CNCF project or cannot be meaningfully installed on Kubernetes, return {"skip": true}.`

function buildInstallPrompt(project, context) {
  const sections = []

  sections.push(`## CNCF Project: ${project.name}`)
  sections.push(`Maturity: ${project.maturity || 'sandbox'}`)
  sections.push(`Description: ${project.description || ''}`)

  if (context.repoMeta) {
    sections.push(`\nRepository: ${context.repoMeta.full_name}`)
    sections.push(`Stars: ${context.repoMeta.stargazers_count} | Language: ${context.repoMeta.language}`)
  }

  if (context.latestRelease) {
    sections.push(`Latest Release: ${context.latestRelease.tag_name} (${context.latestRelease.published_at?.slice(0, 10) || 'unknown'})`)
  }

  if (context.readme) {
    sections.push(`\n## README (excerpt)\n${context.readme.slice(0, 4000)}`)
  }

  if (context.helmCharts?.length > 0) {
    const chart = context.helmCharts[0]
    sections.push(`\n## Helm Chart.yaml\n\`\`\`yaml\n${chart.chartYaml}\n\`\`\``)
    if (chart.valuesYaml) {
      sections.push(`\n## Helm values.yaml (excerpt)\n\`\`\`yaml\n${chart.valuesYaml.slice(0, 2000)}\n\`\`\``)
    }
  }

  if (context.kustomize) {
    sections.push(`\n## kustomization.yaml\n\`\`\`yaml\n${context.kustomize.kustomization}\n\`\`\``)
  }

  if (context.operatorManifests) {
    sections.push(`\n## Operator Manifest (excerpt)\n\`\`\`yaml\n${context.operatorManifests.slice(0, 2000)}\n\`\`\``)
  }

  const slug = slugify(project.name)
  const installMethods = project.installMethods || ['kubectl']

  sections.push(`\n## Required JSON Schema\n\`\`\`json\n${JSON.stringify({
    version: 'kc-mission-v1',
    name: `install-${slug}`,
    missionClass: 'installer',
    author: 'KubeStellar Bot',
    authorGithub: 'kubestellar',
    mission: {
      title: `${project.name}: Complete Install Guide`,
      description: `Step-by-step Kubernetes installation guide for ${project.name}.`,
      type: 'configuration',
      status: 'completed',
      steps: [
        { title: 'Step title', description: 'Step with actual commands in code blocks' },
      ],
      resolution: {
        summary: 'What was installed and how to verify.',
        codeSnippets: ['key command or YAML'],
      },
    },
    metadata: {
      category: project.category || 'cncf',
      installMethods,
      cncfProjects: [project.name.toLowerCase()],
      qualityScore: 0,
    },
    prerequisites: {
      tools: ['kubectl', ...(installMethods.includes('helm') ? ['helm'] : [])],
      permissions: ['cluster-admin'],
    },
    security: {
      rbacRequired: true,
      networkPolicies: false,
    },
  }, null, 2)}\n\`\`\``)

  return sections.join('\n')
}

// ─── LLM call ────────────────────────────────────────────────────────

async function synthesizeInstallMission(project, context) {
  const token = process.env.LLM_TOKEN || GITHUB_TOKEN
  if (!token) return null

  const prompt = buildInstallPrompt(project, context)

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const response = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            { role: 'system', content: INSTALL_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 3000,
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

      // Validate Content-Type and enforce a response size ceiling before parsing
      // HTTP-derived bytes into the mission object that will be written to disk (CWE-434).
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        console.warn(`  [LLM] Unexpected Content-Type: ${contentType.slice(0, 100)}`)
        return null
      }
      const MAX_LLM_RESPONSE_BYTES = 1_000_000
      const rawText = await response.text()
      if (rawText.length > MAX_LLM_RESPONSE_BYTES) {
        console.warn(`  [LLM] Response too large (${rawText.length} bytes), rejecting`)
        return null
      }
      const data = JSON.parse(rawText)
      const content = data.choices?.[0]?.message?.content
      if (!content) return null

      const parsed = JSON.parse(content)
      if (parsed.skip || !parsed.steps?.length) return null
      return parsed
    } catch (err) {
      console.warn(`  [LLM] ${err.name === 'AbortError' ? 'Timeout' : err.message} (attempt ${attempt + 1})`)
      if (attempt < 2) await sleep(3000 * (attempt + 1))
    }
  }
  return null
}

// ─── Quality Gate ────────────────────────────────────────────────────

const INSTALL_CMD_RE = /helm install|helm upgrade|kubectl apply|kubectl create|docker run|operator-sdk|kustomize build|kubectl kustomize/i
const VERIFY_CMD_RE = /kubectl get|kubectl describe|kubectl logs|curl.*health|curl.*ready|kubectl port-forward|kubectl rollout status/i

function applyQualityGate(mission, config) {
  const gates = []
  const qualityConf = config.quality || {}
  const minScore = qualityConf.minScore || QUALITY_THRESHOLD
  const draftMin = qualityConf.draftMinScore || DRAFT_THRESHOLD

  // Gate 5+6: Security scan (run first — cheapest)
  const sensitiveFindings = scanForSensitiveData(mission)
  if (sensitiveFindings.findings.length > 0) {
    return {
      tier: 'rejected',
      score: 0,
      gates: [{ gate: 'security', pass: false, reason: `Sensitive data: ${sensitiveFindings.findings.map(f => f.type).join(', ')}` }],
    }
  }

  const maliciousFindings = scanForMaliciousContent(mission)
  if (maliciousFindings.findings.length > 0) {
    return {
      tier: 'rejected',
      score: 0,
      gates: [{ gate: 'malicious', pass: false, reason: `Malicious content: ${maliciousFindings.findings.map(f => f.type).join(', ')}` }],
    }
  }

  // Gate 1: Schema
  const validation = validateMissionExport(mission)
  gates.push({ gate: 'schema', pass: validation.valid, reason: validation.errors?.join('; ') })

  // Gate 2: Install command
  const steps = mission.mission?.steps || []
  const hasInstallCmd = steps.some(s => INSTALL_CMD_RE.test(s.description || '') || INSTALL_CMD_RE.test(s.title || ''))
  gates.push({ gate: 'install-cmd', pass: hasInstallCmd, reason: hasInstallCmd ? null : 'No install command' })

  // Gate 3: Verification
  const hasVerify = steps.some(s => VERIFY_CMD_RE.test(s.description || '') || VERIFY_CMD_RE.test(s.title || ''))
  gates.push({ gate: 'verification', pass: hasVerify, reason: hasVerify ? null : 'No verification step' })

  // Gate 4: Step count
  gates.push({ gate: 'step-count', pass: steps.length >= 3, reason: steps.length < 3 ? `Only ${steps.length} steps` : null })

  // Gate 7: Quality score
  const score = scoreMission(mission)
  gates.push({ gate: 'quality-score', pass: score >= minScore, reason: score < minScore ? `Score ${score} < ${minScore}` : null })

  const allPass = gates.every(g => g.pass)
  const tier = allPass ? 'published' : (score >= draftMin ? 'draft' : 'rejected')

  return { tier, score, gates }
}

// ─── Path + slug helpers ─────────────────────────────────────────────

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

// ─── Helm URL validation ─────────────────────────────────────────────

async function validateAndFixHelmUrl(helmUrl, projectName) {
  const isValid = await checkHelmRepoUrl(helmUrl)
  if (isValid) return { valid: true, url: helmUrl }

  const artifactHubChart = await fetchArtifactHubChart(projectName)
  if (artifactHubChart?.repoUrl) {
    const fallbackValid = await checkHelmRepoUrl(artifactHubChart.repoUrl)
    if (fallbackValid) return { valid: true, url: artifactHubChart.repoUrl, fromArtifactHub: true }
  }
  return { valid: false }
}

// ─── Staleness check ─────────────────────────────────────────────────

function isMissionStale(filePath) {
  if (FORCE_REGENERATE) return true
  try {
    const mission = JSON.parse(readFileSync(filePath, 'utf-8'))
    const generatedAt = mission.metadata?.generatedAt
    if (!generatedAt) return true
    const age = (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60 * 24)
    return age > 14
  } catch {
    return true
  }
}

// ─── Report ──────────────────────────────────────────────────────────

function formatReport(report) {
  const lines = [
    '# CNCF Install Mission Generation Report',
    `Generated: ${new Date().toISOString()}`,
    `Model: ${LLM_MODEL}`,
    '',
    '## Summary',
    `- Published: ${report.published}`,
    `- Drafts: ${report.drafts}`,
    `- Rejected: ${report.rejected}`,
    `- Skipped: ${report.skipped}`,
    `- Errors: ${report.errors}`,
    `- Average Score: ${report.avgScore?.toFixed(1) ?? 'N/A'}`,
    '',
  ]

  if (report.projects?.length > 0) {
    lines.push('## Projects')
    for (const p of report.projects) {
      lines.push(`- **${p.name}** (${p.maturity}): score=${p.score}, tier=${p.tier}, methods=${p.installMethods}`)
    }
  }

  if (report.rejectedProjects?.length > 0) {
    lines.push('\n## Rejected Projects')
    for (const p of report.rejectedProjects) {
      lines.push(`- **${p.name}**: ${p.reason}`)
    }
  }

  return lines.join('\n')
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('=== CNCF Install Mission Generator ===')
  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN required')
    process.exit(1)
  }

  const config = loadInstallSourcesConfig()
  mkdirSync(SOLUTIONS_DIR, { recursive: true })

  // Collect projects
  let projects = [...CNCF_PROJECTS]

  if (TARGET_PROJECTS?.length) {
    projects = projects.filter(p =>
      TARGET_PROJECTS.some(t => p.name.toLowerCase().includes(t.toLowerCase()))
    )
    console.log(`Filtered to ${projects.length} projects matching: ${TARGET_PROJECTS.join(', ')}`)
  }

  // Batch slicing
  if (BATCH_INDEX != null) {
    const start = BATCH_INDEX * BATCH_SIZE
    const end = start + BATCH_SIZE
    console.log(`Batch ${BATCH_INDEX}: projects ${start}–${Math.min(end, projects.length) - 1} of ${projects.length}`)
    projects = projects.slice(start, end)
  }

  console.log(`Processing ${projects.length} projects\n`)

  const report = {
    published: 0, drafts: 0, rejected: 0, skipped: 0, errors: 0,
    scores: [], avgScore: 0,
    projects: [], rejectedProjects: [],
  }

  for (const project of projects) {
    const slug = slugify(project.name)
    assertSafeSlug(slug, 'project.name')
    const outFilename = basename(`install-${slug}.json`)
    if (!/^install-[a-z0-9-]+\.json$/.test(outFilename)) {
      throw new Error(`Unexpected output filename: ${outFilename}`)
    }
    const outPath = join(SOLUTIONS_DIR, outFilename)
    const draftFilename = basename(`install-${slug}.draft.json`)
    if (!/^install-[a-z0-9-]+\.draft\.json$/.test(draftFilename)) {
      throw new Error(`Unexpected draft filename: ${draftFilename}`)
    }
    const draftPath = join(SOLUTIONS_DIR, draftFilename)

    // Check if exists and is fresh
    if ((existsSync(outPath) || existsSync(draftPath)) && !isMissionStale(existsSync(outPath) ? outPath : draftPath)) {
      console.log(`  Skipping ${project.name} — mission exists and is fresh`)
      report.skipped++
      report.projects.push({ name: project.name, maturity: project.maturity, score: 0, tier: 'skipped', installMethods: 'N/A' })
      continue
    }

    console.log(`Processing: ${project.name} (${project.maturity})`)

    // Gather context from GitHub
    let context = {}
    try {
      context = await gatherProjectContext(project)
    } catch (err) {
      console.warn(`  Context gathering failed: ${err.message}`)
    }

    // Synthesize mission via LLM
    let llmResult
    try {
      llmResult = await synthesizeInstallMission(project, context)
    } catch (err) {
      console.error(`  LLM synthesis failed: ${err.message}`)
      report.errors++
      report.projects.push({ name: project.name, maturity: project.maturity, score: 0, tier: 'error', installMethods: 'N/A' })
      continue
    }

    if (!llmResult) {
      console.log(`  LLM returned null — skipping`)
      report.skipped++
      report.projects.push({ name: project.name, maturity: project.maturity, score: 0, tier: 'skipped', installMethods: 'N/A' })
      continue
    }

    // Build mission
    const authorConf = config.author || {}
    const mission = {
      version: 'kc-mission-v1',
      name: `install-${slug}`,
      missionClass: 'installer',
      author: authorConf.name || 'KubeStellar Bot',
      authorGithub: authorConf.github || 'kubestellar',
      mission: {
        title: String(llmResult.mission?.title || `${project.name}: Install Guide`).slice(0, 200),
        description: String(llmResult.mission?.description || '').slice(0, 500),
        type: 'configuration',
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
        category: project.category || 'cncf',
        installMethods: project.installMethods || ['kubectl'],
        cncfProjects: [project.name.toLowerCase()],
        qualityScore: 0,
        generatedAt: new Date().toISOString(),
      },
      prerequisites: {
        tools: ['kubectl', ...((project.installMethods || []).includes('helm') ? ['helm'] : [])],
        permissions: ['cluster-admin'],
      },
      security: {
        rbacRequired: true,
        networkPolicies: false,
      },
    }

    // Validate Helm repo URL
    if (llmResult.installMethods?.includes('helm') && llmResult.helmRepoUrl) {
      const helmUrl = String(llmResult.helmRepoUrl).trim()
      const helmValidation = await validateAndFixHelmUrl(helmUrl, project.name)

      if (!helmValidation.valid) {
        console.log(`  ❌ Rejected: LLM generated invalid Helm repo URL and no Artifact Hub fallback`)
        report.rejected++
        report.rejectedProjects.push({ name: project.name, reason: `Invalid Helm repo URL: ${helmUrl}` })
        report.projects.push({ name: project.name, maturity: project.maturity, score: 0, tier: 'rejected', installMethods: 'N/A' })
        continue
      }

      if (helmValidation.fromArtifactHub) {
        console.log(`  🔧 Fixing: replacing with Artifact Hub URL: ${helmValidation.url}`)
        const badUrl = helmUrl
        const goodUrl = helmValidation.url
        for (const step of mission.mission.steps) {
          step.description = step.description.replace(badUrl, goodUrl)
        }
        for (const step of (mission.mission.uninstall || [])) {
          step.description = step.description.replace(badUrl, goodUrl)
        }
        for (const step of (mission.mission.upgrade || [])) {
          step.description = step.description.replace(badUrl, goodUrl)
        }
        if (mission.mission.resolution?.codeSnippets) {
          mission.mission.resolution.codeSnippets = mission.mission.resolution.codeSnippets.map(s => s.replace(badUrl, goodUrl))
        }
      } else {
        console.log(`  ✅ Helm repo URL validated: ${helmUrl}`)
      }
    }

    // Apply quality gate
    const gateResult = applyQualityGate(mission, config)
    mission.metadata.qualityScore = gateResult.score

    const failedGates = gateResult.gates.filter(g => !g.pass).map(g => `${g.gate}: ${g.reason || 'failed'}`).join(', ')
    console.log(`  Score: ${gateResult.score} → ${gateResult.tier}${failedGates ? ` (${failedGates})` : ''}`)

    if (gateResult.tier === 'rejected') {
      console.log(`  ❌ Rejected: ${failedGates}`)
      report.rejected++
      report.rejectedProjects.push({ name: project.name, reason: failedGates })
      report.projects.push({ name: project.name, maturity: project.maturity, score: gateResult.score, tier: 'rejected', installMethods: 'N/A' })
      continue
    }

    report.scores.push(gateResult.score)
    const methods = (mission.metadata.installMethods || []).join(', ')

    // Sanitize mission text after LLM synthesis
    const sanitizeMissionText = (obj, maxLen = 5000) => {
      if (typeof obj === 'string') {
        // Strip script/HTML, control chars, and cap length to prevent injection,
        // exfiltration, and unbounded writes from HTTP-sourced content (CWE-434, fixes #2896).
        return obj
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, '')
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

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would write: ${gateResult.tier === 'draft' ? draftPath : outPath}`)
    } else {
      // Sanitize HTTP-derived tier before using it to select the output path (CWE-73).
      // Both draftPath and outPath are computed from the validated local slug; we apply
      // path.basename() to isolate the filename component and validate it against an
      // allowlist pattern to break the taint from HTTP-sourced tier data.
      const candidatePath = gateResult.tier === 'draft' ? draftPath : outPath
      const safeBasename = basename(candidatePath)
      if (!/^install-[a-z0-9-]+(?:\.draft)?\.json$/.test(safeBasename)) {
        throw new Error(`Unexpected output filename derived from HTTP-sourced tier: ${safeBasename}`)
      }
      const targetPath = join(SOLUTIONS_DIR, safeBasename)

      // Path traversal guard (CWE-22)
      const resolvedPath = join(process.cwd(), targetPath)
      const resolvedSolutionsDir = join(process.cwd(), SOLUTIONS_DIR)
      assertSafePath(resolvedPath, resolvedSolutionsDir)
      
      writeFileSync(targetPath, JSON.stringify(mission, null, 2) + '\n') // CodeQL[js/http-to-file-access] mission.mission sanitized via sanitizeMissionText() (strips script/HTML/controls, caps length); path validated via basename allowlist and assertSafePath() above
      console.log(`  ✅ Written: ${safeBasename} (${methods})`)
    }

    if (gateResult.tier === 'draft') report.drafts++
    else report.published++

    report.projects.push({ name: project.name, maturity: project.maturity, score: gateResult.score, tier: gateResult.tier, installMethods: methods })

    await sleep(500)
  }

  report.avgScore = report.scores.length > 0 ? report.scores.reduce((a, b) => a + b, 0) / report.scores.length : 0

  const reportName = BATCH_INDEX != null ? `install-report-${BATCH_INDEX}.md` : 'install-report.md'
  writeFileSync(join(process.cwd(), reportName), formatReport(report))
  console.log(`\nDone: ${report.published} published, ${report.drafts} drafts, ${report.rejected} rejected, ${report.skipped} skipped, ${report.errors} errors`)
  console.log(`Average score: ${report.avgScore.toFixed(1)}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
