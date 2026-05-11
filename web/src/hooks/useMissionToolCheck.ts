import { useEffect, useMemo, useState } from 'react'
import { useLocalAgent } from './useLocalAgent'
import { agentFetch } from './mcp/agentFetch'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { resolveRequiredTools, runToolPreflightCheck } from '../lib/missions/preflightCheck'

export type MissionToolCheckStatus = 'idle' | 'checking' | 'ready' | 'warning' | 'blocked' | 'error'

export interface MissionToolCheckResult {
  status: MissionToolCheckStatus
  requiredTools: string[]
  missingTools: string[]
  errorMessage?: string
  allowMissingTools: boolean
  isConnected: boolean
  isChecking: boolean
  isBlocking: boolean
  showNotice: boolean
}

interface UseMissionToolCheckOptions {
  enabled: boolean
  missionType?: string
  missionContext?: Record<string, unknown>
}

function getMissingTools(errorDetails: Record<string, unknown> | undefined, fallbackTools: string[]): string[] {
  const details = errorDetails?.missingTools
  return Array.isArray(details) && details.every(tool => typeof tool === 'string')
    ? details
    : fallbackTools
}

export function useMissionToolCheck({
  enabled,
  missionType,
  missionContext,
}: UseMissionToolCheckOptions): MissionToolCheckResult {
  const { status: agentStatus } = useLocalAgent()
  const requiredTools = useMemo(() => missionType ? resolveRequiredTools(missionType) : [], [missionType])
  const allowMissingTools = missionContext?.allowMissingLocalTools === true
  const isConnected = agentStatus === 'connected'
  const [result, setResult] = useState<Pick<MissionToolCheckResult, 'status' | 'missingTools' | 'errorMessage'>>({
    status: 'idle',
    missingTools: [],
  })

  useEffect(() => {
    if (!enabled || !isConnected || requiredTools.length === 0) {
      setResult({ status: 'idle', missingTools: [], errorMessage: undefined })
      return
    }

    let isActive = true
    setResult({ status: 'checking', missingTools: [], errorMessage: undefined })

    runToolPreflightCheck(LOCAL_AGENT_HTTP_URL, requiredTools, agentFetch)
      .then((toolResult) => {
        if (!isActive) return

        if (!toolResult.ok && toolResult.error?.code === 'MISSING_TOOLS') {
          const missingTools = getMissingTools(toolResult.error.details, requiredTools)
          setResult({
            status: allowMissingTools ? 'warning' : 'blocked',
            missingTools,
            errorMessage: toolResult.error.message,
          })
          return
        }

        if (!toolResult.ok && toolResult.error) {
          setResult({
            status: 'error',
            missingTools: [],
            errorMessage: toolResult.error.message,
          })
          return
        }

        setResult({ status: 'ready', missingTools: [], errorMessage: undefined })
      })
      .catch((error: unknown) => {
        console.error('[MissionToolCheck] preflight failed:', error)
        if (!isActive) return
        setResult({
          status: 'error',
          missingTools: [],
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      })

    return () => {
      isActive = false
    }
  }, [allowMissingTools, enabled, isConnected, requiredTools])

  const isChecking = result.status === 'checking'
  const isBlocking = result.status === 'blocked'
  const showNotice = requiredTools.length > 0 && isConnected && result.status !== 'idle'

  return {
    status: result.status,
    requiredTools,
    missingTools: result.missingTools,
    errorMessage: result.errorMessage,
    allowMissingTools,
    isConnected,
    isChecking,
    isBlocking,
    showNotice,
  }
}
