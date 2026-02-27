import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'

const DISMISSED_KEY = 'kc-mission-cta-dismissed'

/**
 * Compact banner that nudges users to try AI Missions.
 * Only rendered if the user has no missions yet and hasn't dismissed the CTA.
 */
export function MissionCTA() {
  const { missions, openSidebar } = useMissions()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Use the missions context instead of reading localStorage directly
  const hasMissions = missions && missions.length > 0

  if (dismissed || hasMissions) return null

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch { /* ignore */ }
  }

  return (
    <div className="mb-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center gap-3">
      <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0" />
      <div className="flex-1">
        <span className="text-sm font-medium text-purple-300">Try AI Missions</span>
        <span className="text-sm text-purple-400/80 ml-2">
          Guided workflows for scaling, security hardening, compliance checks, and more.
        </span>
      </div>
      <button
        onClick={openSidebar}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-foreground text-sm font-medium transition-colors"
      >
        Explore
      </button>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
