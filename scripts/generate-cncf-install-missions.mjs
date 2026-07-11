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
import { join, dirname } from 'path'
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
      const waitMs = Math.max(0, (rateLimitReset * 1000) - Date.now()) + 1000
      console.warn(`  Rate limited, waiting ${Math.round(waitMs / 1000)}s...`)
      await sleep(waitMs)
      continue
    }
    if (response.status === 404) return null
    if (response.status >= 500) { await sleep(2000 * Math.pow(2, attempt)); continue }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.warn(`  GitHub API ${response.status}: ${url} — ${body.slice(0, 200)}`)
      return null
    }
    return response.json()
  }
  return null
}

async function fetchRawFile(owner, repo, path) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
  const data = await githubApi(url)
  if (!data || !data.content) return null
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

// ─── Knowledge source fetchers ───────────────────────────────────────

async function fetchReadme(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/readme`
  const data = await githubApi(url)
  if (!data || !data.content) return null
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

async function fetchRepoMeta(owner, repo) {
  return githubApi(`https://api.github.com/repos/${owner}/${repo}`)
}

async function fetchLatestRelease(owner, repo) {
  return githubApi(`https://api.github.com/repos/${owner}/${repo}/releases/latest`)
}

async function findHelmChart(owner, repo, config) {
  const chartPaths = config?.sources?.['helm-charts']?.chartPaths || ['charts/', 'deploy/charts/', 'helm/', 'install/helm/']
  for (const p of chartPaths) {
    const chartYaml = await fetchRawFile(owner, repo, `${p}Chart.yaml`)
    if (chartYaml) {
      const valuesYaml = await fetchRawFile(owner, repo, `${p}values.yaml`)
      return { chartYaml, valuesYaml, path: p }
    }
    // Try one level deeper (e.g. charts/projectname/Chart.yaml)
    const tree = await githubApi(`https://api.github.com/repos/${owner}/${repo}/contents/${p}`)
    if (Array.isArray(tree)) {
      for (const entry of tree.slice(0, 3)) {
        if (entry.type === 'dir') {
          const nested = await fetchRawFile(owner, repo, `${p}${entry.name}/Chart.yaml`)
          if (nested) {
            const vals = await fetchRawFile(owner, repo, `${p}${entry.name}/values.yaml`)
            return { chartYaml: nested, valuesYaml: vals, path: `${p}${entry.name}/` }
          }
        }
      }
    }
  }
  return null
}

async function findManifests(owner, repo, config) {
  const paths = config?.sources?.['kubectl-manifests']?.manifestPaths || ['deploy/', 'install/', 'manifests/', 'config/crd/']
  const manifests = []
  for (const p of paths) {
    const tree = await githubApi(`https://api.github.com/repos/${owner}/${repo}/contents/${p}`)
    if (Array.isArray(tree)) {
      const yamlFiles = tree.filter(f => f.name.endsWith('.yaml') || f.name.endsWith('.yml')).slice(0, 3)
      for (const f of yamlFiles) {
        const content = await fetchRawFile(owner, repo, `${p}${f.name}`)
        if (content) manifests.push({ name: f.name, content: content.slice(0, 3000) })
      }
      if (manifests.length > 0) break
    }
  }
  return manifests
}

async function findExampleConfigs(owner, repo, config) {
  const paths = config?.sources?.['common-configs']?.configPaths || ['examples/', 'config/', 'config/samples/']
  const configs = []
  for (const p of paths) {
    const tree = await githubApi(`https://api.github.com/repos/${owner}/${repo}/contents/${p}`)
    if (Array.isArray(tree)) {
      const relevant = tree.filter(f =>
        /\.(yaml|yml|json|toml)$/.test(f.name) &&
        /example|sample|default|basic|production|recommended/i.test(f.name)
      ).slice(0, 3)
      for (const f of relevant) {
        const content = await fetchRawFile(owner, repo, `${p}${f.name}`)
        if (content) configs.push({ name: `${p}${f.name}`, content: content.slice(0, 2000) })
      }
      if (configs.length > 0) break
    }
  }
  return configs
}

/** Timeout in ms for Artifact Hub and Helm repo URL validation requests */
const ARTIFACT_HUB_TIMEOUT_MS = 10000
/** Timeout in ms for Helm repo URL validation */
const HELM_URL_VALIDATE_TIMEOUT_MS = 5000

