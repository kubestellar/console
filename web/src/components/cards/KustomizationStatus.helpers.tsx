import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Clock } from 'lucide-react'
import { safeGetJSON } from '../../lib/utils/localStorage'

export interface Kustomization {
  name: string
  namespace: string
  path: string
  sourceRef: string
  status: 'Ready' | 'NotReady' | 'Progressing' | 'Suspended'
  lastApplied: string
  revision: string
}

// LocalStorage cache keys
export const KUSTOMIZATION_CACHE_KEY = 'kc-kustomization-status-cache'

// Load from localStorage
export function loadKustomizationsFromStorage(): { data: Kustomization[], timestamp: number } {
  if (typeof window === 'undefined') return { data: [], timestamp: 0 }
  const parsed = safeGetJSON<{ data?: Kustomization[]; timestamp?: number }>(KUSTOMIZATION_CACHE_KEY)
  if (parsed && Array.isArray(parsed.data)) {
    return { data: parsed.data, timestamp: parsed.timestamp || 0 }
  }
  return { data: [], timestamp: 0 }
}

export type SortByOption = 'status' | 'name' | 'namespace' | 'lastApplied'

export const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'lastApplied' as const, label: 'Last Applied' },
]

// Demo kustomization data
export function getDemoKustomizations(): Kustomization[] {
  return [
    { name: 'infrastructure', namespace: 'flux-system', path: './infrastructure', sourceRef: 'flux-system/flux-repo', status: 'Ready', lastApplied: '2024-01-11T10:30:00Z', revision: 'main@sha1:abc123' },
    { name: 'apps', namespace: 'flux-system', path: './apps', sourceRef: 'flux-system/flux-repo', status: 'Ready', lastApplied: '2024-01-11T10:31:00Z', revision: 'main@sha1:abc123' },
    { name: 'monitoring', namespace: 'flux-system', path: './monitoring', sourceRef: 'flux-system/flux-repo', status: 'Progressing', lastApplied: '2024-01-11T10:32:00Z', revision: 'main@sha1:def456' },
    { name: 'tenants-dev', namespace: 'flux-system', path: './tenants/dev', sourceRef: 'flux-system/tenants-repo', status: 'Ready', lastApplied: '2024-01-10T15:00:00Z', revision: 'main@sha1:789ghi' },
    { name: 'tenants-prod', namespace: 'flux-system', path: './tenants/prod', sourceRef: 'flux-system/tenants-repo', status: 'NotReady', lastApplied: '2024-01-10T15:00:00Z', revision: 'main@sha1:789ghi' },
    { name: 'secrets', namespace: 'flux-system', path: './secrets', sourceRef: 'flux-system/flux-repo', status: 'Suspended', lastApplied: '2024-01-05T09:00:00Z', revision: 'main@sha1:jkl012' },
  ]
}

// Pure helper functions at module level (no dependency on component state)

export function getStatusIcon(status: Kustomization['status']) {
  switch (status) {
    case 'Ready': return CheckCircle
    case 'NotReady': return XCircle
    case 'Progressing': return RefreshCw
    case 'Suspended': return Clock
    default: return AlertTriangle
  }
}

export function getStatusColor(status: Kustomization['status']) {
  switch (status) {
    case 'Ready': return 'green'
    case 'NotReady': return 'red'
    case 'Progressing': return 'blue'
    case 'Suspended': return 'gray'
    default: return 'orange'
  }
}
