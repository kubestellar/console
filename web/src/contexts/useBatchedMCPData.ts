import { useState, useCallback, useRef, useEffect } from 'react'
import type { AlertsMCPData } from './AlertsDataFetcher'

const MCP_UPDATE_BATCH_FRAME_FALLBACK_MS = 16

/** Holds MCP data and batches rapid updates into a single frame-aligned state update. */
export function useBatchedMCPData() {
  const [mcpData, setMCPData] = useState<AlertsMCPData>({
    gpuNodes: [],
    podIssues: [],
    clusters: [],
    isLoading: true,
    error: null,
  })

  const pendingMCPDataRef = useRef<AlertsMCPData | null>(null)
  const mcpFlushHandleRef = useRef<number | ReturnType<typeof setTimeout> | null>(null)

  const flushPendingMCPData = useCallback(() => {
    mcpFlushHandleRef.current = null
    const pendingMCPData = pendingMCPDataRef.current
    if (!pendingMCPData) return

    pendingMCPDataRef.current = null
    setMCPData(pendingMCPData)
  }, [])

  const enqueueMCPData = useCallback((nextMCPData: AlertsMCPData) => {
    pendingMCPDataRef.current = nextMCPData
    if (mcpFlushHandleRef.current !== null) return

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      mcpFlushHandleRef.current = window.requestAnimationFrame(() => {
        flushPendingMCPData()
      })
      return
    }

    mcpFlushHandleRef.current = globalThis.setTimeout(() => {
      flushPendingMCPData()
    }, MCP_UPDATE_BATCH_FRAME_FALLBACK_MS)
  }, [flushPendingMCPData])

  useEffect(() => () => {
    if (mcpFlushHandleRef.current === null) return

    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(mcpFlushHandleRef.current as number)
      return
    }

    globalThis.clearTimeout(mcpFlushHandleRef.current)
  }, [])

  return { mcpData, enqueueMCPData }
}
