/**
 * useOrbitAutoRun — Automatically runs orbit missions when they're due.
 *
 * Scans saved orbit missions on an interval. If a mission has autoRun
 * enabled and is past its cadence, it starts automatically. Shows a
 * toast notification so the user knows what's happening.
 *
 * Only runs when the console is open — if the user hasn't visited in
 * a week, overdue auto-runs execute on next visit.
 */

import { useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { isDemoMode } from '../lib/demoMode'
import { useMissions } from './useMissions'
import { useToast } from '../components/ui/Toast'
import { ORBIT_CADENCE_HOURS, ORBIT_AUTORUN_CHECK_INTERVAL_MS } from '../lib/constants/orbit'
import { emitOrbitMissionRun } from '../lib/analytics'
import type { OrbitConfig } from '../lib/missions/types'

/** Tracks which missions were auto-run this session to prevent re-triggering */
const autoRunTriggered = new Set<string>()

function isDue(config: OrbitConfig): boolean {
  if (!config.lastRunAt) return true
  const cadenceMs = ORBIT_CADENCE_HOURS[config.cadence] * 3_600_000
  const elapsed = Date.now() - new Date(config.lastRunAt).getTime()
  return elapsed >= cadenceMs
}

export function useOrbitAutoRun() {
  const { isAuthenticated } = useAuth()
  const { missions, runSavedMission } = useMissions()
  const { showToast } = useToast()
  const missionsRef = useRef(missions)
  missionsRef.current = missions

  useEffect(() => {
    if (!isAuthenticated || isDemoMode()) return

    function checkAndRun() {
      for (const mission of missionsRef.current || []) {
        if (mission.importedFrom?.missionClass !== 'orbit') continue
        if (mission.status !== 'saved') continue

        const config = mission.context?.orbitConfig as OrbitConfig | undefined
        if (!config?.autoRun) continue
        if (!isDue(config)) continue
        if (autoRunTriggered.has(mission.id)) continue

        // Mark as triggered this session
        autoRunTriggered.add(mission.id)

        // Auto-run the mission
        runSavedMission(mission.id)
        emitOrbitMissionRun(config.orbitType, 'auto')
        showToast(`Orbital maintenance started: ${mission.title}`, 'info')
      }
    }

    // Check immediately on mount
    checkAndRun()

    // Then check periodically
    const interval = setInterval(checkAndRun, ORBIT_AUTORUN_CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isAuthenticated, runSavedMission, showToast])
}
