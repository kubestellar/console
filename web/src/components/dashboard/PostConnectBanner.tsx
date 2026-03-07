/**
 * Post-Agent-Connect Activation Banner
 *
 * Shown when a user first connects kc-agent to bridge the 90% drop-off
 * between "Agent Connected" (Step 2) and "Started Mission" (Step 3).
 *
 * GA4 data shows 75 localhost users connect an agent but only 7 start
 * a mission (9.33%). This banner provides immediate next-step CTAs.
 */

import { useState, useEffect, useRef } from 'react'
import { Rocket, Activity, Server, Bell, X } from 'lucide-react'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import {
  STORAGE_KEY_POST_CONNECT_DISMISSED,
  STORAGE_KEY_HINTS_SUPPRESSED,
} from '../../lib/constants/storage'
import { emitPostConnectShown, emitPostConnectActioned } from '../../lib/analytics'

interface PostConnectBannerProps {
  onRunHealthCheck: () => void
  onExploreClusters: () => void
  onSetupAlerts: () => void
}

/** How long (ms) after agent connects before showing the banner */
const SHOW_DELAY_MS = 2000

export function PostConnectBanner({
  onRunHealthCheck,
  onExploreClusters,
  onSetupAlerts,
}: PostConnectBannerProps) {
  const { status: agentStatus, health } = useLocalAgent()
  const [dismissed, setDismissed] = useState(
    () => safeGetItem(STORAGE_KEY_POST_CONNECT_DISMISSED) === 'true'
  )
  const [hintsSuppressed] = useState(
    () => safeGetItem(STORAGE_KEY_HINTS_SUPPRESSED) === 'true'
  )
  const [showBanner, setShowBanner] = useState(false)
  const emittedRef = useRef(false)
  const prevStatusRef = useRef(agentStatus)

  // Detect transition to 'connected' and show banner after a short delay
  useEffect(() => {
    if (
      agentStatus === 'connected' &&
      prevStatusRef.current !== 'connected' &&
      !dismissed &&
      !hintsSuppressed
    ) {
      const timer = setTimeout(() => setShowBanner(true), SHOW_DELAY_MS)
      return () => clearTimeout(timer)
    }
    prevStatusRef.current = agentStatus
  }, [agentStatus, dismissed, hintsSuppressed])

  // Emit analytics once when banner first renders
  useEffect(() => {
    if (showBanner && !emittedRef.current) {
      emittedRef.current = true
      emitPostConnectShown()
    }
  }, [showBanner])

  if (!showBanner || dismissed || hintsSuppressed) return null

  const clusterCount = health?.clusters ?? 0

  const handleDismiss = () => {
    setDismissed(true)
    safeSetItem(STORAGE_KEY_POST_CONNECT_DISMISSED, 'true')
  }

  const handleAction = (action: string, callback: () => void) => {
    emitPostConnectActioned(action)
    callback()
    handleDismiss()
  }

  const actions = [
    {
      id: 'health-check',
      label: 'Run Health Check',
      description: 'AI-powered cluster audit',
      icon: Activity,
      onClick: () => handleAction('health_check', onRunHealthCheck),
    },
    {
      id: 'explore-clusters',
      label: 'Explore Clusters',
      description: `${clusterCount} cluster${clusterCount !== 1 ? 's' : ''} detected`,
      icon: Server,
      onClick: () => handleAction('explore_clusters', onExploreClusters),
    },
    {
      id: 'setup-alerts',
      label: 'Set Up Alerts',
      description: 'Get notified of issues',
      icon: Bell,
      onClick: () => handleAction('setup_alerts', onSetupAlerts),
    },
  ]

  return (
    <div className="mb-4 rounded-xl border border-green-500/20 bg-gradient-to-br from-green-500/5 via-green-500/5 to-transparent p-4 animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-green-400" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Your clusters are connected!
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              kc-agent is live — here&apos;s what you can do next
            </p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {actions.map(({ id, label, description, icon: Icon, onClick }) => (
          <button
            key={id}
            onClick={onClick}
            className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50 hover:border-green-500/30 hover:bg-secondary/50 transition-all text-left group"
          >
            <div className="p-2 rounded-lg bg-green-500/10 group-hover:bg-green-500/20 transition-colors flex-shrink-0">
              <Icon className="w-4 h-4 text-green-400" />
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
