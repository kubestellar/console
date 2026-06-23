/**
 * LLM-powered mission synthesizer supporting multiple backends:
 *   1. GitHub Copilot API (Claude Opus/Sonnet) — preferred, included with Copilot subscription
 *   2. Anthropic API (direct) — if ANTHROPIC_API_KEY is set
 *   3. GitHub Models API (GPT-4o) — free fallback for GitHub Actions
 *
 * Backend selection priority:
 *   - COPILOT_TOKEN or GITHUB_TOKEN + Copilot → api.enterprise.githubcopilot.com
 *   - ANTHROPIC_API_KEY → api.anthropic.com
 *   - LLM_TOKEN/GITHUB_TOKEN → models.github.ai (OpenAI models only)
 */

// --- Configuration ---
const COPILOT_ENDPOINT = 'https://api.enterprise.githubcopilot.com/chat/completions'
const COPILOT_MODEL = process.env.COPILOT_MODEL || 'claude-opus-4.6'

const ANTHROPIC_ENDPOINT = process.env.ANTHROPIC_ENDPOINT || 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
const ANTHROPIC_VERSION = '2023-06-01'

const GITHUB_MODELS_ENDPOINT = process.env.LLM_ENDPOINT || 'https://models.github.ai/inference/chat/completions'
const GITHUB_MODELS_MODEL = process.env.LLM_MODEL || 'openai/gpt-4o'

const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10)
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || '4096', 10)
const LLM_MAX_RETRIES = 2

/**
 * Determine which backend to use.
 * @returns {{ backend: string, token: string, endpoint: string, model: string } | null}
 */
function getBackendConfig() {
  // 1. Copilot API (Claude via GitHub Copilot subscription)
  const copilotToken = process.env.COPILOT_TOKEN || process.env.GITHUB_TOKEN
  if (copilotToken && process.env.USE_COPILOT !== 'false') {
    return { backend: 'copilot', token: copilotToken, endpoint: COPILOT_ENDPOINT, model: COPILOT_MODEL }
  }

  // 2. Anthropic API (direct)
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey) {
    return { backend: 'anthropic', token: anthropicKey, endpoint: ANTHROPIC_ENDPOINT, model: ANTHROPIC_MODEL }
  }

  // 3. GitHub Models (OpenAI only)
  const ghToken = process.env.LLM_TOKEN || process.env.GITHUB_TOKEN
  if (ghToken) {
    return { backend: 'github-models', token: ghToken, endpoint: GITHUB_MODELS_ENDPOINT, model: GITHUB_MODELS_MODEL }
  }

  return null
}

/**
 * Synthesize a high-quality mission from raw issue context.
 * @param {object} params
 * @returns {Promise<{description: string, steps: Array, resolution: string, difficulty: string, type: string} | null>}
 */
