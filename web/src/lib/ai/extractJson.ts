/**
 * Extract JSON from AI markdown responses.
 *
 * AI models typically return JSON inside ```json fences with
 * surrounding explanatory text. This utility extracts and parses
 * the JSON using multiple strategies, handling common quirks like
 * trailing commas, markdown fences, and mixed prose.
 */

export interface ExtractResult<T> {
  data: T | null
  error: string | null
}

/**
 * Strip trailing commas before closing braces/brackets — a common
 * AI model quirk that produces invalid JSON.
 */
function stripTrailingCommas(json: string): string {
  return json.replace(/,\s*([\]}])/g, '$1')
}

/**
 * Attempt JSON.parse with fallback to trailing-comma cleanup.
 */
function tryParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    // noop — try cleanup
  }
  try {
    return JSON.parse(stripTrailingCommas(raw)) as T
  } catch {
    return null
  }
}

/**
 * Use brace/bracket depth tracking to extract the outermost JSON
 * value starting at `startIdx`. Returns the substring or null.
 */
function extractByDepth(text: string, startIdx: number): string | null {
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
    if (ch === '\\' && inString) {
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
      return text.substring(startIdx, i + 1)
    }
  }
  return null
}

export function extractJsonFromMarkdown<T = unknown>(text: string): ExtractResult<T> {
  if (!text || !text.trim()) {
    return { data: null, error: 'Could not extract valid JSON from AI response.' }
  }

  // Strategy 1: Try parsing the entire text as-is (fast path)
  const directParse = tryParse<T>(text.trim())
  if (directParse !== null) {
    return { data: directParse, error: null }
  }

  // Strategy 2: Extract from ```json ... ``` or ``` ... ``` fenced blocks
  const fencedBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)```/g
  const fencedMatches: string[] = []
  let match: RegExpExecArray | null

  while ((match = fencedBlockRegex.exec(text)) !== null) {
    const content = match[1].trim()
    if (content) fencedMatches.push(content)
  }

  // Try parsing each fenced match (last match is often the final/correct one)
  for (let i = fencedMatches.length - 1; i >= 0; i--) {
    const parsed = tryParse<T>(fencedMatches[i])
    if (parsed !== null) {
      return { data: parsed, error: null }
    }
  }

  // Strategy 3: Find ALL JSON objects/arrays in the text via brace depth
  // matching. Collect all parseable candidates and prefer the LAST valid
  // object/array — AI models often provide a corrected or updated JSON
  // block later in the response (#7191). Additionally, skip bare arrays
  // that look like prose citations (e.g. `[1]`, `[2, 3]`) to avoid
  // treating numbered references as JSON data (#7189).
  let lastObject: T | null = null
  let lastArray: T | null = null

  for (let pos = 0; pos < text.length; pos++) {
    const ch = text[pos]
    if (ch !== '{' && ch !== '[') continue

    const candidate = extractByDepth(text, pos)
    if (candidate) {
      const parsed = tryParse<T>(candidate)
      if (parsed !== null) {
        if (ch === '{') {
          lastObject = parsed
        } else {
          // #7189 — Skip bare arrays of only primitive numbers/strings that
          // are likely prose citations like [1], [2, 3], or [a]. Only accept
          // arrays that contain objects or are reasonably complex.
          const arr = parsed as unknown[]
          const isBarePrimitive = Array.isArray(arr) && arr.length > 0 &&
            arr.every(item => typeof item === 'number' || typeof item === 'string')
          if (!isBarePrimitive) {
            lastArray = parsed
          }
        }
      }
      // Skip past this candidate and keep searching
      pos += candidate.length - 1
    }
  }

  // Prefer objects over arrays (objects are more likely to be structured data)
  if (lastObject !== null) return { data: lastObject, error: null }
  if (lastArray !== null) return { data: lastArray, error: null }

  return { data: null, error: 'Could not extract valid JSON from AI response.' }
}
