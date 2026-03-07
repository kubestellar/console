/**
 * Adopter Nudge — shown after a user has been using the console for 3+ days.
 *
 * Prompts engaged users to add their company/project to ADOPTERS.MD.
 * Only shows for localhost users who have connected kc-agent at least
 * ADOPTER_NUDGE_DELAY_DAYS ago.
 */

import { useState, useEffect, useRef } from 'react'
import { Heart, ExternalLink, X } from 'lucide-react'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import {
  STORAGE_KEY_ADOPTER_NUDGE_DISMISSED,
  STORAGE_KEY_FIRST_AGENT_CONNECT,
  STORAGE_KEY_HINTS_SUPPRESSED,
} from '../../lib/constants/storage'
import {
  emitAdopterNudgeShown,
  emitAdopterNudgeActioned,
  emitConversionStep,
} from '../../lib/analytics'
import { isNetlifyDeployment } from '../../lib/demoMode'

const ADOPTERS_EDIT_URL =
  'https://github.com/kubestellar/console/edit/main/ADOPTERS.MD'

/** Number of days after first agent connection before showing the nudge */
const ADOPTER_NUDGE_DELAY_DAYS = 3
const MS_PER_DAY = 86_400_000

export function AdopterNudge() {
  const { isConnected } = useLocalAgent()
  const [dismissed, setDismissed] = useState(
    () => safeGetItem(STORAGE_KEY_ADOPTER_NUDGE_DISMISSED) === 'true'
  )
  const [hintsSuppressed] = useState(
    () => safeGetItem(STORAGE_KEY_HINTS_SUPPRESSED) === 'true'
  )
  const emittedRef = useRef(false)

  // Check if enough time has passed since first agent connection
  const firstConnect = safeGetItem(STORAGE_KEY_FIRST_AGENT_CONNECT)
  const daysSinceFirstConnect = firstConnect
    ? (Date.now() - parseInt(firstConnect, 10)) / MS_PER_DAY
    : 0

  const shouldShow =
    !isNetlifyDeployment &&
    isConnected &&
    !dismissed &&
    !hintsSuppressed &&
    daysSinceFirstConnect >= ADOPTER_NUDGE_DELAY_DAYS

  useEffect(() => {
    if (shouldShow && !emittedRef.current) {
      emittedRef.current = true
      emitAdopterNudgeShown()
    }
  }, [shouldShow])

  if (!shouldShow) return null

  const handleDismiss = () => {
    setDismissed(true)
    safeSetItem(STORAGE_KEY_ADOPTER_NUDGE_DISMISSED, 'true')
  }

  const handleAddOrg = () => {
    emitAdopterNudgeActioned('add_org')
    emitConversionStep(7, 'adopter_cta')
    window.open(ADOPTERS_EDIT_URL, '_blank', 'noopener,noreferrer')
    handleDismiss()
  }

  return (
    <div className="mb-4 rounded-xl border border-pink-500/20 bg-gradient-to-br from-pink-500/5 via-pink-500/5 to-transparent p-4 animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-pink-500/10 flex-shrink-0 mt-0.5">
            <Heart className="w-4 h-4 text-pink-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Enjoying KubeStellar Console?
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add your company or project to our adopters list and help grow the community.
            </p>
            <button
              onClick={handleAddOrg}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-400 hover:bg-pink-500/20 hover:text-pink-300 text-xs font-medium transition-all"
            >
              Add your organization
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