export async function synthesizeMission(params) {
  const config = getBackendConfig()
  if (!config) {
    console.warn('  [LLM] No API key found (set GITHUB_TOKEN, ANTHROPIC_API_KEY, or COPILOT_TOKEN)')
    return null
  }

  console.log(`  [LLM] Using ${config.backend} (${config.model})`)
  const prompt = buildPrompt(params)

  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
    try {
      let response
      if (config.backend === 'anthropic') {
        response = await callAnthropic(config, prompt)
      } else {
        // Both copilot and github-models use OpenAI-compatible format
        response = await callOpenAICompatible(config, prompt)
      }

      if (response.rateLimited) {
        const wait = response.retryAfterSec || 5
        console.warn(`  [LLM] Rate limited, waiting ${wait}s (attempt ${attempt + 1})`)
        await sleep(wait * 1000)
        continue
      }

      if (response.error) {
        console.warn(`  [LLM] API error: ${response.error} (attempt ${attempt + 1})`)
        // If Copilot fails (e.g. no subscription), fall back to next backend
        if (config.backend === 'copilot' && attempt === LLM_MAX_RETRIES) {
          console.warn('  [LLM] Copilot failed, trying fallback backends...')
          return await synthesizeWithFallback(params, prompt)
        }
        if (attempt < LLM_MAX_RETRIES) {
          await sleep(2000 * (attempt + 1))
          continue
        }
        return null
      }

      const content = response.content
      if (!content) {
        console.warn('  [LLM] Empty response')
        return null
      }

      const jsonStr = extractJSON(content)
      let parsed
      try {
        parsed = JSON.parse(jsonStr)
      } catch (parseErr) {
        const MAX_PREVIEW_LEN = 300
        console.warn(`  [LLM] JSON parse failed: ${parseErr.message}`)
        console.warn(`  [LLM] Raw content preview: ${content.slice(0, MAX_PREVIEW_LEN)}`)
        throw parseErr // re-throw to hit the retry logic
      }

      if (parsed.skip || !parsed.description || !parsed.steps?.length) {
        console.log('  [LLM] Skipped — not actionable')
        return null
      }

      const result = validateAndClean(parsed)
      if (!result) {
        console.warn('  [LLM] Failed validation (generic steps, too few steps, or no commands)')
        return null
      }

      return result
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        console.warn(`  [LLM] Timeout after ${LLM_TIMEOUT_MS}ms (attempt ${attempt + 1})`)
      } else if (err instanceof SyntaxError) {
        console.warn(`  [LLM] Invalid JSON response (attempt ${attempt + 1}): ${err.message}`)
      } else {
        console.warn(`  [LLM] Error: ${err.message} (attempt ${attempt + 1})`)
      }
      if (attempt < LLM_MAX_RETRIES) {
        await sleep(2000 * (attempt + 1))
      }
    }
  }

  return null
}

/** Try fallback backends if primary (Copilot) fails */
async function synthesizeWithFallback(params, prompt) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey) {
    console.log('  [LLM] Falling back to Anthropic API')
    const config = { backend: 'anthropic', token: anthropicKey, endpoint: ANTHROPIC_ENDPOINT, model: ANTHROPIC_MODEL }
    try {
      const response = await callAnthropic(config, prompt)
      if (response.content) {
        const parsed = JSON.parse(extractJSON(response.content))
        if (!parsed.skip && parsed.description && parsed.steps?.length) {
          return validateAndClean(parsed)
        }
      }
    } catch { /* fall through */ }
  }

  const ghToken = process.env.LLM_TOKEN
  if (ghToken) {
    console.log('  [LLM] Falling back to GitHub Models')
    const config = { backend: 'github-models', token: ghToken, endpoint: GITHUB_MODELS_ENDPOINT, model: GITHUB_MODELS_MODEL }
    try {
      const response = await callOpenAICompatible(config, prompt)
      if (response.content) {
        const parsed = JSON.parse(extractJSON(response.content))
        if (!parsed.skip && parsed.description && parsed.steps?.length) {
          return validateAndClean(parsed)
        }
      }
    } catch { /* give up */ }
  }

  return null
}

// --- API callers ---

async function callAnthropic(config, userPrompt) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': config.token,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: LLM_MAX_TOKENS,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })

  if (response.status === 429) {
    return { rateLimited: true, retryAfterSec: parseInt(response.headers.get('retry-after') || '10', 10) }
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return { error: `${response.status}: ${body.slice(0, 200)}` }
  }
  const data = await response.json()
  const textBlock = (data.content || []).find(b => b.type === 'text')
  return { content: textBlock?.text || null }
}

async function callOpenAICompatible(config, userPrompt) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: LLM_MAX_TOKENS,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })

  if (response.status === 429) {
    return { rateLimited: true, retryAfterSec: parseInt(response.headers.get('retry-after') || '5', 10) }
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return { error: `${response.status}: ${body.slice(0, 200)}` }
  }
  const data = await response.json()
  return { content: data.choices?.[0]?.message?.content || null }
}

