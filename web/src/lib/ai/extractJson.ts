/**
 * Extract JSON from AI markdown responses.
 *
 * AI models typically return JSON inside ```json fences with
 * surrounding explanatory text. This utility extracts and parses
 * the JSON using multiple strategies.
 */

export interface ExtractResult<T> {
  data: T | null
  error: string | null
}

export function extractJsonFromMarkdown<T = unknown>(text: string): ExtractResult<T> {
  // Strategy 1: Look for ```json ... ``` fenced blocks
  const jsonBlockRegex = /```json\s*\n?([\s\S]*?)```/g
  const matches: string[] = []
  let match: RegExpExecArray | null

  while ((match = jsonBlockRegex.exec(text)) !== null) {
    matches.push(match[1].trim())
  }

  // Try parsing each match (last match is often the final/correct one)
  for (let i = matches.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(matches[i]) as T
      return { data: parsed, error: null }
    } catch {
      // continue to next match
    }
  }

  // Strategy 2: Find raw JSON object/array in text via brace depth matching
  const firstBrace = text.indexOf('{')
  const firstBracket = text.indexOf('[')
  const startIdx = Math.min(
    firstBrace >= 0 ? firstBrace : Infinity,
    firstBracket >= 0 ? firstBracket : Infinity,
  )

  if (startIdx < Infinity) {
    const openChar = text[startIdx]
    const closeChar = openChar === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i]

      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue

      if (ch === openChar) depth++
      if (ch === closeChar) depth--

      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.substring(startIdx, i + 1)) as T
          return { data: parsed, error: null }
        } catch {
          break
        }
      }
    }
  }

  // Strategy 3: Try parsing the entire text as JSON
  try {
    const parsed = JSON.parse(text.trim()) as T
    return { data: parsed, error: null }
  } catch {
    return { data: null, error: 'Could not extract valid JSON from AI response.' }
  }
}
