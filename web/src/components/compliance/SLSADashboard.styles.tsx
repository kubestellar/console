/**
 * SLSA Dashboard level/status styling maps.
 */
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

export const LEVEL_COLORS: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-blue-400',
  3: 'text-green-400',
  4: 'text-emerald-400',
}

export const LEVEL_BG: Record<number, string> = {
  1: 'bg-yellow-500/20 border-yellow-500/30',
  2: 'bg-blue-500/20 border-blue-500/30',
  3: 'bg-green-500/20 border-green-500/30',
  4: 'bg-emerald-500/20 border-emerald-500/30',
}

export const LEVEL_BAR_COLORS: Record<number, string> = {
  1: 'bg-yellow-500',
  2: 'bg-blue-500',
  3: 'bg-green-500',
  4: 'bg-emerald-500',
}

export const STATUS_COLORS: Record<string, string> = {
  pass: 'text-green-400',
  fail: 'text-red-400',
  pending: 'text-yellow-400',
}

export const STATUS_BG: Record<string, string> = {
  pass: 'bg-green-500/20 border-green-500/30',
  fail: 'bg-red-500/20 border-red-500/30',
  pending: 'bg-yellow-500/20 border-yellow-500/30',
}

export const STATUS_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  fail: <XCircle className="w-4 h-4 text-red-400" />,
  pending: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
}
