import { logger } from '@/lib/logger'
import {
  INITIAL_BALANCED_BLOCK_SCAN_INDEX,
  MAX_BALANCED_BLOCKS_INPUT,
  MAX_FENCE_BODY,
} from './useMissionControl.constants'
import type {
  MissionConversationMessage,
  BalancedBlockScanCursor,
} from './useMissionControl.types'

const oversizedWarnSet = new Set<string>()

export function getAssistantMessagesSinceLastUser<T extends MissionConversationMessage>(
  messages: T[] | null | undefined,
): T[] {
  const safeMessages = Array.isArray(messages) ? messages : []
  const lastUserIndex = safeMessages.map((message) => message.role).lastIndexOf('user')
  return safeMessages
    .slice(lastUserIndex + 1)
    .filter((message): message is T => message.role === 'assistant')
}

export function getAssistantContentSinceLastUser(
  messages: MissionConversationMessage[] | null | undefined,
): string {
  return getAssistantMessagesSinceLastUser(messages)
    .map((message) => message.content)
    .join('')
}

export function createBalancedBlockScanCursor(): BalancedBlockScanCursor {
  return {
    lastScanIndex: INITIAL_BALANCED_BLOCK_SCAN_INDEX,
    inString: false,
    escape: false,
    frames: [],
    completedBlocks: [],
  }
}

export function resetBalancedBlockScanCursor(cursor: BalancedBlockScanCursor): void {
  cursor.lastScanIndex = INITIAL_BALANCED_BLOCK_SCAN_INDEX
  cursor.inString = false
  cursor.escape = false
  cursor.frames = []
  cursor.completedBlocks = []
}

export function resetOversizedWarnings(): void {
  oversizedWarnSet.clear()
}

function extractBalancedBlocks(
  text: string,
  warnKey?: string,
  cursor?: BalancedBlockScanCursor,
): string[] {
  const activeCursor = cursor ?? createBalancedBlockScanCursor()

  if (activeCursor.lastScanIndex > text.length) {
    resetBalancedBlockScanCursor(activeCursor)
  }

  if (text.length > MAX_BALANCED_BLOCKS_INPUT) {
    const key = warnKey ?? '__legacy__'
    if (!oversizedWarnSet.has(key)) {
      oversizedWarnSet.add(key)
      logger.warn(
        `[useMissionControl] extractBalancedBlocks: input too large ` +
          `(${text.length} chars > ${MAX_BALANCED_BLOCKS_INPUT}), skipping scan ` +
          `to avoid main-thread block (#6723). Further oversized inputs for ` +
          `key "${key}" will be suppressed until reset.`,
      )
    }
    return activeCursor.completedBlocks
  }

  for (let index = activeCursor.lastScanIndex; index < text.length; index += 1) {
    const ch = text[index]

    if (activeCursor.escape) {
      activeCursor.escape = false
      continue
    }

    if (ch === '\\' && activeCursor.inString) {
      activeCursor.escape = true
      continue
    }

    if (ch === '"') {
      activeCursor.inString = !activeCursor.inString
      continue
    }

    if (activeCursor.inString) continue

    if (ch === '{' || ch === '[') {
      activeCursor.frames.push({
        startIndex: index,
        opener: ch,
        expectedCloser: ch === '{' ? '}' : ']',
      })
      continue
    }

    const topFrame = activeCursor.frames[activeCursor.frames.length - 1]
    if (!topFrame || ch !== topFrame.expectedCloser) continue

    const completedFrame = activeCursor.frames.pop()
    if (!completedFrame || activeCursor.frames.length > 0) continue

    activeCursor.completedBlocks.push(text.substring(completedFrame.startIndex, index + 1))
  }

  activeCursor.lastScanIndex = text.length
  return activeCursor.completedBlocks
}

export function extractJSON<T>(
  text: string,
  requiredKey?: string,
  warnKey?: string,
  balancedBlockCursor?: BalancedBlockScanCursor,
): T | null {
  const fencedRe = new RegExp(
    String.raw`\`\`\`json\s*\n?([\s\S]{0,${MAX_FENCE_BODY}}?)\`\`\``,
    'g',
  )
  const candidates: T[] = []
  let match: RegExpExecArray | null
  while ((match = fencedRe.exec(text)) !== null) {
    try {
      const body = match[1].replace(/^\uFEFF/, '').trim()
      const parsed = JSON.parse(body) as T
      if (requiredKey && typeof parsed === 'object' && parsed !== null && requiredKey in parsed) {
        return parsed
      }
      candidates.push(parsed)
    } catch {
      // skip unparseable blocks
    }
  }
  if (candidates.length > 0) return candidates[0]

  const blocks = extractBalancedBlocks(text, warnKey, balancedBlockCursor)
  let best: T | null = null
  let bestLen = 0
  for (const block of blocks) {
    try {
      const body = block.replace(/^\uFEFF/, '').trim()
      const parsed = JSON.parse(body) as T
      if (requiredKey && typeof parsed === 'object' && parsed !== null && requiredKey in parsed) {
        return parsed
      }
      if (block.length > bestLen) {
        best = parsed
        bestLen = block.length
      }
    } catch {
      // skip unparseable blocks
    }
  }
  return best
}
