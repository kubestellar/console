import { useEffect, useRef } from 'react'
import { useMissions } from '../../hooks/useMissions'
import { INACTIVE_MISSION_STATUSES } from '../../hooks/useMissionTypes'
import { useStellar } from '../../hooks/useStellar'

const STELLAR_SSE_URL = '/api/stellar/stream'

interface MissionTriggerPayload {
  solveId: string
  eventId: string
  cluster: string
  namespace: string
  workload: string
  reason: string
  message: string
  title: string
  prompt: string
}

/**
 * StellarMissionBridge converts Stellar's `mission_trigger` SSE events into
 * real AI mission invocations via MissionContext.startMission — same machinery
 * the "Repair" button on ConsoleIssuesCard uses. Mounted in Layout so
 * autonomous decisions reach the mission system regardless of which page the
 * operator is on.
 *
 * The bridge also watches the mission's lifecycle. When its status reaches a
 * terminal state (completed / failed / cancelled), it POSTs the matching
 * outcome back to /api/stellar/solve/:solveID/complete so the event card flips
 * from progress bar → resolved/escalated badge. Without this round-trip, the
 * card would stay at 75% forever and the activity log would never record the
 * terminal beat.
 */
export function StellarMissionBridge() {
  const { startMission, missions } = useMissions()
  // Pull useStellar to ensure the provider is also mounted alongside us —
  // we don't actually consume any of its state here, but the bridge depends
  // on Stellar being initialized so cookies/auth are in place.
  useStellar()

  // Map missionId → { solveId, eventId } for missions Stellar spawned. We
  // need this so the lifecycle-watch effect knows which solves to close out
  // when each mission terminates. A ref (not state) avoids re-renders.
  const tracked = useRef<Map<string, { solveId: string; eventId: string }>>(new Map())
  // Solves whose /complete call has already been fired, so we don't POST
  // twice if the mission updates after termination.
  const completed = useRef<Set<string>>(new Set())
  // Solve IDs we already turned into missions, so duplicate SSE replays
  // (e.g. on reconnect with the same in-flight event) don't double-spawn.
  const handled = useRef<Set<string>>(new Set())

  // ── 1. Listen for backend "please trigger a mission" SSE events. ──
  useEffect(() => {
    const es = new EventSource(STELLAR_SSE_URL, { withCredentials: true })

    const onTrigger = (e: MessageEvent) => {
      try {
        const payload: MissionTriggerPayload = JSON.parse(e.data)
        if (!payload.solveId || handled.current.has(payload.solveId)) return
        handled.current.add(payload.solveId)

        // skipReview: true is the JARVIS part. No confirmation dialog —
        // Stellar already decided this event was critical, you don't need
        // to vouch for it. The mission sidebar will show actions as they
        // happen, which is the operator's verification path.
        const missionId = startMission({
          title: payload.title,
          description: `Stellar autonomous fix · ${payload.namespace}/${payload.workload}`,
          type: 'repair',
          cluster: payload.cluster,
          initialPrompt: payload.prompt,
          skipReview: true,
          context: {
            stellarSolveId: payload.solveId,
            stellarEventId: payload.eventId,
            cluster: payload.cluster,
            namespace: payload.namespace,
            workload: payload.workload,
            reason: payload.reason,
            message: payload.message,
          },
        })

        if (missionId) {
          tracked.current.set(missionId, {
            solveId: payload.solveId,
            eventId: payload.eventId,
          })
        }
      } catch {
        // Bad payload — ignore.
      }
    }

    es.addEventListener('mission_trigger', onTrigger)
    return () => {
      es.removeEventListener('mission_trigger', onTrigger)
      es.close()
    }
  }, [startMission])

  // ── 2. Watch tracked missions and close the loop when they terminate. ──
  useEffect(() => {
    for (const [missionId, link] of tracked.current.entries()) {
      if (completed.current.has(link.solveId)) continue
      const m = missions.find(mn => mn.id === missionId)
      if (!m) continue
      if (!INACTIVE_MISSION_STATUSES.has(m.status)) continue
      // Terminal — derive Stellar's outcome status from the mission's.
      let stellarStatus: 'resolved' | 'escalated' | 'exhausted' = 'resolved'
      let summary = m.currentStep || 'AI mission completed.'
      if (m.status === 'failed') {
        stellarStatus = 'escalated'
        summary = `AI mission failed: ${m.currentStep || 'see mission sidebar for details'}.`
      } else if (m.status === 'cancelled') {
        stellarStatus = 'exhausted'
        summary = 'AI mission cancelled — needs your call on next steps.'
      } else if (m.status === 'completed') {
        const lastAssistant = [...m.messages].reverse().find(msg => msg.role === 'assistant')
        if (lastAssistant) {
          summary = lastAssistant.content.slice(0, 400)
        }
      }
      completed.current.add(link.solveId)
      fetch(`/api/stellar/solve/${encodeURIComponent(link.solveId)}/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          solveId: link.solveId,
          eventId: link.eventId,
          status: stellarStatus,
          summary,
        }),
      }).catch(() => {
        // Non-fatal: card stays at "Solving" and the user can dismiss
        // manually. We don't want a stuck retry loop.
      })
    }
  }, [missions])

  return null
}
