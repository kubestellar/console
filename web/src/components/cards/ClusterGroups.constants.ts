import type { ClusterFilter } from '../../hooks/useClusterGroups'

export const GROUP_COLORS = [
  { name: 'blue', bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400', dot: 'bg-blue-500' },
  { name: 'green', bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400', dot: 'bg-green-500' },
  { name: 'purple', bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400', dot: 'bg-purple-500' },
  { name: 'orange', bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', dot: 'bg-orange-500' },
  { name: 'cyan', bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400', dot: 'bg-cyan-500' },
  { name: 'red', bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-400', dot: 'bg-red-500' },
]

export const FILTER_FIELDS = [
  { field: 'healthy', label: 'Healthy', type: 'bool' as const },
  { field: 'reachable', label: 'Reachable', type: 'bool' as const },
  { field: 'cpuCores', label: 'CPU Cores', type: 'number' as const },
  { field: 'memoryGB', label: 'Memory (GB)', type: 'number' as const },
  { field: 'gpuCount', label: 'GPU Count', type: 'number' as const },
  { field: 'gpuType', label: 'GPU Type', type: 'text' as const },
  { field: 'nodeCount', label: 'Nodes', type: 'number' as const },
  { field: 'podCount', label: 'Pods', type: 'number' as const },
]

export const TEXT_OPERATORS = [
  { value: 'eq', label: 'equals' },
  { value: 'contains', label: 'contains' },
  { value: 'neq', label: 'excludes' },
]

export const MAX_INLINE_BADGES = 4

export const NUM_OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
]

export function getGroupColor(colorName?: string) {
  return GROUP_COLORS.find(c => c.name === colorName) || GROUP_COLORS[0]
}

export function formatFilter(f: ClusterFilter): string {
  const fieldDef = FILTER_FIELDS.find(ff => ff.field === f.field)
  const field = fieldDef?.label ?? f.field
  if (fieldDef?.type === 'text') {
    const op = TEXT_OPERATORS.find(o => o.value === f.operator)?.label ?? f.operator
    return `${field} ${op} "${f.value}"`
  }
  const op = NUM_OPERATORS.find(o => o.value === f.operator)?.label ?? f.operator
  return `${field} ${op} ${f.value}`
}
