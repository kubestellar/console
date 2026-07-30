import {
  CheckCircle, XCircle, AlertTriangle, RefreshCw,
} from 'lucide-react'

/** Visual styles for an operator install phase. */
export const getPhaseStyle = (phase: string) => {
  const lower = phase?.toLowerCase() || ''
  if (lower === 'succeeded' || lower === 'installed') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'installing' || lower === 'pending' || lower === 'installready') {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: RefreshCw }
  }
  if (lower === 'failed' || lower === 'unknown') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  if (lower === 'upgrading' || lower === 'replacing') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: RefreshCw }
  }
  return { bg: 'bg-secondary', text: 'text-muted-foreground', border: 'border-border', icon: AlertTriangle }
}
