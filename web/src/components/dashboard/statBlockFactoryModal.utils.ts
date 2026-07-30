import {
  Server, Database, Cpu, MemoryStick, HardDrive, Zap,
  CheckCircle2, XCircle, AlertTriangle, Activity, BarChart3,
  Layers, Box, Shield, Lock, Globe, Cloud, GitBranch,
  Terminal, Code, Wifi, WifiOff, Clock, Users,
  Gauge, TrendingUp, TrendingDown, ArrowUpRight, Flame,
  HelpCircle,
  type LucideIcon } from 'lucide-react'
import type { StatBlockColor, StatBlockValueSource, StatBlockDefinition, StatsDefinition } from '../../lib/stats/types'
import type { BlockEditorItem, StatAssistResult, AiStatBlockResult } from './statBlockFactoryModal.types'

// Demo/preview constants
export const DEMO_STAT_VALUE = 42 // Placeholder value shown in stat block previews
export const SAVE_MESSAGE_TIMEOUT_MS = 3000 // Duration to display save/error messages before auto-clearing
export const STAT_BLOCK_ID_PREFIX = 'stat-block'

export const AVAILABLE_COLORS: StatBlockColor[] = [
  'purple', 'blue', 'green', 'yellow', 'orange', 'red', 'cyan', 'gray',
]

export const POPULAR_ICONS = [
  'Server', 'Database', 'Cpu', 'MemoryStick', 'HardDrive', 'Zap',
  'CheckCircle2', 'XCircle', 'AlertTriangle', 'Activity', 'BarChart3',
  'Layers', 'Box', 'Shield', 'Lock', 'Globe', 'Cloud', 'GitBranch',
  'Terminal', 'Code', 'Wifi', 'WifiOff', 'Clock', 'Users',
  'Gauge', 'TrendingUp', 'TrendingDown', 'ArrowUpRight', 'Flame',
]

export const VALUE_FORMATS = [
  { value: '', label: 'None' },
  { value: 'number', label: 'Number (K/M)' },
  { value: 'percent', label: 'Percent' },
  { value: 'bytes', label: 'Bytes' },
  { value: 'currency', label: 'Currency' },
  { value: 'duration', label: 'Duration' },
]

export const ICON_MAP: Record<string, LucideIcon> = {
  Server, Database, Cpu, MemoryStick, HardDrive, Zap,
  CheckCircle2, XCircle, AlertTriangle, Activity, BarChart3,
  Layers, Box, Shield, Lock, Globe, Cloud, GitBranch,
  Terminal, Code, Wifi, WifiOff, Clock, Users,
  Gauge, TrendingUp, TrendingDown, ArrowUpRight, Flame,
  HelpCircle }

export const VALID_COLORS = new Set(AVAILABLE_COLORS)

// ============================================================================
// Smart Defaults — suggest icon and color based on label
// ============================================================================

interface SmartDefault {
  icon: string
  color: StatBlockColor
}

const SMART_DEFAULTS: { pattern: RegExp; defaults: SmartDefault }[] = [
  { pattern: /^(healthy|running|active|up|online|success)$/i, defaults: { icon: 'CheckCircle2', color: 'green' } },
  { pattern: /^(error|failed|down|offline|critical)$/i, defaults: { icon: 'XCircle', color: 'red' } },
  { pattern: /^(warning|pending|degraded|issue|alert)$/i, defaults: { icon: 'AlertTriangle', color: 'yellow' } },
  { pattern: /^(total|count|all|sum|instances?)$/i, defaults: { icon: 'Server', color: 'purple' } },
  { pattern: /^cpu/i, defaults: { icon: 'Cpu', color: 'blue' } },
  { pattern: /^mem/i, defaults: { icon: 'MemoryStick', color: 'cyan' } },
  { pattern: /^(disk|storage)/i, defaults: { icon: 'HardDrive', color: 'orange' } },
  { pattern: /^(network|traffic|bandwidth)/i, defaults: { icon: 'Wifi', color: 'blue' } },
  { pattern: /^(latency|response|time)/i, defaults: { icon: 'Clock', color: 'yellow' } },
  { pattern: /^(user|session)/i, defaults: { icon: 'Users', color: 'blue' } },
  { pattern: /^(security|auth|permission)/i, defaults: { icon: 'Shield', color: 'red' } },
  { pattern: /^(deploy|release|version)/i, defaults: { icon: 'GitBranch', color: 'purple' } },
  { pattern: /^(node|cluster|server)/i, defaults: { icon: 'Server', color: 'blue' } },
  { pattern: /^(pod|container)/i, defaults: { icon: 'Box', color: 'cyan' } },
  { pattern: /^(namespace|scope)/i, defaults: { icon: 'Layers', color: 'blue' } },
]

export function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? HelpCircle
}

export function getSmartDefault(label: string): SmartDefault | null {
  const trimmed = label.trim()
  if (!trimmed) return null
  for (const { pattern, defaults } of SMART_DEFAULTS) {
    if (pattern.test(trimmed)) return defaults
  }
  return null
}

export function createStatBlockId(): string {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${String(Math.random()).replace('0.', '')}`

  return `${STAT_BLOCK_ID_PREFIX}-${randomId}`
}

export function createEmptyBlock(): BlockEditorItem {
  return {
    id: createStatBlockId(),
    label: '',
    icon: 'Activity',
    color: 'purple',
    field: '',
    format: '',
    tooltip: '' }
}

export function validateStatAssistResult(data: unknown): { valid: true; result: StatAssistResult } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.blocks && !obj.title) return { valid: false, error: 'Response must include title or blocks' }
  return { valid: true, result: obj as StatAssistResult }
}

export function validateStatBlockResult(
  data: unknown,
): { valid: true; result: AiStatBlockResult } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.title || typeof obj.title !== 'string') {
    return { valid: false, error: 'Missing or invalid "title"' }
  }
  if (!obj.blocks || !Array.isArray(obj.blocks) || obj.blocks.length === 0) {
    return { valid: false, error: 'Missing or empty "blocks" array' }
  }

  // Auto-correct invalid colors to 'purple'
  for (const block of obj.blocks as Record<string, unknown>[]) {
    if (!block.color || !VALID_COLORS.has(block.color as StatBlockColor)) {
      block.color = 'purple'
    }
  }

  return { valid: true, result: obj as unknown as AiStatBlockResult }
}

export function buildStatBlockDefinitions(
  blocks: BlockEditorItem[],
): StatBlockDefinition[] {
  return blocks
    .filter(b => b.label.trim())
    .map((b, idx) => ({
      id: b.id || `block_${idx}`,
      label: b.label,
      icon: b.icon,
      color: b.color,
      visible: true,
      order: idx,
      valueSource: b.field ? {
        field: b.field,
        format: (b.format || undefined) as StatBlockValueSource['format'] } : undefined,
      tooltip: b.tooltip || undefined }))
}

export function buildStatsDefinition(
  type: string,
  title: string,
  blocks: BlockEditorItem[],
  gridCols: number,
): StatsDefinition {
  return {
    type,
    title: title.trim() || 'Custom Stats',
    blocks: buildStatBlockDefinitions(blocks),
    defaultCollapsed: false,
    grid: gridCols > 0 ? { columns: gridCols } : undefined }
}
