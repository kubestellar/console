import { useState, useEffect } from 'react'
import { useDemoMode } from '../../hooks/useDemoMode'
import { SHORT_DELAY_MS } from '../constants/network'

export function useDemoDataHook<T>(demoData: T[]) {
  const { isDemoMode: demoMode } = useDemoMode()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!demoMode) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const timer = setTimeout(() => setIsLoading(false), SHORT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [demoMode])

  return {
    data: !demoMode ? [] : isLoading ? [] : demoData,
    isLoading,
    error: null,
    refetch: () => {},
  }
}
