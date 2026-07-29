// Extract code blocks from markdown-style description
export function extractCodeBlocks(text: string): { before: string; code: string; after: string }[] {
  const parts: { before: string; code: string; after: string }[] = []
  const regex = /```[\w]*\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim()
    const code = match[1].trim()
    lastIndex = match.index + match[0].length
    parts.push({ before, code, after: '' })
  }

  // Remaining text after last code block
  const remaining = text.slice(lastIndex).trim()
  if (parts.length === 0) {
    return [{ before: text, code: '', after: '' }]
  }
  if (remaining) {
    parts[parts.length - 1].after = remaining
  }

  return parts
}
