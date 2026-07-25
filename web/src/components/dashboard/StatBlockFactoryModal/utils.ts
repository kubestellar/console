import { Activity, Server, Database, Cpu, MemoryStick, HardDrive, Zap, CheckCircle2, XCircle, AlertTriangle, BarChart3, Layers, Box, Shield, Lock, Globe, Cloud, GitBranch, Terminal, Code, Wifi, WifiOff, Clock, Users, Gauge, TrendingUp, TrendingDown, ArrowUpRight, Flame, HelpCircle, type LucideIcon } from 'lucide-react'
import type { StatBlockColor } from '../../../lib/stats/types'
import type { SmartDefault, BlockEditorItem } from './types'

export const DEMO_STAT_VALUE = 42
export const SAVE_MESSAGE_TIMEOUT_MS = 3000
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

export const SMART_DEFAULTS: { pattern: RegExp; defaults: SmartDefault }[] = [
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
    tooltip: '',
  }
}

export function getIcon(name: string) {
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