async function findArtifactHubChart(projectName, owner, repo) {
  try {
    const query = encodeURIComponent(projectName)
    const response = await fetch(
      `https://artifacthub.io/api/v1/packages/search?ts_query_web=${query}&kind=0&limit=5`,
      { signal: AbortSignal.timeout(ARTIFACT_HUB_TIMEOUT_MS) }
    )
    if (!response.ok) return null
    const data = await response.json()
    const packages = data.packages || []

    // Find best match: prefer exact name match or same org
    const match = packages.find(p =>
      p.name === projectName ||
      p.repository?.organization_name?.toLowerCase() === owner.toLowerCase() ||
      p.repository?.name?.toLowerCase() === projectName.toLowerCase()
    ) || packages[0]

    if (!match || !match.repository?.url) return null

    // Validate the URL actually serves index.yaml
    const repoUrl = match.repository.url.replace(/\/$/, '')
    const valid = await validateHelmRepoUrl(repoUrl)
    if (!valid) return null

    return {
      repoUrl,
      chartName: match.name,
      version: match.version,
      appVersion: match.app_version,
      description: match.description,
    }
  } catch {
    return null
  }
}

async function validateHelmRepoUrl(url) {
  try {
    const response = await fetch(`${url}/index.yaml`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(HELM_URL_VALIDATE_TIMEOUT_MS),
      redirect: 'follow',
    })
    return response.ok
  } catch {
    return false
  }
}

async function findKustomize(owner, repo, config) {
  const paths = config?.sources?.['kubectl-manifests']?.manifestPaths || ['deploy/', 'install/', 'manifests/', 'config/']
  // Also check root
  const allPaths = ['', ...paths]
  for (const p of allPaths) {
    const filePath = p ? `${p}kustomization.yaml` : 'kustomization.yaml'
    const content = await fetchRawFile(owner, repo, filePath)
    if (content) return { path: p || './', content: content.slice(0, 2000) }
    // Try kustomization.yml
    const altPath = p ? `${p}kustomization.yml` : 'kustomization.yml'
    const altContent = await fetchRawFile(owner, repo, altPath)
    if (altContent) return { path: p || './', content: altContent.slice(0, 2000) }
  }
  return null
}

async function findDockerfile(owner, repo) {
  for (const p of ['Dockerfile', 'build/Dockerfile', 'docker/Dockerfile']) {
    const content = await fetchRawFile(owner, repo, p)
    if (content) return content.slice(0, 2000)
  }
  return null
}

// ─── LLM synthesis ───────────────────────────────────────────────────

const INSTALL_SYSTEM_PROMPT = `You are an expert Kubernetes technical writer creating INSTALLATION missions for the KubeStellar Console.
An "install mission" is a structured, copy-pasteable guide that takes a user from zero to a running instance of a CNCF project, and also covers uninstalling, upgrading, and troubleshooting.

Your output MUST be a JSON object with these fields:
{
  "description": "1-3 sentences describing what this project does and why you'd install it.",
  "steps": [
    {
      "title": "Short imperative title (e.g. 'Add the Helm repository')",
      "description": "Detailed step with exact commands. Must be copy-pasteable. Use code blocks."
    }
  ],
  "uninstall": [
    {
      "title": "Short imperative title (e.g. 'Remove the Helm release')",
      "description": "Detailed step to cleanly remove the project. Include cleanup of CRDs, namespaces, PVCs, etc."
    }
  ],
  "upgrade": [
    {
      "title": "Short imperative title (e.g. 'Update the Helm repository')",
      "description": "Detailed step to upgrade/update an existing installation. Include backup steps, version checks, and rollback instructions."
    }
  ],
  "troubleshooting": [
    {
      "title": "Short title describing the issue (e.g. 'Pods stuck in CrashLoopBackOff')",
      "description": "Description of the problem, how to diagnose it, and the fix. Include exact diagnostic commands."
    }
  ],
  "resolution": "2-3 sentences confirming what a successful installation looks like.",
  "difficulty": "beginner|intermediate|advanced",
  "installMethods": ["helm", "kubectl", "operator", "kustomize", "docker"],
  "prerequisites": {
    "kubernetes": ">=1.24",
    "tools": ["helm", "kubectl"],
    "description": "Brief prereq description"
  },
  "containerImages": ["registry/org/image:tag"],
  "skip": false
}

Rules:
- If the project has NO installable component (it's a spec, SDK, or library only), return {"skip": true}
- CRITICAL: If the project is a CLI tool, SDK, language compiler, or desktop application (not a Kubernetes service), generate steps for LOCAL INSTALLATION (curl binary, brew install, pip install, cargo install, etc.) — NOT kubectl/helm deployment. Examples: opentofu, kcl, copa, kitops, stacker, notation, devspace, container2wasm are CLI tools.
- CRITICAL: ONLY use Helm install commands if a "## Helm Chart" section or "## Artifact Hub Helm Chart" section is provided in the context. If NEITHER section is present, DO NOT generate helm commands — use kubectl apply, kustomize, or another appropriate method instead.
- CRITICAL: Do NOT invent Helm repository URLs, chart names, or image names. ONLY use URLs and names explicitly provided in the context above. If you don't know the real Helm repo URL, DO NOT guess.
- CRITICAL: Every step description MUST contain at least one code block (triple backticks) with a real, copy-pasteable command. Steps with only prose and no commands are rejected.
- Steps MUST have real commands — never "see the documentation"
- Include a verification step (kubectl get pods, health check, port-forward, --version)
- Pin versions — never use :latest
- Use --namespace and --create-namespace for Kubernetes deployments
- 4-6 install steps is ideal
- "uninstall" must have 2-4 steps covering: remove release, clean up CRDs/resources, remove namespace
- "upgrade" must have 2-4 steps covering: backup current state, update repo/manifests, upgrade, verify
- "troubleshooting" must have 3-5 common issues with diagnostic commands and fixes
- "installMethods" MUST accurately list ONLY the methods used in the steps (e.g. ["helm"], ["kubectl"], ["kustomize"], or a combination)
- CRITICAL: Do NOT include generic placeholder steps like "kubectl edit deployment" for post-install configuration. If you need a configuration step, use specific, actionable commands (e.g. kubectl set resources, helm upgrade --set, or kubectl patch) — never interactive edit commands.
- Do NOT include "Configure resource limits" or "Post-install configuration" steps that only contain "kubectl edit deployment" — these are not actionable and reduce quality.`

