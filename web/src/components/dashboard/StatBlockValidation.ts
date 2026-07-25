import type { StatBlockColor } from '../../lib/stats/types'

export const DEMO_STAT_VALUE = 42
export const SAVE_MESSAGE_TIMEOUT_MS = 3000
const STAT_BLOCK_ID_PREFIX = 'stat-block'

export function createStatBlockId(): string {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${String(Math.random()).replace('0.', '')}`
  return `${STAT_BLOCK_ID_PREFIX}-${randomId}`
}

export const AVAILABLE_COLORS: StatBlockColor[] = ['purple', 'blue', 'green', 'yellow', 'orange', 'red', 'cyan', 'gray']
export const POPULAR_ICONS = ['Server', 'Database', 'Cpu', 'MemoryStick', 'HardDrive', 'Zap', 'CheckCircle2', 'XCircle', 'AlertTriangle', 'Activity', 'BarChart3', 'Layers', 'Box', 'Shield', 'Lock', 'Globe', 'Cloud', 'GitBranch', 'Terminal', 'Code', 'Wifi', 'WifiOff', 'Clock', 'Users', 'Gauge', 'TrendingUp', 'TrendingDown', 'ArrowUpRight', 'Flame']
export const VALUE_FORMATS = [{value: '', label: 'None'}, {value: 'number', label: 'Number (K/M)'}, {value: 'percent', label: 'Percent'}, {value: 'bytes', label: 'Bytes'}, {value: 'currency', label: 'Currency'}, {value: 'duration', label: 'Duration'}]

export interface BlockEditorItem {
  id: string; label: string; icon: string; color: StatBlockColor; field: string; format: string; tooltip: string
}

export function createEmptyBlock(): BlockEditorItem {
  return {id: createStatBlockId(), label: '', icon: 'Activity', color: 'purple', field: '', format: '', tooltip: ''}
}

interface SmartDefault {icon: string; color: StatBlockColor}
const SMART_DEFAULTS: { pattern: RegExp; defaults: SmartDefault}[] = [
  {pattern: /^(healthy|running|active|up|online|success)$/i, defaults: {icon: 'CheckCircle2', color: 'green'}},
  {pattern: /^(error|failed|down|offline|critical)$/i, defaults: {icon: 'XCircle', color: 'red'}},
  {pattern: /^(warning|pending|degraded|issue|alert)$/i, defaults: {icon: 'AlertTriangle', color: 'yellow'}},
  {pattern: /^(total|count|all|sum|instances?)$/i, defaults: {icon: 'Server', color: 'purple'}},
  {pattern: /^cpu/i, defaults: {icon: 'Cpu', color: 'blue'}},
  {pattern: /^mem/i, defaults: {icon: 'MemoryStick', color: 'cyan'}},
  {pattern: /^(disk|storage)/i, defaults: {icon: 'HardDrive', color: 'orange'}},
  {pattern: /^(network|traffic|bandwidth)/i, defaults: {icon: 'Wifi', color: 'blue'}},
  {pattern: /^(latency|response|time)/i, defaults: {icon: 'Clock', color: 'yellow'}},
  {pattern: /^(user|session)/i, defaults: {icon: 'Users', color: 'blue'}},
  {pattern: /^(security|auth|permission)/i, defaults: {icon: 'Shield', color: 'red'}},
  {pattern: /^(deploy|release|version)/i, defaults: {icon: 'GitBranch', color: 'purple'}},
  {pattern: /^(node|cluster|server)/i, defaults: {icon: 'Server', color: 'blue'}},
  {pattern: /^(pod|container)/i, defaults: {icon: 'Box', color: 'cyan'}},
  {pattern: /^(namespace|scope)/i, defaults: {icon: 'Layers', color: 'blue'}},
]

export function getSmartDefault(label: string): SmartDefault | null {
  const trimmed = label.trim()
  if (!trimmed) return null
  for (const {pattern, defaults} of SMART_DEFAULTS) {
    if (pattern.test(trimmed)) return defaults
  }
  return null
}

export interface StatAssistResult {
  title?: string; blocks?: {label: string; icon: string; color: string; field: string; format?: string; tooltip?: string}[]
}

export function validateStatAssistResult(data: unknown): {valid: true; result: StatAssistResult} | {valid: false; error: string} {
  const obj = data as Record<string, unknown>
  if (!obj.blocks && !obj.title) return {valid: false, error: 'Response must include title or blocks'}
  return {valid: true, result: obj as StatAssistResult}
}

export interface AiStatBlockResult {
  title: string; type: string; blocks: {id: string; label: string; icon: string; color: string; field: string; format: string; tooltip: string}[]
}

const VALID_COLORS = new Set(AVAILABLE_COLORS)

export function validateStatBlockResult(data: unknown): {valid: true; result: AiStatBlockResult} | {valid: false; error: string} {
  const obj = data as Record<string, unknown>
  if (!obj.title || typeof obj.title !== 'string') return {valid: false, error: 'Missing or invalid "title"'}
  if (!obj.blocks || !Array.isArray(obj.blocks) || obj.blocks.length === 0) return {valid: false, error: 'Missing or empty "blocks" array'}
  for (const block of obj.blocks as Record<string, unknown>[]) {
    if (!block.color || !VALID_COLORS.has(block.color as StatBlockColor)) block.color = 'purple'
  }
  return {valid: true, result: obj as unknown as AiStatBlockResult}
}
