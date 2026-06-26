export type SortByOption = 'name' | 'violations' | 'policies'

export const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'violations' as const, label: 'Violations' },
  { value: 'policies' as const, label: 'Policies' },
]

export interface OPAPoliciesProps {
  config?: {
    cluster?: string
  }
}
