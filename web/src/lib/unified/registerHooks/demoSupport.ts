/**
 * Shared support for demo data hooks.
 */

import { useEffect, useState } from 'react'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { SHORT_DELAY_MS } from '../../constants/network'
import { MS_PER_SECOND, MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../constants/time'

const THIRTY_SECONDS_MS = 30 * MS_PER_SECOND
const TWO_MINUTES_MS = 2 * MS_PER_MINUTE
const THREE_MINUTES_MS = 3 * MS_PER_MINUTE
const FOUR_MINUTES_MS = 4 * MS_PER_MINUTE
const FIVE_MINUTES_MS = 5 * MS_PER_MINUTE
const TEN_MINUTES_MS = 10 * MS_PER_MINUTE
const FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE
const THIRTY_MINUTES_MS = 30 * MS_PER_MINUTE
const FORTY_FIVE_MINUTES_MS = 45 * MS_PER_MINUTE
const TWO_HOURS_MS = 2 * MS_PER_HOUR
const THREE_HOURS_MS = 3 * MS_PER_HOUR
const TWO_DAYS_MS = 2 * MS_PER_DAY
const THREE_DAYS_MS = 3 * MS_PER_DAY

export {
  THIRTY_SECONDS_MS,
  TWO_MINUTES_MS,
  THREE_MINUTES_MS,
  FOUR_MINUTES_MS,
  FIVE_MINUTES_MS,
  TEN_MINUTES_MS,
  FIFTEEN_MINUTES_MS,
  THIRTY_MINUTES_MS,
  FORTY_FIVE_MINUTES_MS,
  TWO_HOURS_MS,
  THREE_HOURS_MS,
  TWO_DAYS_MS,
  THREE_DAYS_MS,
}

export function useDemoDataHook<T>(demoData: T[]) {
  const { isDemoMode: demoMode } = useDemoMode()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!demoMode) {
      queueMicrotask(() => setIsLoading(false))
      return
    }
    queueMicrotask(() => setIsLoading(true))
    const timer = setTimeout(() => setIsLoading(false), SHORT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [demoMode])

  return {
    data: !demoMode ? [] : isLoading ? [] : demoData,
    isLoading,
    error: null,
    refetch: () => {} }
}
