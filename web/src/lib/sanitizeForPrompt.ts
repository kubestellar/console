const DEFAULT_PROMPT_INPUT_MAX_LENGTH = 500
const ESCAPED_LT_PATTERN = /\\u0*03[cC]|\\x3[cC]/g
const ESCAPED_GT_PATTERN = /\\u0*03[eE]|\\x3[eE]/g
const PROMPT_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Normalize attacker-influenceable text before interpolating it into prompts.
 * Removes literal or unicode-escaped angle brackets, encodes a few HTML
 * metacharacters, trims whitespace, and caps length to prevent abuse.
 */
export function sanitizeForPrompt(input: string, maxLength = DEFAULT_PROMPT_INPUT_MAX_LENGTH): string {
  return input
    .replace(ESCAPED_LT_PATTERN, '<')
    .replace(ESCAPED_GT_PATTERN, '>')
    .replace(/[<>]/g, '')
    .replace(/[&"']/g, character => PROMPT_ENTITY_MAP[character] || character)
    .trim()
    .slice(0, maxLength)
}
