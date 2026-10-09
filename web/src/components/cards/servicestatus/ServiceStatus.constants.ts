export type SortByOption = 'type' | 'name' | 'namespace' | 'ports'

export const SORT_OPTIONS = [
  { value: 'type' as const, label: 'Type' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'ports' as const, label: 'Ports' },
]
