/**
 * SBOM Dashboard severity/status styling maps.
 */
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

export const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
  none: 'text-green-400',
}

export const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-500/20 border-red-500/30',
  high: 'bg-orange-500/20 border-orange-500/30',
  medium: 'bg-yellow-500/20 border-yellow-500/30',
  low: 'bg-blue-500/20 border-blue-500/30',
  none: 'bg-green-500/20 border-green-500/30',
}

export const STATUS_ICON: Record<string, React.ReactNode> = {
  open: <XCircle className="w-4 h-4 text-red-400" />,
  patched: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  ignored: <AlertTriangle className="w-4 h-4 text-gray-400" />,
}
