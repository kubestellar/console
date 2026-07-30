import {
  CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react'

/** Visual styles for a drift severity level. */
export const getDriftSeverityStyle = (severity: string) => {
  const lower = severity?.toLowerCase() || ''
  if (lower === 'none' || lower === 'synced') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'low' || lower === 'minor') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }
  }
  if (lower === 'medium' || lower === 'moderate') {
    return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', icon: AlertTriangle }
  }
  if (lower === 'high' || lower === 'critical' || lower === 'drifted') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  return { bg: 'bg-secondary', text: 'text-muted-foreground', border: 'border-border', icon: AlertTriangle }
}

/** Visual styles for a drift change type. */
export const getChangeTypeStyle = (changeType: string) => {
  const lower = changeType?.toLowerCase() || ''
  if (lower === 'added' || lower === 'create') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Added' }
  }
  if (lower === 'modified' || lower === 'update' || lower === 'changed') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Modified' }
  }
  if (lower === 'deleted' || lower === 'remove') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Deleted' }
  }
  return { bg: 'bg-secondary', text: 'text-muted-foreground', label: changeType }
}
