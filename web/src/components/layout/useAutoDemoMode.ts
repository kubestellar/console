import { useEffect, useRef } from 'react'
import { setDemoMode } from '../../lib/demoMode'
import { hasApprovedAgents } from '../agent/AgentApprovalDialog'
import { wasAgentEverConnected } from '../../hooks/useLocalAgent'

const AGENT_CONNECT_GRACE_MS = 8000

interface UseAutoDemoModeOptions {
  agentStatus: string
  isInClusterMode: boolean
  isDemoMode: boolean
  isDemoModeForced: boolean
}

export function useAutoDemoMode({
  agentStatus,
  isInClusterMode,
  isDemoMode,
  isDemoModeForced,
}: UseAutoDemoModeOptions) {
  const demoAutoEnabledRef = useRef(false)
  const demoReEnableTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const prevDemoModeRef = useRef(isDemoMode)
  const userToggledOffRef = useRef(false)

  useEffect(() => {
    if (prevDemoModeRef.current && !isDemoMode && agentStatus !== 'connected') {
      userToggledOffRef.current = true
    }
    prevDemoModeRef.current = isDemoMode
  }, [agentStatus, isDemoMode])

  useEffect(() => {
    if (
      agentStatus === 'disconnected'
      && !isInClusterMode
      && !isDemoMode
      && !isDemoModeForced
    ) {
      if (userToggledOffRef.current) {
        demoReEnableTimerRef.current = setTimeout(() => {
          userToggledOffRef.current = false
          demoAutoEnabledRef.current = true
          setDemoMode(true)
        }, AGENT_CONNECT_GRACE_MS)
      } else if (!wasAgentEverConnected()) {
        demoAutoEnabledRef.current = true
        setDemoMode(true)
      }
    } else if (
      agentStatus === 'connected'
      && isDemoMode
      && demoAutoEnabledRef.current
      && hasApprovedAgents()
    ) {
      demoAutoEnabledRef.current = false
      userToggledOffRef.current = false
      if (demoReEnableTimerRef.current) {
        clearTimeout(demoReEnableTimerRef.current)
      }
      setDemoMode(false, true)
    } else if (demoReEnableTimerRef.current) {
      clearTimeout(demoReEnableTimerRef.current)
    }

    return () => {
      if (demoReEnableTimerRef.current) {
        clearTimeout(demoReEnableTimerRef.current)
      }
    }
  }, [agentStatus, isDemoMode, isInClusterMode, isDemoModeForced])
}