// --- System prompt ---

const SYSTEM_PROMPT = `You are an expert cloud-native infrastructure engineer creating troubleshooting missions for the KubeStellar Console knowledge base. A "mission" teaches a Kubernetes operator how to diagnose and fix a real-world problem.

Your output MUST be a JSON object with these fields:
{
  "description": "1-3 sentences describing the problem. Include the exact error message or symptom the operator sees.",
  "steps": [
    {
      "title": "Short imperative verb phrase (e.g., 'Check pod resource limits')",
      "description": "Detailed instructions with exact commands. Include kubectl commands, YAML patches, helm value overrides, or config file edits. Every step must be copy-pasteable."
    }
  ],
  "resolution": "2-4 sentences explaining WHY this fix works — the root cause, not just the remedy.",
  "difficulty": "beginner|intermediate|advanced|expert",
  "type": "troubleshoot|deploy|upgrade|analyze|configure|feature",
  "skip": false
}

QUALITY REQUIREMENTS — your output will be scored and rejected if it fails these:

1. STEPS must be SPECIFIC and ACTIONABLE:
   - GOOD: "Check pod resource limits:\\n\`\`\`bash\\nkubectl describe pod <name> -n <ns> | grep -A5 Limits\\n\`\`\`"
   - BAD: "Review the issue", "Understand the problem", "Verify the fix"
   - Each step title must start with an imperative verb: Check, Configure, Apply, Update, Patch, Create, Delete, Scale, Restart, Enable, Disable, Set, Add, Remove, Inspect, Debug, Validate
   - Each step description MUST contain at least one of: a command, a YAML block, a file path, or a config snippet
   - NEVER use these generic titles: "Understand the problem", "Apply the configuration", "Review the fix", "Verify the fix", "Check the documentation"

2. DESCRIPTION must include SYMPTOMS:
   - Include the exact error message, log line, or observable behavior
   - Be specific: "Pods stuck in CrashLoopBackOff with exit code 137" not "Pods are crashing"

3. RESOLUTION must explain ROOT CAUSE:
   - GOOD: "The OOMKilled exit code 137 indicates the container exceeded its memory limit. Increasing the limit to 512Mi allows the JVM heap to fit within the allocation."
   - BAD: "The fix resolves the issue by applying the correct configuration."

4. CODE SNIPPETS must be REAL:
   - Use actual resource names, actual kubectl flags, actual YAML fields
   - Include apiVersion and kind in YAML blocks
   - Show both the "before" state (how to diagnose) and "after" state (the fix)

5. SKIP non-actionable content:
   - Feature requests with no implementation → {"skip": true}
   - No clear solution or resolution → {"skip": true}
   - PR template boilerplate, CI bot output, changelog entries → {"skip": true}
   - WIP/draft with no conclusion → {"skip": true}

6. TYPE must match the content:
   - troubleshoot: fixing bugs, errors, crashes, misconfigurations
   - deploy: installing or setting up a component
   - upgrade: version migration, breaking changes
   - analyze: performance, resource usage, capacity
   - configure: tuning settings, enabling features
   - feature: implementing a new capability

7. STRIP all noise: Ignore Codecov reports, CI status, bot comments, PR templates, git diffs.`

// --- Prompt builder ---

function buildPrompt(params) {
  const sections = [`# Project: ${params.projectName}\n# Issue: ${params.issueTitle}`]

  if (params.issueBody) {
    sections.push(`## Problem Description\n${truncate(cleanInput(params.issueBody), 3000)}`)
  }

  if (params.labels?.length) {
    sections.push(`## Labels\n${params.labels.join(', ')}`)
  }

  if (params.solution) {
    sections.push(`## Solution / Resolution\n${truncate(cleanInput(params.solution), 3000)}`)
  }

  if (params.codeSnippets?.length) {
    const cleanSnippets = params.codeSnippets.filter(s => !isGarbageSnippet(s)).slice(0, 5)
    if (cleanSnippets.length > 0) {
      sections.push(`## Relevant Code/Config\n${cleanSnippets.map(s => '```\n' + truncate(s, 800) + '\n```').join('\n')}`)
    }
  }

  if (params.prUrl) {
    sections.push(`## Linked PR: ${params.prUrl}`)
  }

  if (params.prDiff) {
    sections.push(`## Key Changes\n${truncate(cleanInput(params.prDiff), 2000)}`)
  }

  sections.push('\nSynthesize a high-quality mission from the above. Return a single JSON object.')
  return sections.join('\n\n')
}

