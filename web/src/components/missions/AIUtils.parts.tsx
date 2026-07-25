/**
 * AI Summary Generation Utilities
 *
 * Handles WebSocket communication with the local agent to generate
 * resolution summaries from mission conversations.
 */

import type { Mission } from '../../hooks/useMissions'

export interface AISummary {
  title: string
  issueType: string
  resourceKind?: string
  problem: string
  solution: string
  steps: string[]
  yaml?: string
}

/** Timeout for AI summary generation WebSocket request */
const AI_SUMMARY_TIMEOUT_MS = 60_000

/**
 * Maximum number of recent mission messages to include in the AI summary prompt.
 * Older messages add diminishing context for a fix-summary while inflating the
 * payload. Mirrors `MAX_RESENT_MESSAGES` in useMissions.tsx (used for reconnect
 * history) — same rationale: keep the WebSocket frame small enough that the
 * agent's 1 MB read limit is never the failure mode (#9162).
 */
const MAX_SUMMARY_MESSAGES = 20

/**
 * Per-message character cap when building the conversation snippet sent to the
 * AI. Tool outputs (pod logs, YAML manifests, kubectl describe) are routinely
 * tens of kilobytes; concatenating a handful of them blows past the agent's
 * 1 MB WebSocket frame limit, which closes the connection and surfaces the
 * misleading "Could not reach the local agent" error (#9162).
 */
const MAX_MESSAGE_CHARS = 4_000

/**
 * Hard cap on the assembled prompt sent to the agent. The agent rejects
 * prompts longer than `maxPromptChars` (100_000) with a `prompt_too_large`
 * error, and frames larger than `wsMaxMessageBytes` (1 MB) cause the agent
 * to close the connection without a response. We stay well under both so a
 * very long mission never triggers either failure mode (#9162).
 */
const MAX_PROMPT_CHARS = 80_000

/** Marker appended when message content was truncated. */
const TRUNCATION_MARKER = '… [truncated]'

/** Marker appended when the conversation tail was truncated. */
const CONVERSATION_TRUNCATION_MARKER = '\n\n[…earlier conversation omitted…]'

/**
 * Build the conversation snippet sent to the AI for summary generation.
 * Caps both per-message size and the total assembled length so the resulting
 * WebSocket frame stays under the agent's read limit (#9162).
 */
export function buildConversationSnippet(messages: Mission['messages']): string {
  const safeMessages = messages || []
  const recent = safeMessages.slice(-MAX_SUMMARY_MESSAGES)
  const omittedCount = safeMessages.length - recent.length

  const lines = recent.map(m => {
    const content = m.content.length > MAX_MESSAGE_CHARS
      ? m.content.slice(0, MAX_MESSAGE_CHARS) + TRUNCATION_MARKER
      : m.content
    return `${m.role.toUpperCase()}: ${content}`
  })

  let snippet = lines.join('\n\n')
  if (omittedCount > 0) {
    snippet = CONVERSATION_TRUNCATION_MARKER.trimStart() + ` (${omittedCount} earlier messages)\n\n` + snippet
  }

  if (snippet.length > MAX_PROMPT_CHARS) {
    snippet = CONVERSATION_TRUNCATION_MARKER + snippet.slice(snippet.length - MAX_PROMPT_CHARS)
  }
  return snippet
}

/**
 * Detect whether an error message indicates an AI provider rate limit / quota error.
 * Matches HTTP 429 status codes, "rate limit", "quota", and "too many requests" patterns.
 */
export function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('quota') ||
    lower.includes('too many requests') ||
    lower.includes('resource_exhausted') ||
    lower.includes('tokens per min') ||
    lower.includes('requests per min')
  )
}

/** User-friendly rate limit error message */
export const RATE_LIMIT_MESSAGE =
  'AI provider rate limit exceeded. Please wait a minute and try again, or switch to a different AI provider in Settings.'

const JSON_OBJECT_START = '{'
const JSON_OBJECT_END = '}'
const JSON_STRING_DELIMITER = '"'
const JSON_ESCAPE_CHARACTER = '\\'

/**
 * Extract the last complete JSON object from an AI response.
 * This skips braces inside quoted strings and prefers the last parseable object,
 * so prefixed reasoning text or earlier JSON-like snippets do not break parsing.
 */
export function extractLastJsonObject(content: string): string | null {
  const candidates: string[] = []
  let startIndex = -1
  let depth = 0
  let inString = false
  let isEscaped = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (char === JSON_ESCAPE_CHARACTER) {
      if (inString) {
        isEscaped = true
      }
      continue
    }

    if (char === JSON_STRING_DELIMITER) {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === JSON_OBJECT_START) {
      if (depth === 0) {
        startIndex = index
      }
      depth += 1
      continue
    }

    if (char === JSON_OBJECT_END && depth > 0) {
      depth -= 1
      if (depth === 0 && startIndex !== -1) {
        candidates.push(content.slice(startIndex, index + 1))
        startIndex = -1
      }
    }
  }

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index]
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // Ignore invalid JSON-like snippets and keep searching backward.
    }
  }

  return null
}

