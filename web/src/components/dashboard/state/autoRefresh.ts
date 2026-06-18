import { useEffect, useRef, useState } from 'react'
import { STORAGE_KEY_DASHBOARD_AUTO_REFRESH } from '../../../lib/constants'
import { setAutoRefreshPaused } from '../../../lib/cache'
import { safeGetItem, safeSetItem } from '../../../lib/utils/localStorage'
import { AUTO_REFRESH_INTERVAL_MS } from './types'

interface UseDashboardAutoRefreshProps {
  isLoading: boolean
  refetch: () => void
}

export function useDashboardAutoRefresh({ isLoading, refetch }: UseDashboardAutoRefreshProps) {
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const stored = safeGetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH)
    return stored !== null ? stored === 'true' : true
  })
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  useEffect(() => {
    safeSetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH, String(autoRefresh))
    setAutoRefreshPaused(!autoRefresh)
    return () => {
      setAutoRefreshPaused(false)
    }
  }, [autoRefresh])

  useEffect(() => {
    if (!autoRefresh) return
    autoRefreshIntervalRef.current = setInterval(() => {
      if (!isLoadingRef.current) {
        refetch()
      }
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current)
        autoRefreshIntervalRef.current = null
      }
    }
  }, [autoRefresh, refetch])

  return { autoRefresh, setAutoRefresh }
}
