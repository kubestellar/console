import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'

export type TabType = 'overview' | 'resources' | 'conditions' | 'ai'

export interface AppliedResource {
  kind: string
  name: string
  namespace?: string
  apiVersion?: string
}

export interface InventoryEntryRaw {
  id?: string
  v?: string
}

export interface KustomizationStatusStyle {
  bg: string
  text: string
  border: string
  icon: typeof CheckCircle
}

/** Maps a Kustomization/condition status string to its display style. */
export function getStatusStyle(status: string): KustomizationStatusStyle {
  const lower = status?.toLowerCase() || ''
  if (lower === 'ready' || lower === 'true' || lower === 'applied' || lower === 'succeeded') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'reconciling' || lower === 'progressing') {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: RefreshCw }
  }
  if (lower === 'failed' || lower === 'false' || lower === 'error') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  if (lower === 'stalled' || lower === 'suspended') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }
  }
  return { bg: 'bg-secondary', text: 'text-muted-foreground', border: 'border-border', icon: AlertTriangle }
}