/**
 * Request AI to generate a resolution summary from the mission conversation
 */
export async function generateAISummary(
  mission: Mission,
  wsUrl: string,
  protocols: string[]
): Promise<AISummary> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, protocols)

    let responseContent = ''
    let didOpen = false
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      fn()
    }
    const timeout = setTimeout(() => {
      settle(() => {
        ws.close()
        reject(new Error('Timeout waiting for AI summary'))
      })
    }, AI_SUMMARY_TIMEOUT_MS)

    ws.onopen = () => {
      didOpen = true
      try {
        const conversation = buildConversationSnippet(mission.messages)

        const prompt = `You are helping save a resolution for future reuse. Analyze this mission conversation and create a structured summary.\n\nMISSION: ${mission.title}\nDESCRIPTION: ${mission.description}\n\nCONVERSATION:\n${conversation}\n\nCreate a JSON summary with these fields:\n- title: Short descriptive title for this resolution (max 60 chars)\n- issueType: Category like "CrashLoopBackOff", "OOMKilled", "ImagePullBackOff", "DeploymentFailed", etc.\n- resourceKind: Kubernetes resource type if applicable (Pod, Deployment, Service, etc.)\n- problem: 1-2 sentence description of what went wrong\n- solution: 1-2 sentence description of how it was fixed\n- steps: Array of specific actionable steps that fixed the issue (commands, config changes, etc.)\n- yaml: Any YAML manifests or config snippets that were part of the fix (optional)\n\nReturn ONLY valid JSON, no markdown code blocks or explanation.`

        ws.send(JSON.stringify({
          type: 'chat',
          id: `summary-${crypto.randomUUID()}`,
          payload: {
            prompt: prompt,
            sessionId: `resolution-${mission.id}`,
            agent: mission.agent || undefined }
        }))
      } catch (err: unknown) {
        settle(() => {
          ws.close()
          reject(err instanceof Error ? err : new Error('Failed to send AI summary request'))
        })
      }
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        if (message.type === 'stream') {
          responseContent += message.payload?.content || ''
        } else if (message.type === 'result') {
          const content = message.payload?.content || message.payload?.output || responseContent
          settle(() => {
            ws.close()

            if (isRateLimitError(content)) {
              reject(new Error(RATE_LIMIT_MESSAGE))
              return
            }

            try {
              const jsonContent = extractLastJsonObject(content)
              if (jsonContent) {
                const parsed = JSON.parse(jsonContent) as Partial<AISummary>
                resolve({
                  title: parsed.title || mission.title,
                  issueType: parsed.issueType || 'Unknown',
                  resourceKind: parsed.resourceKind,
                  problem: parsed.problem || '',
                  solution: parsed.solution || '',
                  steps: Array.isArray(parsed.steps) ? parsed.steps : [],
                  yaml: parsed.yaml })
              } else {
                reject(new Error('Could not parse AI response as JSON'))
              }
            } catch {
              reject(new Error('Failed to parse AI summary response'))
            }
          })
        } else if (message.type === 'error') {
          const errorMsg = message.payload?.message || 'AI request failed'
          const errorCode = message.payload?.code || ''
          settle(() => {
            ws.close()
            if (isRateLimitError(errorMsg) || isRateLimitError(errorCode)) {
              reject(new Error(RATE_LIMIT_MESSAGE))
            } else {
              reject(new Error(errorMsg))
            }
          })
        }
      } catch {
        // Ignore parse errors for non-JSON messages
      }
    }

    ws.onerror = () => {
      settle(() => {
        if (didOpen) {
          reject(new Error('Lost connection to local agent while generating summary. The mission conversation may be too large; try Regenerate or save with a manual summary.'))
        } else {
          reject(new Error('Could not reach the local agent — make sure kc-agent is running'))
        }
      })
    }

    ws.onclose = (event) => {
      settle(() => {
        if (didOpen) {
          const isTooBig = event.code === 1009
          reject(new Error(
            isTooBig
              ? 'Mission conversation is too large for the agent to summarize. Try Regenerate after a shorter run or save with a manual summary.'
              : 'Connection to local agent closed before the summary completed. Try Regenerate or save with a manual summary.'
          ))
        } else {
          reject(new Error('Could not reach the local agent — make sure kc-agent is running'))
        }
      })
    }
  })
}