function buildInstallPrompt(project, context) {
  const sections = [`# Install mission for: ${project.name} (${project.maturity})`]
  if (project.parentProject) {
    sections.push(`**This is a sub-component of the ${project.parentProject} project.** Generate a mission specifically for ${project.name} (repo: ${project.repo}), NOT the parent project.`)
  }
  sections.push(`Category: ${project.category}`)
  sections.push(`Repo: github.com/${project.repo}`)

  if (context.repoMeta) {
    sections.push(`\n## Project Info\n- Stars: ${context.repoMeta.stargazers_count}\n- Language: ${context.repoMeta.language}\n- Description: ${context.repoMeta.description || 'N/A'}`)
    if (context.repoMeta.homepage) sections.push(`- Homepage: ${context.repoMeta.homepage}`)
  }

  if (context.latestRelease) {
    sections.push(`\n## Latest Release\n- Tag: ${context.latestRelease.tag_name}\n- Date: ${context.latestRelease.published_at}`)
  }

  if (context.readme) {
    sections.push(`\n## README (excerpt)\n${truncate(context.readme, 3000)}`)
  }

  if (context.helmChart) {
    sections.push(`\n## Helm Chart (${context.helmChart.path})`)
    if (context.helmChart.chartYaml) sections.push(`### Chart.yaml\n\`\`\`yaml\n${truncate(context.helmChart.chartYaml, 1000)}\n\`\`\``)
    if (context.helmChart.valuesYaml) sections.push(`### values.yaml (excerpt)\n\`\`\`yaml\n${truncate(context.helmChart.valuesYaml, 2000)}\n\`\`\``)
  }

  if (context.artifactHubChart) {
    sections.push(`\n## Artifact Hub Helm Chart`)
    sections.push(`- Helm repo URL: ${context.artifactHubChart.repoUrl}`)
    sections.push(`- Chart name: ${context.artifactHubChart.chartName}`)
    if (context.artifactHubChart.version) sections.push(`- Chart version: ${context.artifactHubChart.version}`)
    if (context.artifactHubChart.appVersion) sections.push(`- App version: ${context.artifactHubChart.appVersion}`)
  }

  if (!context.helmChart && !context.artifactHubChart) {
    sections.push(`\n## ⚠️ NO HELM CHART FOUND\nThis project does NOT have a known Helm chart in its repository or on Artifact Hub. DO NOT generate Helm-based install commands. Use kubectl apply, kustomize, or another appropriate method.`)
  }

  if (context.kustomize) {
    sections.push(`\n## Kustomize (${context.kustomize.path})`)
    sections.push(`\`\`\`yaml\n${truncate(context.kustomize.content, 1500)}\n\`\`\``)
  }

  if (context.manifests?.length > 0) {
    sections.push(`\n## Kubernetes Manifests`)
    for (const m of context.manifests) {
      sections.push(`### ${m.name}\n\`\`\`yaml\n${truncate(m.content, 1500)}\n\`\`\``)
    }
  }

  if (context.exampleConfigs?.length > 0) {
    sections.push(`\n## Example Configurations`)
    for (const c of context.exampleConfigs) {
      sections.push(`### ${c.name}\n\`\`\`\n${truncate(c.content, 1000)}\n\`\`\``)
    }
  }

  if (context.dockerfile) {
    sections.push(`\n## Dockerfile (excerpt)\n\`\`\`dockerfile\n${truncate(context.dockerfile, 800)}\n\`\`\``)
  }

  sections.push('\nGenerate a complete install mission from the above context. Return JSON.')
  return sections.join('\n')
}

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

      const data = await response.json()
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
    gates.push({ gate: 'no-sensitive-data', pass: false, reason: `${sensitiveFindings.findings.length} sensitive data finding(s)` })
    return { pass: false, gates, score: 0, tier: 'rejected' }
  }
  gates.push({ gate: 'no-sensitive-data', pass: true })

  const maliciousFindings = scanForMaliciousContent(mission)
  if (maliciousFindings.findings.length > 0) {
    gates.push({ gate: 'no-malicious-content', pass: false, reason: `${maliciousFindings.findings.length} malicious content finding(s)` })
    return { pass: false, gates, score: 0, tier: 'rejected' }
  }
  gates.push({ gate: 'no-malicious-content', pass: true })

  // Gate 1: Schema compliance
  const schemaResult = validateMissionExport(mission)
  if (!schemaResult.valid) {
    gates.push({ gate: 'schema-compliance', pass: false, reason: schemaResult.errors.join('; ') })
    return { pass: false, gates, score: 0, tier: 'rejected' }
  }
  gates.push({ gate: 'schema-compliance', pass: true })

  // Gate 3: Actionable install command
  const allStepText = (mission.mission?.steps || []).map(s => s.description || '').join('\n')
  const resSnippets = (mission.mission?.resolution?.codeSnippets || []).join('\n')
  const allText = allStepText + '\n' + resSnippets
  if (!INSTALL_CMD_RE.test(allText)) {
    gates.push({ gate: 'actionable-install-cmd', pass: false, reason: 'No install command found in steps' })
    return { pass: false, gates, score: 0, tier: 'rejected' }
  }
  gates.push({ gate: 'actionable-install-cmd', pass: true })

  // Gate 4: Verification step
  if (!VERIFY_CMD_RE.test(allText)) {
    gates.push({ gate: 'verification-step', pass: false, reason: 'No verification command found in steps' })
    return { pass: false, gates, score: 0, tier: 'rejected' }
  }
  gates.push({ gate: 'verification-step', pass: true })

  // Gate 8: All steps must have code blocks — reject skeleton missions
  const steps = mission.mission?.steps || []
  const stepsWithoutCode = steps.filter(s => !(/```/.test(s.description || '')))
  if (stepsWithoutCode.length > 0) {
    gates.push({ gate: 'steps-have-code', pass: false, reason: `${stepsWithoutCode.length} step(s) have no code blocks` })
    return { pass: false, gates, score: 0, tier: 'rejected' }
  }
  gates.push({ gate: 'steps-have-code', pass: true })

  // Gate 7: Helm repo URL validation — reject missions with invalid Helm repo URLs
  const helmRepoMatch = allText.match(/helm repo add \S+ (\S+)/i)
  if (helmRepoMatch) {
    const helmUrl = helmRepoMatch[1].replace(/\/$/, '')
    // Async validation is handled in the caller — here we just flag if URL looks suspicious
    // Common hallucination patterns: project-name.github.io/charts, project.io/charts, etc.
    // The actual URL validation happens post-gate in processProject()
    gates.push({ gate: 'helm-repo-url-present', pass: true, url: helmUrl })
  }

  // Gate 2: Quality score
  const { score } = scoreMission(mission, minScore)
  // Apply install-specific bonuses
  let adjustedScore = score
  if (INSTALL_CMD_RE.test(allText)) adjustedScore += 10
  if (VERIFY_CMD_RE.test(allText)) adjustedScore += 10
  if (/prerequisit|requires?\s+kubernetes|helm\s+3|kubectl/i.test(allText)) adjustedScore += 5
  if (/v\d+\.\d+\.\d+|:\d+\.\d+/.test(allText)) adjustedScore += 5
  if (/--namespace|--create-namespace/i.test(allText)) adjustedScore += 5
  if (/resource.*limit|rbac|tls|certificate/i.test(allText)) adjustedScore += 5
  if (/see docs|see the documentation/i.test(allText) && !INSTALL_CMD_RE.test(allText)) adjustedScore -= 10
  if (/:latest\b/.test(allText)) adjustedScore -= 5
  // Bonuses for completeness: uninstall, upgrade, troubleshooting sections
  const uninstallSteps = mission.mission?.uninstall || []
  const upgradeSteps = mission.mission?.upgrade || []
  const troubleSteps = mission.mission?.troubleshooting || []
  if (uninstallSteps.length >= 2) adjustedScore += 5
  if (upgradeSteps.length >= 2) adjustedScore += 5
  if (troubleSteps.length >= 3) adjustedScore += 5
  adjustedScore = Math.min(100, Math.max(0, adjustedScore))

  let tier
  if (adjustedScore >= minScore) tier = 'publish'
  else if (adjustedScore >= draftMin) tier = 'draft'
  else tier = 'rejected'

  gates.push({ gate: 'quality-score', pass: tier !== 'rejected', score: adjustedScore, tier })

  return { pass: tier !== 'rejected', gates, score: adjustedScore, tier }
}

// ─── Mission builder ─────────────────────────────────────────────────

function buildMissionJson(project, llmResult, context, config) {
  const authorConf = config.author || {}
  const version = context.latestRelease?.tag_name || 'latest'
  const homepage = context.repoMeta?.homepage || `https://github.com/${project.repo}`

  // Build a clear title that distinguishes sub-projects from their parent
  const displayName = titleCase(project.name)
  const repoShort = project.repo.split('/')[1] || project.repo
  let missionTitle
  if (project.parentProject) {
    const parentName = titleCase(project.parentProject)
    missionTitle = `Install and Configure ${displayName} (${parentName}) on Kubernetes`
  } else {
    missionTitle = `Install and Configure ${displayName} on Kubernetes`
  }

  const mission = {
    version: 'kc-mission-v1',
    name: `install-${project.name}`,
    missionClass: 'install',
    author: authorConf.name || 'KubeStellar Bot',
    authorGithub: authorConf.github || 'kubestellar',
    mission: {
      title: missionTitle,
      description: llmResult.description || `Production-ready installation guide for ${displayName} (${repoShort}).`,
      type: 'deploy',
      status: 'completed',
      steps: (llmResult.steps || [])
        .filter(s => !isPlaceholderStep(s))
        .map(s => ({
          title: s.title.slice(0, 120),
          description: s.description.slice(0, 3000),
        })),
      uninstall: (llmResult.uninstall || []).map(s => ({
        title: s.title.slice(0, 120),
        description: s.description.slice(0, 3000),
      })),
      upgrade: (llmResult.upgrade || []).map(s => ({
        title: s.title.slice(0, 120),
        description: s.description.slice(0, 3000),
      })),
      troubleshooting: (llmResult.troubleshooting || []).map(s => ({
        title: s.title.slice(0, 120),
        description: s.description.slice(0, 3000),
      })),
      resolution: {
        summary: llmResult.resolution || `${displayName} is installed and verified.`,
        codeSnippets: extractCodeSnippets((llmResult.steps || []).filter(s => !isPlaceholderStep(s))),
      },
    },
    metadata: {
      tags: ['installation', 'configuration', 'cncf', project.category, project.maturity, ...(project.parentProject ? [project.parentProject] : [])],
      cncfProjects: project.parentProject ? [project.parentProject, project.name] : [project.name],
      targetResourceKinds: detectResourceKinds(llmResult.steps || []),
      difficulty: llmResult.difficulty || 'intermediate',
      issueTypes: ['installation', 'configuration'],
      installMethods: llmResult.installMethods || detectInstallMethods(llmResult.steps || []),
      maturity: project.maturity,
      projectVersion: version,
      containerImages: llmResult.containerImages || [],
      sourceUrls: {
        docs: homepage,
        repo: `https://github.com/${project.repo}`,
        ...(context.helmChart ? { helm: `https://github.com/${project.repo}/tree/main/${context.helmChart.path}` } : {}),
        ...(context.artifactHubChart ? { helm: context.artifactHubChart.repoUrl } : {}),
      },
    },
    prerequisites: llmResult.prerequisites || {
      kubernetes: '>=1.24',
      tools: ['kubectl'],
      description: `A running Kubernetes cluster with kubectl configured.`,
    },
    security: {
      scannedAt: new Date().toISOString(),
      scannerVersion: 'cncf-install-gen-1.0.0',
      sanitized: true,
      findings: [],
    },
  }

  return mission
}

/** Detect generic placeholder steps (e.g. "kubectl edit deployment" config stubs) */
function isPlaceholderStep(step) {
  const text = `${step.title || ''} ${step.description || ''}`
  // Reject steps whose only actionable command is "kubectl edit deployment"
  if (/kubectl\s+edit\s+deployment/i.test(text)) {
    // Check if the step has any OTHER real command besides kubectl edit
    const otherCmds = /(?:kubectl\s+(?:apply|create|set|patch|rollout|scale)|helm\s+(?:install|upgrade)|docker\s+run|kustomize)/i
    if (!otherCmds.test(text)) return true
  }
  return false
}

function extractCodeSnippets(steps) {
  const snippets = []
  for (const step of steps) {
    const matches = (step.description || '').matchAll(/```[\w]*\n([\s\S]*?)```/g)
    for (const m of matches) {
      if (m[1].trim().length > 10) snippets.push(m[1].trim())
      if (snippets.length >= 5) return snippets
    }
  }
  return snippets
}

function detectResourceKinds(steps) {
  const text = steps.map(s => s.description || '').join('\n').toLowerCase()
  const kinds = []
  const resources = ['deployment', 'service', 'configmap', 'secret', 'namespace', 'serviceaccount',
    'clusterrole', 'clusterrolebinding', 'ingress', 'statefulset', 'daemonset',
    'persistentvolumeclaim', 'networkpolicy', 'horizontalpodautoscaler', 'customresourcedefinition']
  for (const kind of resources) {
    if (text.includes(kind)) kinds.push(kind.charAt(0).toUpperCase() + kind.slice(1))
  }
  return [...new Set(kinds)].slice(0, 8)
}

function detectInstallMethods(steps) {
  const text = steps.map(s => s.description || '').join('\n')
  const methods = []
  if (/helm install|helm upgrade|helm repo/i.test(text)) methods.push('helm')
  if (/kubectl apply|kubectl create/i.test(text)) methods.push('kubectl')
  if (/kustomize build|kubectl kustomize/i.test(text)) methods.push('kustomize')
  if (/operator-sdk|OLM|OperatorHub/i.test(text)) methods.push('operator')
  if (/docker run|docker compose/i.test(text)) methods.push('docker')
  return methods.length > 0 ? methods : ['kubectl']
}

function titleCase(str) {
  return str.replace(/(?:^|[-_])(\w)/g, (_, c) => ' ' + c.toUpperCase()).trim()
}

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

function truncate(text, max) {
  if (!text) return ''
  return text.length <= max ? text : text.slice(0, max) + '\n... [truncated]'
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

// ─── Report ──────────────────────────────────────────────────────────

function formatReport(report) {
  const lines = [
    '# CNCF Install Mission Generation Report',
    '',
    `**Date:** ${new Date().toISOString()}`,
    `**Published:** ${report.published}`,
    `**Drafts:** ${report.drafts}`,
    `**Rejected:** ${report.rejected}`,
    `**Skipped (no installable component):** ${report.skipped}`,
    `**Errors:** ${report.errors}`,
    `**Average quality score:** ${report.avgScore.toFixed(1)}`,
    '',
    '## Projects',
    '',
    '| Project | Maturity | Score | Tier | Install Methods |',
    '|---------|----------|-------|------|-----------------|',
  ]
  for (const p of report.projects) {
    lines.push(`| ${p.name} | ${p.maturity} | ${p.score} | ${p.tier} | ${p.installMethods} |`)
  }

  if (report.rejectedProjects.length > 0) {
    lines.push('', '## Rejected (quality gate failures)', '')
    for (const r of report.rejectedProjects) {
      lines.push(`- **${r.name}**: ${r.reason}`)
    }
  }
  return lines.join('\n')
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  if (!GITHUB_TOKEN) {
    console.warn('Warning: GITHUB_TOKEN not set. API rate limits will be very low.')
  }

  const config = loadInstallSourcesConfig()

  // Non-installable projects — specs, community orgs, libs, and circular installs
  const NON_INSTALLABLE_PROJECTS = new Set([
    'cloudevents', 'openmetrics', 'opentelemetry-specification',
    'in-toto-spec', 'notary-project', 'kubernetes',  // K8s-on-K8s is circular
    'grpc',             // library/spec — not an installable K8s component
    'cedar',            // policy language/library — no runtime binary
    'connect-rpc',      // library — used via language package managers
    'container-network-interface', // spec — CNI plugins are separate projects
    'composefs',        // filesystem library — not a K8s component
    'bootc',            // bootable container tooling — not a K8s component
    'oscal-compass',    // compliance spec tooling — not installable on K8s
    'helm',             // helm-on-helm is circular
  ])

  // Filter projects — exclude kubestellar itself and non-installable specs
  let projects = CNCF_PROJECTS.filter(p => {
    if (p.name === 'kubestellar') return false
    if (NON_INSTALLABLE_PROJECTS.has(p.name)) {
      console.log(`Skipping non-installable project: ${p.name}`)
      return false
    }
    return true
  })

  if (TARGET_PROJECTS) {
    projects = projects.filter(p => TARGET_PROJECTS.includes(p.name))
  }

  if (BATCH_INDEX != null) {
    const start = BATCH_INDEX * BATCH_SIZE
    projects = projects.slice(start, start + BATCH_SIZE)
    console.log(`Batch ${BATCH_INDEX}: ${projects.length} projects`)
  }

  if (projects.length === 0) {
    console.log('No projects to process.')
    const reportPath = join(process.cwd(), BATCH_INDEX != null ? `install-report-${BATCH_INDEX}.md` : 'install-report.md')
    writeFileSync(reportPath, formatReport({ published: 0, drafts: 0, rejected: 0, skipped: 0, errors: 0, avgScore: 0, projects: [], rejectedProjects: [] }))
    process.exit(0)
  }

  console.log(`Processing ${projects.length} CNCF projects for install missions`)
  mkdirSync(SOLUTIONS_DIR, { recursive: true })

  const report = { published: 0, drafts: 0, rejected: 0, skipped: 0, errors: 0, scores: [], projects: [], rejectedProjects: [] }

  for (const project of projects) {
    const [owner, repo] = project.repo.split('/')
    console.log(`\n── ${project.name} (${project.repo}) ──`)

    // Skip if already exists (unless FORCE_REGENERATE)
    const slug = slugify(project.name)
    // Validate slug is safe (CWE-20: no path separators, no dots)
    if (!slug || slug.includes('/') || slug.includes('\\') || slug.includes('.') || slug.startsWith('-')) {
      throw new Error(`Unsafe slug generated from project.name: ${slug}`)
    }
    const outPath = join(SOLUTIONS_DIR, `install-${slug}.json`)
    const draftPath = join(SOLUTIONS_DIR, `install-${slug}.draft.json`)
    if (!FORCE_REGENERATE && (existsSync(outPath) || existsSync(draftPath))) {
      console.log('  Already exists, skipping (use FORCE_REGENERATE=true to overwrite)')
      continue
    }

    try {
      // Fetch all 6 knowledge sources in parallel where possible
      console.log('  Fetching knowledge sources...')
      const [repoMeta, readme, latestRelease] = await Promise.all([
        fetchRepoMeta(owner, repo),
        fetchReadme(owner, repo),
        fetchLatestRelease(owner, repo),
      ])
      await sleep(200)

      const [helmChart, manifests, exampleConfigs, dockerfile, kustomize] = await Promise.all([
        findHelmChart(owner, repo, config),
        findManifests(owner, repo, config),
        findExampleConfigs(owner, repo, config),
        findDockerfile(owner, repo),
        findKustomize(owner, repo, config),
      ])

      // Always check Artifact Hub — even if in-repo chart was found, we need the real published Helm repo URL
      const artifactHubChart = await findArtifactHubChart(project.name, owner, repo)
      if (artifactHubChart) {
        console.log(`  Artifact Hub chart found: ${artifactHubChart.repoUrl} (${artifactHubChart.chartName})`)
      }

      const context = { repoMeta, readme, latestRelease, helmChart, artifactHubChart, manifests, exampleConfigs, dockerfile, kustomize }

      const sourceCount = [readme, helmChart || artifactHubChart, manifests?.length > 0, exampleConfigs?.length > 0, dockerfile, latestRelease, kustomize].filter(Boolean).length
      console.log(`  Sources found: ${sourceCount}/7 (readme:${!!readme} helm:${!!helmChart} artifactHub:${!!artifactHubChart} kustomize:${!!kustomize} manifests:${manifests?.length || 0} configs:${exampleConfigs?.length || 0} dockerfile:${!!dockerfile} release:${!!latestRelease})`)

      // Synthesize via LLM
      console.log('  Synthesizing install mission via LLM...')
      const llmResult = await synthesizeInstallMission(project, context)

      if (!llmResult) {
        console.log('  LLM returned skip/null — project may not be installable')
        report.skipped++
        report.projects.push({ name: project.name, maturity: project.maturity, score: 0, tier: 'skipped', installMethods: 'N/A' })
        continue
      }

      // Reject missions with empty install steps (no commands at all)
      const hasInstallCmd = (llmResult.steps || []).some(s =>
        /kubectl|helm|curl|apt|pip|docker|kustomize|operator-sdk/i.test(s.description || '')
      )
      if (!hasInstallCmd) {
        console.log('  Rejected: install steps contain no actual install commands')
        report.rejected++
        report.rejectedProjects.push({ name: project.name, reason: 'Empty install steps — no commands found' })
        report.projects.push({ name: project.name, maturity: project.maturity, score: 0, tier: 'rejected', installMethods: 'N/A' })
        continue
      }

      // Build mission JSON
      const mission = buildMissionJson(project, llmResult, context, config)

      // Sanitize infrastructure details and redact credentials from mission content
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

      // Validate chart name matches project name (basic sanity check)
      let qualityScore = 100
      if (llmResult.helmChart && !llmResult.helmChart.toLowerCase().includes(project.name.toLowerCase().split('-')[0])) {
        console.log(`  ⚠ Helm chart "${llmResult.helmChart}" doesn't match project "${project.name}" — possible wrong project`)
        // Don't reject, but flag for review by penalizing score
        const CHART_NAME_MISMATCH_PENALTY = 20
        qualityScore = Math.max(0, qualityScore - CHART_NAME_MISMATCH_PENALTY)
      }

      // Apply quality gate
      const gateResult = applyQualityGate(mission, config)
      // Apply any pre-gate penalty from chart name mismatch
      const FULL_SCORE = 100
      if (qualityScore < FULL_SCORE) {
        gateResult.score = Math.max(0, gateResult.score - (FULL_SCORE - qualityScore))
      }
      mission.metadata.qualityScore = gateResult.score
      console.log(`  Quality: ${gateResult.score}/100 — ${gateResult.tier}`)

      // Post-gate: validate any Helm repo URLs in the generated steps
      const allStepTextForValidation = (mission.mission?.steps || []).map(s => s.description || '').join('\n')
      const helmUrlMatch = allStepTextForValidation.match(/helm repo add (\S+) (\S+)/i)
      if (helmUrlMatch) {
        const helmRepoName = helmUrlMatch[1]
        const helmUrl = helmUrlMatch[2].replace(/\/$/, '')
        const helmUrlValid = await validateHelmRepoUrl(helmUrl)
        if (!helmUrlValid) {
          console.log(`  ⚠️ Helm repo URL validation FAILED: ${helmUrl}`)
          // If we have a known-good URL from Artifact Hub, fix the mission in-place
          if (artifactHubChart?.repoUrl) {
            console.log(`  🔧 Fixing: replacing with Artifact Hub URL: ${artifactHubChart.repoUrl}`)
            const badUrl = helmUrl
            const goodUrl = artifactHubChart.repoUrl
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
            console.log(`  ❌ Rejected: LLM generated invalid Helm repo URL and no Artifact Hub fallback`)
            report.rejected++
            report.rejectedProjects.push({ name: project.name, reason: `Invalid Helm repo URL: ${helmUrl}` })
            report.projects.push({ name: project.name, maturity: project.maturity, score: gateResult.score, tier: 'rejected', installMethods: 'N/A' })
            continue
          }
        } else {
          console.log(`  ✅ Helm repo URL validated: ${helmUrl}`)
        }
      }

      if (gateResult.tier === 'rejected') {
        const failedGates = gateResult.gates.filter(g => !g.pass).map(g => `${g.gate}: ${g.reason || 'failed'}`).join(', ')
        console.log(`  ❌ Rejected: ${failedGates}`)
        report.rejected++
        report.rejectedProjects.push({ name: project.name, reason: failedGates })
        report.projects.push({ name: project.name, maturity: project.maturity, score: gateResult.score, tier: 'rejected', installMethods: 'N/A' })
        continue
      }

      report.scores.push(gateResult.score)
      const methods = (mission.metadata.installMethods || []).join(', ')

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would write: ${gateResult.tier === 'draft' ? draftPath : outPath}`)
      } else {
        const targetPath = gateResult.tier === 'draft' ? draftPath : outPath
        
        // Path traversal guard (CWE-22)
        const resolvedPath = join(process.cwd(), targetPath)
        const resolvedSolutionsDir = join(process.cwd(), SOLUTIONS_DIR)
        if (!resolvedPath.startsWith(resolvedSolutionsDir + '/') && resolvedPath !== resolvedSolutionsDir) {
          throw new Error(`Path traversal detected: ${targetPath}`)
        }
        
        writeFileSync(targetPath, JSON.stringify(mission, null, 2) + '\n')
        console.log(`  ✅ Written: ${targetPath.split('/').pop()} (${methods})`)
      }

      if (gateResult.tier === 'draft') report.drafts++
      else report.published++

      report.projects.push({ name: project.name, maturity: project.maturity, score: gateResult.score, tier: gateResult.tier, installMethods: methods })

      await sleep(500)
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`)
      report.errors++
      report.projects.push({ name: project.name, maturity: project.maturity, score: 0, tier: 'error', installMethods: 'N/A' })
    }
  }

  report.avgScore = report.scores.length > 0 ? report.scores.reduce((a, b) => a + b, 0) / report.scores.length : 0

  const reportName = BATCH_INDEX != null ? `install-report-${BATCH_INDEX}.md` : 'install-report.md'
  writeFileSync(join(process.cwd(), reportName), formatReport(report))
  console.log(`\nDone: ${report.published} published, ${report.drafts} drafts, ${report.rejected} rejected, ${report.skipped} skipped, ${report.errors} errors`)
  console.log(`Average score: ${report.avgScore.toFixed(1)}`)
}

if (process.argv[1]?.endsWith('generate-cncf-install-missions.mjs')) {
  main().catch(err => { console.error(err); process.exit(1) })
}

export { applyQualityGate, buildMissionJson, synthesizeInstallMission, slugify, titleCase, formatReport, validateHelmRepoUrl, findArtifactHubChart, findKustomize }
