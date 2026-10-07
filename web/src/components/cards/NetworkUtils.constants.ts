import { LATENCY_GOOD_MS, LATENCY_ACCEPTABLE_MS } from '@/lib/constants/network'
import type { PingResult } from './NetworkUtils.types'

export const STORAGE_KEY = 'network_utils_hosts'
export const PING_INTERVAL_KEY = 'network_utils_ping_interval'
export const PING_TIMEOUT = 5000
const DEFAULT_PING_INTERVAL_MS = 3000
const PARSE_INT_RADIX = 10
const PING_INTERVAL_5S_MS = 5_000
const PING_INTERVAL_30S_MS = 30_000

// Ping interval options in milliseconds
export const PING_INTERVALS = [
  { value: 1000, label: '1s' },
  { value: 2000, label: '2s' },
  { value: DEFAULT_PING_INTERVAL_MS, label: '3s' },
  { value: PING_INTERVAL_5S_MS, label: '5s' },
  { value: 10000, label: '10s' },
  { value: PING_INTERVAL_30S_MS, label: '30s' },
]

export function getStoredPingInterval(): number {
  try {
    const saved = localStorage.getItem(PING_INTERVAL_KEY)
    if (!saved) return DEFAULT_PING_INTERVAL_MS

    const parsedInterval = Number.parseInt(saved, PARSE_INT_RADIX)
    const isSupportedInterval = PING_INTERVALS.some(({ value }) => value === parsedInterval)

    return Number.isFinite(parsedInterval) && isSupportedInterval ? parsedInterval : DEFAULT_PING_INTERVAL_MS
  } catch {
    return DEFAULT_PING_INTERVAL_MS
  }
}

// Demo ping result for demo mode (avoids backend API calls)
export function getDemoPingResult(host: string): PingResult {
  const DEMO_LATENCIES = [12, 45, 28, 67, 8, 35, 92]
  const latency = DEMO_LATENCIES[Math.abs(host.length) % DEMO_LATENCIES.length]
  return {
    host,
    latency,
    status: 'success',
    timestamp: new Date(),
    statusCode: 200,
  }
}

// Default hosts to ping
export const DEFAULT_HOSTS = [
  'https://www.google.com',
  'https://api.github.com',
  'https://kubernetes.io',
]

// Get status color
export const getStatusColor = (latency: number | null, status: string) => {
  if (status === 'error' || status === 'timeout') return 'text-red-400'
  if (latency === null) return 'text-muted-foreground'
  if (latency < LATENCY_GOOD_MS) return 'text-green-400'
  if (latency < LATENCY_ACCEPTABLE_MS) return 'text-yellow-400'
  return 'text-orange-400'
}
