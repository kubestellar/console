/**
 * Mission Executor — LLM-powered integration test for install missions.
 *
 * Reads a mission JSON file, spins up against a Kind cluster, and uses an LLM
 * agent in a multi-turn loop to:
 *   1. Parse commands from each step's description
 *   2. Execute them against the cluster
 *   3. Diagnose failures and retry (max 3 attempts per step)
 *   4. Run verification steps and confirm the install worked
 *   5. Clean up (delete namespace)
 *
 * Usage:
 *   GITHUB_TOKEN=xxx node scripts/mission-executor.mjs <mission.json> [mission2.json ...]
 *
 * Environment:
 *   GITHUB_TOKEN     — GitHub Models API auth (required)
 *   KUBECONFIG       — path to kubeconfig (default: ~/.kube/config)
 *   LLM_MODEL        — model to use (default: gpt-4o-mini)
 *   MAX_RETRIES      — retries per step (default: 3)
 *   STEP_TIMEOUT_MS  — timeout per command (default: 120000)
 *   MISSION_TIMEOUT_MS — timeout per mission (default: 300000)
 *   DRY_RUN          — if "true", print commands but don't execute
 */

import { readFileSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'

const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://models.inference.ai.azure.com/chat/completions'
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10)
const STEP_TIMEOUT_MS = parseInt(process.env.STEP_TIMEOUT_MS || '120000', 10)
const MISSION_TIMEOUT_MS = parseInt(process.env.MISSION_TIMEOUT_MS || '300000', 10)
const DRY_RUN = process.env.DRY_RUN === 'true'

function getToken() {
  return process.env.LLM_TOKEN || process.env.GITHUB_TOKEN
}

// ── Shell execution ─────────────────────────────────────────────

// Allowlist of permitted base commands for Kubernetes installation missions.
// Every pipeline segment in LLM-provided commands must start with one of these.
// NOTE: bash/sh removed to prevent `shell -c` injection bypass.
// NOTE: `env` removed — `env <binary>` is a known allowlist escape (e.g.
//   `env bash -c 'evil'` runs bash even though bash is not in this set).
//   Environment variables should be set via spawnSync's `env:` option instead.
// NOTE: interpreter-capable tools such as awk/sed/find/xargs are excluded
//   because they can reintroduce arbitrary command execution via their own DSLs.
const ALLOWED_BASE_COMMANDS = new Set([
  'kubectl', 'helm', 'curl', 'cat', 'echo', 'grep',
  'jq', 'yq', 'kustomize', 'istioctl', 'date', 'ls',
  'sleep', 'timeout', 'base64', 'tr', 'cut', 'wc', 'head', 'tail',
  'printf', 'test', 'true', 'false', 'mkdir', 'rm', 'cp', 'mv',
  'sort', 'uniq', 'which',
])

/**
 * Validates that every pipeline segment in cmd starts with an allowed binary.
 * Returns { safe: true } or { safe: false, reason: string }.
 *
 * Prevents command-line injection when LLM-provided commands are executed
 * without shell interpolation (CWE-078, CWE-088).
 */
