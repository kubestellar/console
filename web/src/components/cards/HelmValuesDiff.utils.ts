export interface HelmValuesDiffProps {
  config?: {
    cluster?: string
    release?: string
    namespace?: string
  }
}

export interface ValueEntry {
  path: string
  value: string
}

// Flatten nested object to dot-notation paths
export function flattenValues(obj: Record<string, unknown>, prefix = ''): ValueEntry[] {
  const entries: ValueEntry[] = []

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      entries.push(...flattenValues(value as Record<string, unknown>, path))
    } else {
      entries.push({
        path,
        value: JSON.stringify(value)
      })
    }
  }

  return entries
}

export type SortByOption = 'name' | 'cluster'

export const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'cluster' as const, label: 'Cluster' },
]
