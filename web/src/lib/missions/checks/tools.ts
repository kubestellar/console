/**
 * Tool preflight check (#11077).
 *
 * Extracted from preflightCheck.ts as part of the checks/ split (tracked by #15790).
 * Verifies that required CLI tools are present via the kc-agent /local-cluster-tools
 * endpoint before executing mutating mission steps.
 */
import i18n from '../../i18n'
import type { ToolCheckResult, ToolPreflightResult } from './types'

/** Default tools every mission needs. */
const DEFAULT_REQUIRED_TOOLS = ['kubectl']

const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_SERVICE_UNAVAILABLE = 503
const TOOL_CHECK_TIMEOUT_MS = 10_000
const AGENT_UNREACHABLE_ERROR_PATTERNS = [
  'failed to fetch',
  'fetch failed',
  'networkerror',
  'connection refused',
  'econnrefused',
  'timeout',
  'timed out',
  'aborterror',
  'the operation was aborted',
]

/** Extra tools required by specific mission types. */
const MISSION_TOOL_MAP: Record<string, string[]> = {
  deploy: ['kubectl', 'helm'],
  upgrade: ['kubectl', 'helm'],
  repair: ['kubectl'],
  troubleshoot: ['kubectl'],
  analyze: ['kubectl'],
  maintain: ['kubectl', 'helm'],
  custom: ['kubectl'],
}

/**
 * Resolve the set of tools a mission needs based on its type and optional
 * explicit list from the mission definition.
 */
export function resolveRequiredTools(
  missionType?: string,
  explicitTools?: string[],
): string[] {
  if (explicitTools && explicitTools.length > 0) return explicitTools
  const typeTools = missionType ? MISSION_TOOL_MAP[missionType] || [] : []
  const merged = new Set([...DEFAULT_REQUIRED_TOOLS, ...typeTools])
  return [...merged]
}

function isAgentAuthenticationStatus(status: number): boolean {
  return status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN
}

function isAgentUnreachableStatus(status: number): boolean {
  return status === HTTP_SERVICE_UNAVAILABLE
}

function isAgentUnreachableError(message: string): boolean {
  const normalizedMessage = message.toLowerCase()
  return AGENT_UNREACHABLE_ERROR_PATTERNS.some(pattern => normalizedMessage.includes(pattern))
}

function getToolCheckHttpErrorMessage(status: number): string {
  if (isAgentAuthenticationStatus(status)) {
    return i18n.t('missions.preflight.toolCheck.agentAuthFailed')
  }

  if (isAgentUnreachableStatus(status)) {
    return i18n.t('missions.preflight.toolCheck.agentUnreachable')
  }

  return i18n.t('missions.preflight.toolCheck.requestFailedHttp', { status })
}

function getToolCheckRequestErrorMessage(message: string): string {
  if (isAgentUnreachableError(message)) {
    return i18n.t('missions.preflight.toolCheck.agentUnreachable')
  }

  return i18n.t('missions.preflight.toolCheck.requestFailedGeneric', { message })
}

/**
 * Fetch detected tools from the kc-agent and verify every required tool is
 * present.  Returns a structured result the UI can render as a checklist.
 *
 * @param agentBaseUrl - Base URL for the kc-agent HTTP API (e.g. "http://127.0.0.1:8585")
 * @param requiredTools - Tool names that must be installed
 * @param fetchFn - Optional fetch implementation for authenticated agent requests
 */
export async function runToolPreflightCheck(
  agentBaseUrl: string,
  requiredTools: string[],
  fetchFn: typeof fetch = fetch,
): Promise<ToolPreflightResult> {
  const normalizedAgentBaseUrl = agentBaseUrl.trim()
  if (!normalizedAgentBaseUrl) {
    return {
      ok: true,
      tools: [],
    }
  }

  try {
    const url = new URL('/local-cluster-tools', normalizedAgentBaseUrl)
    const normalizedRequiredTools = [...new Set(requiredTools.map(tool => tool.toLowerCase()))]
    normalizedRequiredTools.forEach(tool => url.searchParams.append('tool', tool))

    const resp = await fetchFn(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(TOOL_CHECK_TIMEOUT_MS),
    })
    if (!resp.ok) {
      return {
        ok: false,
        error: {
          code: 'UNKNOWN_EXECUTION_FAILURE',
          message: getToolCheckHttpErrorMessage(resp.status),
        },
        tools: [],
      }
    }
    const responseData = await resp.json()
    const detected: ToolCheckResult[] = Array.isArray(responseData)
      ? responseData
      : Array.isArray(responseData?.tools)
        ? responseData.tools
        : []

    // Build a lookup of installed tools
    const installedSet = new Set(
      detected
        .filter((t: ToolCheckResult) => t.installed)
        .map((t: ToolCheckResult) => t.name.toLowerCase()),
    )

    const missing = requiredTools.filter(t => !installedSet.has(t.toLowerCase()))

    // Merge required tools into the result so the UI can show a full checklist
    const toolResults: ToolCheckResult[] = requiredTools.map(name => {
      const match = detected.find(
        (d: ToolCheckResult) => d.name.toLowerCase() === name.toLowerCase(),
      )
      return match || { name, installed: installedSet.has(name.toLowerCase()) }
    })

    if (missing.length > 0) {
      return {
        ok: false,
        error: {
          code: 'MISSING_TOOLS',
          message: `Required tools not found: ${missing.join(', ')}. Install them before running this mission.`,
          details: { missingTools: missing },
        },
        tools: toolResults,
      }
    }

    return { ok: true, tools: toolResults }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: {
        code: 'UNKNOWN_EXECUTION_FAILURE',
        message: getToolCheckRequestErrorMessage(message),
      },
      tools: [],
    }
  }
}