function validateCommand(cmd) {
  // Block subshell expansion patterns
  if (/\$\(/.test(cmd)) {
    return { safe: false, reason: 'Subshell expansion $() is not allowed' }
  }
  if (/`/.test(cmd)) {
    return { safe: false, reason: 'Backtick command substitution is not allowed' }
  }

  // Block bash/sh -c invocations
  if (/\b(?:bash|sh)\b.*\s+-c\b/.test(cmd)) {
    return { safe: false, reason: 'Shell -c execution is not allowed' }
  }

  // Block kubectl exec/run/cp with -- separator (argument injection risk)
  if (/\bkubectl\b.*\b(exec|run|cp)\b.*--\s+\S/.test(cmd)) {
    return { safe: false, reason: 'kubectl exec/run/cp with -- is not allowed (argument injection risk)' }
  }

  // Block find/xargs -exec flags
  if (/\b(?:find|xargs)\b.*-exec\b/.test(cmd)) {
    return { safe: false, reason: 'find/xargs -exec is not allowed (arbitrary command execution risk)' }
  }

  // Block pipes and redirections (require shell, cannot execute safely without shell)
  if (/[|><&]/.test(cmd)) {
    return { safe: false, reason: 'Pipes and redirections (|, >, <, &) are not allowed' }
  }

  // Split on shell delimiters to check each segment individually
  const segments = cmd.split(/\s*(?:;|&&|\|\||\(|\))\s*/).filter(Boolean)
  for (const seg of segments) {
    const trimmed = seg.trim()
    if (!trimmed) continue
    // Strip leading shell-style VAR=value env assignments (e.g. KUBECONFIG=/path kubectl ...)
    const withoutEnv = trimmed.replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)*/i, '')
    const firstWord = withoutEnv.split(/\s+/)[0]
    if (firstWord && !ALLOWED_BASE_COMMANDS.has(firstWord)) {
      return { safe: false, reason: `Disallowed command: '${firstWord}'` }
    }
  }
  return { safe: true }
}

/**
 * Parses a shell command string into an argv array using basic tokenization.
 * Handles quoted strings and escaped characters.
 * Returns an array of strings: [binary, arg1, arg2, ...]
 */
function parseCommand(cmd) {
  const args = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let i = 0

  while (i < cmd.length) {
    const c = cmd[i]

    if (c === '\\' && !inSingle) {
      i++
      if (i < cmd.length) current += cmd[i]
    } else if (c === "'" && !inDouble) {
      inSingle = !inSingle
    } else if (c === '"' && !inSingle) {
      inDouble = !inDouble
    } else if (c === ' ' && !inSingle && !inDouble) {
      if (current) { args.push(current); current = '' }
    } else {
      current += c
    }
    i++
  }
  if (current) args.push(current)

  return args
}

function sanitizeArg(arg) {
  if (/[\0\r\n]/.test(arg)) {
    throw new Error('Arguments may not contain control characters')
  }
  if (/[$`|><&;]/.test(arg) || arg.includes('$(')) {
    throw new Error(`Unsafe argument rejected: ${arg}`)
  }
  return `${arg}`
}

function runBinary(binary, cmdArgs, { timeoutMs = STEP_TIMEOUT_MS, input } = {}) {
  if (!ALLOWED_BASE_COMMANDS.has(binary)) {
    return {
      success: false,
      output: `[BLOCKED] Disallowed command: ${binary}`,
      exitCode: 1,
      error: `Security: Disallowed command: ${binary}`,
    }
  }

  try {
    const safeArgs = cmdArgs.map(sanitizeArg)
    const result = spawnSync(binary, safeArgs, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      shell: false,
      env: { ...process.env, TERM: 'dumb' },
      input,
    })

    if (result.error) {
      return {
        success: false,
        output: result.error.message,
        exitCode: 1,
        error: result.error.message,
      }
    }

    const output = (result.stdout || '') + (result.stderr || '')

    if (result.status === 0) {
      return { success: true, output: output.trim(), exitCode: 0 }
    }

    return {
      success: false,
      output: output.trim(),
      exitCode: result.status || 1,
      error: `Command exited with code ${result.status}`,
    }
  } catch (err) {
    return {
      success: false,
      output: err.message,
      exitCode: 1,
      error: err.message,
    }
  }
}

function execCommand(cmd, timeoutMs = STEP_TIMEOUT_MS) {
  const check = validateCommand(cmd)
  if (!check.safe) {
    console.warn(`  ⚠️  [sec] Blocked unsafe command: ${check.reason}`)
    console.warn(`  ⚠️  [sec] Command: ${cmd.slice(0, 200)}`)
    return {
      success: false,
      output: `[BLOCKED] ${check.reason}`,
      exitCode: 1,
      error: `Security: ${check.reason}`,
    }
  }
  
  try {
    // Parse command into [binary, ...args] and execute without shell
    const args = parseCommand(cmd)
    if (args.length === 0) {
      return {
        success: false,
        output: '[ERROR] Empty command',
        exitCode: 1,
        error: 'Empty command after parsing',
      }
    }
    
    const [binary, ...cmdArgs] = args

    // Resolve binary from ALLOWED_BASE_COMMANDS constant to break CodeQL taint flow
    // (CWE-078: prevents user-controlled string from flowing directly to spawnSync)
    let safeBinary = null
    for (const allowed of ALLOWED_BASE_COMMANDS) {
      if (allowed === binary) { safeBinary = allowed; break }
    }
    if (safeBinary === null) {
      return {
        success: false,
        output: '[BLOCKED] Binary not in allowlist',
        exitCode: 1,
        error: 'Security: Binary not in allowed commands',
      }
    }

    return runBinary(safeBinary, cmdArgs, { timeoutMs })
  } catch (err) {
    return {
      success: false,
      output: err.message,
      exitCode: 1,
      error: err.message,
    }
  }
}

// ── LLM conversation ───────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Kubernetes DevOps engineer executing installation missions on a Kind cluster.
You receive mission steps and execute them one at a time. For each step:

