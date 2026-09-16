/**
 * LaunchSequence.constants — JSX constant lookups used by the phase
 * checklist rendering in LaunchSequence.tsx / LaunchSequencePhaseCard.tsx.
 */

import { Check, Loader2, SkipForward, X } from 'lucide-react'

export const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />,
  running: <Loader2 className="w-4 h-4 animate-spin text-amber-400" />,
  completed: <Check className="w-4 h-4 text-green-400" />,
  failed: <X className="w-4 h-4 text-red-400" />,
  skipped: <SkipForward className="w-4 h-4 text-muted-foreground" />,
}