// --- Input cleaning ---

function cleanInput(text) {
  if (!text) return ''
  return text
    .replace(/## \[?Codecov[\s\S]*?(?=\n## |\n---|\Z)/gi, '')
    .replace(/\|[^|]*coverage[^|]*\|[\s\S]*?\n\n/gi, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '[image removed]')
    .replace(/<!--[\s\S]*?--!?>/g, '') // Remove all HTML comments (standard --> and variant --!>)
    .replace(/<!-->/g, '')              // Remove malformed <!--> opener
    .replace(/--!?>/g, '')              // Remove any orphaned --> or --!> closers
    .replace(/#{1,3}\s*(?:What this PR does|Release note|Changelog|Special notes)[\s\S]*?(?=\n#{1,3} |\n---|\Z)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isGarbageSnippet(snippet) {
  const lower = snippet.toLowerCase()
  if (lower.includes('codecov') || lower.includes('coverage δ') || lower.includes('impacted files')) return true
  if (snippet.startsWith('diff --git') || /^[+-]{3} [ab]\//.test(snippet)) return true
  if (lower.includes('invalid pr title') || lower.includes('has been automatically marked as stale')) return true
  if ((snippet.match(/!\[.*?\]\(https?:\/\//g) || []).length > 2) return true
  const lines = snippet.split('\n')
  const quotedLines = lines.filter(l => l.trim().startsWith('>')).length
  if (quotedLines > lines.length * 0.7 && lines.length > 3) return true
  return false
}

// --- Response parsing ---

function extractJSON(text) {
  if (!text) return text
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) return trimmed
  const match = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (match) return match[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

// --- Validation ---

const BANNED_STEP_TITLES = [
  'understand the problem', 'review the issue', 'check the documentation',
  'apply the configuration', 'review the fix', 'verify the fix',
  'review the changes', 'confirm the fix', 'apply the fix',
]

function validateAndClean(parsed) {
  const steps = (parsed.steps || [])
    .filter(s => s.title && s.description)
    .filter(s => !BANNED_STEP_TITLES.includes(s.title.toLowerCase().trim()))
    .map(s => ({ title: s.title.slice(0, 120), description: s.description.slice(0, 3000) }))

  const MIN_STEPS = 3
  if (steps.length < MIN_STEPS) return null

  // Require at least one step with a command or code block
  const hasActionableStep = steps.some(s => {
    const d = s.description
    return d.includes('```') || d.includes('kubectl') || d.includes('helm')
      || d.includes('docker') || d.includes('curl') || /\$ /.test(d)
  })
  if (!hasActionableStep) return null

  const validDifficulties = ['beginner', 'intermediate', 'advanced', 'expert']
  const validTypes = ['troubleshoot', 'deploy', 'upgrade', 'analyze', 'configure', 'feature']

  return {
    description: (parsed.description || '').slice(0, 500),
    steps,
    resolution: (parsed.resolution || '').slice(0, 2000),
    difficulty: validDifficulties.includes(parsed.difficulty) ? parsed.difficulty : 'intermediate',
    type: validTypes.includes(parsed.type) ? parsed.type : 'troubleshoot',
  }
}

// --- Utilities ---

function truncate(text, max) {
  if (!text) return ''
  if (text.length <= max) return text
  return text.slice(0, max) + '\n... [truncated]'
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