1. Extract the shell commands from the step description (they are usually in code blocks).
2. Adapt commands for a Kind cluster if needed (e.g. no LoadBalancer, use NodePort or port-forward).
3. If a command fails, diagnose the error and suggest a fix.
4. After verification steps, confirm whether the installation succeeded.

RULES:
- Only output valid JSON responses.
- Commands must be safe for a test cluster (no production destructive operations).
- If a Helm repo add fails, try without the repo and use OCI or direct URL.
- Wait for pods with: kubectl wait --for=condition=ready pod -l app=X --timeout=120s
- If a namespace doesn't exist, create it.
- Never use 'sudo' or install system packages.
- If you need to adapt a command, explain what you changed and why.

Respond in JSON:
{
  "commands": ["cmd1", "cmd2", ...],
  "reasoning": "why these commands",
  "adaptations": "what was changed for Kind cluster, if anything"
}

When diagnosing failures, respond in JSON:
{
  "diagnosis": "what went wrong",
  "fix_commands": ["fixed_cmd1", ...],
  "skip": false
}
Set "skip": true only if the step is genuinely optional (e.g. external DNS, cloud-specific LB).`

async function llmChat(messages) {
  const token = getToken()
  if (!token) throw new Error('No GITHUB_TOKEN set for LLM API')

  const resp = await fetch(LLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`LLM API error ${resp.status}: ${body.slice(0, 200)}`)
  }

  const data = await resp.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty LLM response')

  return JSON.parse(content)
}

// ── Mission execution ──────────────────────────────────────────

async function executeStep(step, stepIndex, missionContext, conversationHistory) {
  const result = {
    step: stepIndex + 1,
    title: step.title,
    status: 'pending',
    commands_run: [],
    attempts: 0,
    output: '',
  }

  // Ask LLM to extract commands from the step
  const extractMsg = {
    role: 'user',
    content: JSON.stringify({
      action: 'extract_commands',
      step_number: stepIndex + 1,
      step_title: step.title,
      step_description: step.description,
      mission_context: missionContext,
    }),
  }

  conversationHistory.push(extractMsg)

  let llmResponse
  try {
    llmResponse = await llmChat([
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
    ])
  } catch (err) {
    result.status = 'error'
    result.output = `LLM extraction failed: ${err.message}`
    return result
  }

  conversationHistory.push({ role: 'assistant', content: JSON.stringify(llmResponse) })

  const commands = llmResponse.commands || []
  if (commands.length === 0) {
    // LLM found no actionable commands — might be a description-only step
    result.status = 'skipped'
    result.output = 'No actionable commands in this step'
    return result
  }

  console.log(`    Step ${stepIndex + 1}: ${step.title}`)
  if (llmResponse.adaptations) {
    console.log(`    Adaptations: ${llmResponse.adaptations}`)
  }

  // Execute commands with retry loop
  for (const cmd of commands) {
    let lastResult = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      result.attempts = attempt + 1
      const cmdToRun = attempt === 0 ? cmd : lastResult?.fixCmd || cmd

      console.log(`      [attempt ${attempt + 1}] ${cmdToRun.slice(0, 120)}`)
      result.commands_run.push(cmdToRun)

      if (DRY_RUN) {
        console.log(`      [dry-run] would execute: ${cmdToRun}`)
        lastResult = { success: true, output: '[dry-run]' }
        break
      }

      const execResult = execCommand(cmdToRun)

      if (execResult.success) {
        console.log(`      ✅ success`)
        lastResult = execResult
        break
      }

      console.log(`      ❌ failed (exit ${execResult.exitCode})`)

      // Ask LLM to diagnose and suggest fix
      const diagMsg = {
        role: 'user',
        content: JSON.stringify({
          action: 'diagnose_failure',
          command: cmdToRun,
          exit_code: execResult.exitCode,
          error_output: execResult.output.slice(-2000),
          attempt: attempt + 1,
          max_attempts: MAX_RETRIES,
        }),
      }

      conversationHistory.push(diagMsg)

      try {
        const diagResponse = await llmChat([
          { role: 'system', content: SYSTEM_PROMPT },
          ...conversationHistory.slice(-10), // keep context window small
        ])

        conversationHistory.push({ role: 'assistant', content: JSON.stringify(diagResponse) })

        if (diagResponse.skip) {
          console.log(`      ⏭️  LLM says skip: ${diagResponse.diagnosis}`)
          lastResult = { success: true, output: `Skipped: ${diagResponse.diagnosis}`, skipped: true }
          break
        }

        if (diagResponse.fix_commands?.length > 0) {
          console.log(`      🔧 LLM fix: ${diagResponse.diagnosis}`)
          // Execute fix commands first, then retry
          for (const fixCmd of diagResponse.fix_commands) {
            console.log(`      [fix] ${fixCmd.slice(0, 120)}`)
            result.commands_run.push(fixCmd)
            if (!DRY_RUN) execCommand(fixCmd)
          }
          lastResult = { ...execResult, fixCmd: diagResponse.fix_commands[diagResponse.fix_commands.length - 1] }
        } else {
          lastResult = execResult
        }
      } catch (diagErr) {
        console.log(`      ⚠️ LLM diagnosis failed: ${diagErr.message}`)
        lastResult = execResult
      }
    }

    if (!lastResult?.success && !lastResult?.skipped) {
      result.status = 'failed'
      result.output = lastResult?.output?.slice(-500) || 'Command failed after retries'
      return result
    }
  }

  result.status = 'passed'
  result.output = 'All commands succeeded'
  return result
}

async function executeMission(missionPath) {
  const startTime = Date.now()
  const raw = readFileSync(missionPath, 'utf-8')
  const mission = JSON.parse(raw)

  const title = mission.mission?.title || mission.name || missionPath
  const steps = mission.mission?.steps || []
  const safeName = (mission.name || 'mission').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40)
  const namespace = `test-${safeName}-${Date.now() % 10000}`

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  🚀 Executing: ${title}`)
  console.log(`  📁 File: ${missionPath}`)
  console.log(`  📦 Namespace: ${namespace}`)
  console.log(`  📋 Steps: ${steps.length}`)
  console.log(`${'═'.repeat(70)}`)

  const report = {
    mission: title,
    file: missionPath,
    namespace,
    steps: [],
    verdict: 'pending',
    duration_ms: 0,
    error: null,
  }

  // Create isolated namespace
  if (!DRY_RUN) {
    const namespaceManifest = runBinary('kubectl', ['create', 'namespace', namespace, '--dry-run=client', '-o', 'yaml'])
    if (namespaceManifest.success) {
      runBinary('kubectl', ['apply', '-f', '-'], { input: namespaceManifest.output })
    }
  }

  const kubectlVersion = runBinary('kubectl', ['version', '--client', '-o', 'json'])
  let kubernetesVersion = 'unknown'
  if (kubectlVersion.success) {
    try {
      kubernetesVersion = JSON.parse(kubectlVersion.output).clientVersion?.gitVersion || 'unknown'
    } catch {
      kubernetesVersion = 'unknown'
    }
  }

  const missionContext = {
    namespace,
    cluster_type: 'kind',
    kubernetes_version: kubernetesVersion,
    available_tools: ['kubectl', 'helm', 'curl'],
    note: 'This is a Kind cluster — no LoadBalancer, no cloud storage. Use NodePort or port-forward.',
  }

  const conversationHistory = []

  let allPassed = true
  let verificationPassed = false

  for (let i = 0; i < steps.length; i++) {
    // Check mission timeout
    if (Date.now() - startTime > MISSION_TIMEOUT_MS) {
      console.log(`  ⏰ Mission timeout (${MISSION_TIMEOUT_MS / 1000}s) — aborting remaining steps`)
      report.steps.push({ step: i + 1, title: steps[i].title, status: 'timeout' })
      break
    }

    const stepResult = await executeStep(steps[i], i, missionContext, conversationHistory)
    report.steps.push(stepResult)

    if (stepResult.status === 'failed') {
      allPassed = false
      console.log(`    ❌ Step ${i + 1} failed — continuing to see what else works`)
    }

    // Track if verification step passed
    const desc = (steps[i].description || '').toLowerCase()
    if (desc.includes('verify') || desc.includes('health') || desc.includes('check') || steps[i].title?.toLowerCase().includes('verify')) {
      if (stepResult.status === 'passed') verificationPassed = true
    }
  }

  // Final verification: ask LLM to confirm overall status
  console.log(`\n  🔍 Final verification...`)
  if (!DRY_RUN) {
    const podsExec = runBinary('kubectl', ['get', 'pods', '-n', namespace, '--no-headers'])
    const svcsExec = runBinary('kubectl', ['get', 'svc', '-n', namespace, '--no-headers'])
    const podsResult = podsExec.success ? podsExec : { ...podsExec, output: 'no pods' }
    const svcsResult = svcsExec.success ? svcsExec : { ...svcsExec, output: 'no services' }

    conversationHistory.push({
      role: 'user',
      content: JSON.stringify({
        action: 'final_verification',
        pods: podsResult.output.slice(0, 1000),
        services: svcsResult.output.slice(0, 500),
        step_results: report.steps.map(s => ({ step: s.step, title: s.title, status: s.status })),
      }),
    })

    try {
      const verifyResponse = await llmChat([
        { role: 'system', content: SYSTEM_PROMPT + '\nFor final_verification, respond: {"installed": true/false, "healthy": true/false, "summary": "..."}' },
        ...conversationHistory.slice(-6),
      ])

      if (verifyResponse.installed && verifyResponse.healthy) {
        console.log(`  ✅ LLM confirms: installed and healthy`)
        verificationPassed = true
      } else {
        console.log(`  ⚠️ LLM says: ${verifyResponse.summary || 'not fully installed'}`)
      }
    } catch {
      console.log(`  ⚠️ Final LLM verification skipped`)
    }
  }

  // Cleanup
  console.log(`  🧹 Cleaning up namespace ${namespace}...`)
  if (!DRY_RUN) {
    runBinary('kubectl', ['delete', 'namespace', namespace, '--wait=false'])
  }

  report.duration_ms = Date.now() - startTime

  if (allPassed && verificationPassed) {
    report.verdict = 'pass'
    console.log(`\n  ✅ VERDICT: PASS (${(report.duration_ms / 1000).toFixed(1)}s)`)
  } else if (allPassed) {
    report.verdict = 'pass_unverified'
    console.log(`\n  ⚠️ VERDICT: PASS (unverified — no verification step confirmed)`)
  } else if (verificationPassed) {
    report.verdict = 'partial'
    console.log(`\n  ⚠️ VERDICT: PARTIAL (some steps failed but verification passed)`)
  } else {
    report.verdict = 'fail'
    console.log(`\n  ❌ VERDICT: FAIL (${(report.duration_ms / 1000).toFixed(1)}s)`)
  }

  return report
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('Usage: node mission-executor.mjs <mission.json> [mission2.json ...]')
    process.exit(1)
  }

  // Verify cluster connectivity
  console.log('🔌 Checking cluster connectivity...')
  const clusterCheck = runBinary('kubectl', ['cluster-info', '--request-timeout=10s'])
  if (!clusterCheck.success) {
    console.error('❌ Cannot connect to cluster:', clusterCheck.output)
    process.exit(1)
  }
  console.log(`✅ Connected: ${(clusterCheck.output || '').split('\n').slice(0, 3)[0]}`)

  // Verify helm is available
  const helmCheck = runBinary('helm', ['version', '--short'])
  console.log(`✅ Helm: ${helmCheck.success ? helmCheck.output : 'not available'}`)

  const results = []
  for (const file of files) {
    try {
      const report = await executeMission(file)
      results.push(report)
    } catch (err) {
      console.error(`\n❌ Fatal error executing ${file}: ${err.message}`)
      results.push({ mission: file, verdict: 'error', error: err.message })
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(70)}`)
  console.log('  📊 Execution Summary')
  console.log(`${'═'.repeat(70)}`)

  const passed = results.filter(r => r.verdict === 'pass').length
  const partial = results.filter(r => r.verdict === 'partial' || r.verdict === 'pass_unverified').length
  const failed = results.filter(r => r.verdict === 'fail' || r.verdict === 'error').length

  for (const r of results) {
    const icon = { pass: '✅', partial: '⚠️', pass_unverified: '⚠️', fail: '❌', error: '💥' }[r.verdict] || '❓'
    const dur = r.duration_ms ? ` (${(r.duration_ms / 1000).toFixed(1)}s)` : ''
    console.log(`  ${icon} ${r.mission}${dur} — ${r.verdict}`)
  }

  console.log(`\n  Total: ${results.length} | ✅ ${passed} | ⚠️ ${partial} | ❌ ${failed}`)

  // Write report
  const reportPath = process.env.REPORT_PATH || 'mission-execution-report.json'
  writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results, summary: { total: results.length, passed, partial, failed } }, null, 2))
  console.log(`\n  📝 Report: ${reportPath}`)

  // Exit code: fail if >50% of missions failed
  if (failed > results.length / 2) {
    console.log('\n  ❌ Majority of missions failed — failing CI')
    process.exit(1)
  }
}

// Only run main() when executed directly (not when imported for testing)
import { fileURLToPath } from 'url'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
}

// Exports for unit testing
export { sanitizeArg, runBinary, validateCommand, ALLOWED_BASE_COMMANDS }