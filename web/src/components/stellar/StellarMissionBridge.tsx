import { useEffect, useRef } from 'react'
import { useMissions } from '../../hooks/useMissions'
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
 * StellarMissionBridge listens to the Stellar SSE stream for `mission_trigger`
 * events and converts them into actual AI mission invocations via the existing
 * MissionContext.startMission API — the same path the "Repair" button on
 * ConsoleIssuesCard uses.
 *
 * Mounted eagerly in Layout so autonomous solve decisions reach the mission
 * system regardless of which page the operator is on. Once the mission
 * starts, MissionProvider drives the agent over WebSocket, the user sees the
 * mission sidebar light up, and the AI does the actual fix end-to-end.
 *
 * We open a dedicated lightweight EventSource here rather than reuse the one
 * inside useStellarSource because that one is buffered through React state
 * and may miss the very first event on a cold mount. The bridge is the only
 * subscriber that needs the message inline, so a direct stream is simpler.
 */
export function StellarMissionBridge() {
  const { startMission } = useMissions()
  // Pull useStellar to ensure the provider is also mounted alongside us —
  // we don't actually consume any of its state here, but the bridge depends
  // on Stellar being initialized so cookies/auth are in place.
  useStellar()

  const handledRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const es = new EventSource(STELLAR_SSE_URL, { withCredentials: true })

    const onTrigger = (e: MessageEvent) => {
      try {
        const payload: MissionTriggerPayload = JSON.parse(e.data)
        if (!payload.solveId || handledRef.current.has(payload.solveId)) return
        handledRef.current.add(payload.solveId)

        // Fire the mission. We use type: 'repair' so it shows in the mission
        // sidebar alongside other repair missions, and skipReview: true so
        // the AI starts immediately — autonomous means autonomous, no
        // confirmation dialog. The "Stellar" prefix in the title makes the
        // origin obvious in the mission list.
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

        // Best-effort: tell the backend the mission landed so the activity
        // log shows the linkage. Failure is non-fatal.
        if (missionId) {
          // We don't wait for mission completion here — when the mission
          // finishes the user can mark it resolved from the mission sidebar
          // or the Stellar page. Future: hook into MissionContext to detect
          // status transitions and call /complete automatically.
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

  return null
}
