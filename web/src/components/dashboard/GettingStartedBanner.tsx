/**
 * Getting Started Banner — shown to first-time users on the main dashboard.
 *
 * Contains 3 quick-action buttons that funnel users to key features:
 *   1. "Browse Cards" — opens the add card modal
 *   2. "Try a Mission" — opens the mission sidebar
 *   3. "Explore Dashboards" — opens the customize modal
 *
 * Dismissed permanently via localStorage. Suppressed when user disables
 * hints in settings. Replaces the separate MissionCTA banner.
 */

import { useState, useEffect, useRef } from 'react'
import { LayoutGrid, Compass, Sparkles, X } from 'lucide-react'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import {
  STORAGE_KEY_GETTING_STARTED_DISMISSED,
  STORAGE_KEY_HINTS_SUPPRESSED,
} from '../../lib/constants/storage'
import { emitGettingStartedShown, emitGettingStartedActioned } from '../../lib/analytics'
import { DASHBOARD_CONFIGS } from '../../config/dashboards/index'

const DASHBOARD_COUNT = Object.keys(DASHBOARD_CONFIGS).length

interface GettingStartedBannerProps {
  onBrowseCards: () => void
  onTryMission: () => void
  onExploreDashboards: () => void
}

export function GettingStartedBanner({
  onBrowseCards,
  onTryMission,
  onExploreDashboards,
}: GettingStartedBannerProps) {
  const [dismissed, setDismissed] = useState(
    () => safeGetItem(STORAGE_KEY_GETTING_STARTED_DISMISSED) === 'true'
  )
  const emittedRef = useRef(false)

  // Emit analytics once on first render
  useEffect(() => {
    if (!dismissed && !emittedRef.current) {
      emittedRef.current = true
      emitGettingStartedShown()
    }
  }, [dismissed])

  const [hintsSuppressed] = useState(
    () => safeGetItem(STORAGE_KEY_HINTS_SUPPRESSED) === 'true'
  )

  if (hintsSuppressed || dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    safeSetItem(STORAGE_KEY_GETTING_STARTED_DISMISSED, 'true')
  }

  const handleAction = (action: string, callback: () => void) => {
    emitGettingStartedActioned(action)
    callback()
  }

  const actions = [
    {
      id: 'browse-cards',
      label: 'Browse Cards',
      description: 'Add monitoring cards to your dashboard',
      icon: LayoutGrid,
      onClick: () => handleAction('browse_cards', onBrowseCards),
    },
    {
      id: 'try-mission',
      label: 'Try a Mission',
      description: 'Guided workflows for scaling, security & more',
      icon: Sparkles,
      onClick: () => handleAction('try_mission', onTryMission),
    },
    {
      id: 'explore-dashboards',
      label: 'Explore Dashboards',
      description: `${DASHBOARD_COUNT} topic-specific dashboards`,
      icon: Compass,
      onClick: () => handleAction('explore_dashboards', onExploreDashboards),
    },
  ]

  return (
    <div className="mb-4 rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 via-blue-500/5 to-transparent p-4 animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Welcome to KubeStellar Console
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get started with these quick actions
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {actions.map(({ id, label, description, icon: Icon, onClick }) => (
          <button
            key={id}
            onClick={onClick}
            className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50 hover:border-purple-500/30 hover:bg-secondary/50 transition-all text-left group"
          >
            <div className="p-2 rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors flex-shrink-0">
              <Icon className="w-4 h-4 text-purple-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{label}</p>
              <p className="text-xs text-muted-foreground truncate">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
