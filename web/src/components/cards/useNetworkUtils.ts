import { useState, useEffect, useCallback, useRef } from 'react'
import { useCardDemoState } from './CardDataContext'
import {
  STORAGE_KEY,
  PING_INTERVAL_KEY,
  PING_TIMEOUT,
  DEFAULT_HOSTS,
  getStoredPingInterval,
  getDemoPingResult,
} from './NetworkUtils.constants'
import type {
  PingResult,
  SavedHost,
  NetworkInfo,
  NavigatorWithConnection,
  NetworkUtilsTab,
} from './NetworkUtils.types'

export function useNetworkUtils() {
  const { shouldUseDemoData } = useCardDemoState({ requires: 'backend' })
  const [activeTab, setActiveTab] = useState<NetworkUtilsTab>('ping')
  const [isInitialized, setIsInitialized] = useState(false)
  const [savedHosts, setSavedHosts] = useState<SavedHost[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : DEFAULT_HOSTS.map(h => ({ host: h, type: 'ping' as const }))
    } catch {
      return DEFAULT_HOSTS.map(h => ({ host: h, type: 'ping' as const }))
    }
  })

  const [pingResults, setPingResults] = useState<Map<string, PingResult[]>>(new Map())
  const [isPinging, setIsPinging] = useState(false)
  const [continuousPing, setContinuousPing] = useState(false)
  const [pingInterval, setPingInterval] = useState<number>(getStoredPingInterval)
  const [hostInput, setHostInput] = useState('')
  const [portInput, setPortInput] = useState('443')
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>({ online: typeof navigator !== 'undefined' ? navigator.onLine : true })

  const pingIntervalRef = useRef<number | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isPingingRef = useRef(false) // Ref to track pinging state for stable callback

  // Update network info and mark as initialized
  useEffect(() => {
    const updateNetworkInfo = () => {
      const connection = (navigator as NavigatorWithConnection).connection
      setNetworkInfo({
        online: navigator.onLine,
        effectiveType: connection?.effectiveType,
        downlink: connection?.downlink,
        rtt: connection?.rtt })
      setIsInitialized(true)
    }

    updateNetworkInfo()
    window.addEventListener('online', updateNetworkInfo)
    window.addEventListener('offline', updateNetworkInfo)

    const connection = (navigator as NavigatorWithConnection).connection
    if (connection) {
      connection.addEventListener('change', updateNetworkInfo)
    }

    return () => {
      window.removeEventListener('online', updateNetworkInfo)
      window.removeEventListener('offline', updateNetworkInfo)
      if (connection) {
        connection.removeEventListener('change', updateNetworkInfo)
      }
    }
  }, [])

  // Ping a single host via the backend proxy.
  // The backend performs a real HTTP HEAD request and returns the actual
  // status code and server-side measured latency, avoiding the browser's
  // no-cors limitation where opaque responses hide failures.
  // In demo mode, returns simulated results to avoid backend dependency.
  const pingHost = useCallback(async (host: string): Promise<PingResult> => {
    if (shouldUseDemoData) {
      return getDemoPingResult(host)
    }
    try {
      // Ensure URL has protocol for the backend
      let targetUrl = host
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl
      }

      abortControllerRef.current = new AbortController()
      const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), PING_TIMEOUT)

      const response = await fetch(
        `/api/ping?url=${encodeURIComponent(targetUrl)}`,
        {
          method: 'GET',
          signal: abortControllerRef.current.signal }
      )

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: 'unknown error' })) as Record<string, string>
        return {
          host,
          latency: null,
          status: 'error',
          timestamp: new Date(),
          error: errorBody.error }
      }

      const data = await response.json() as {
        status: 'success' | 'timeout' | 'error'
        latencyMs: number
        statusCode?: number
        error?: string
      }

      return {
        host,
        latency: data.status === 'success' ? data.latencyMs : null,
        status: data.status,
        timestamp: new Date(),
        statusCode: data.statusCode,
        error: data.error || undefined }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          host,
          latency: null,
          status: 'timeout',
          timestamp: new Date() }
      }

      return {
        host,
        latency: null,
        status: 'error',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'unknown error' }
    }
  }, [shouldUseDemoData])

  // Ping all saved hosts
  const pingAllHosts = useCallback(async () => {
    // Use ref for guard to prevent callback reference from changing
    if (isPingingRef.current) return
    isPingingRef.current = true
    setIsPinging(true)

    const pingHosts = savedHosts.filter(h => h.type === 'ping')

    for (const { host } of pingHosts) {
      const result = await pingHost(host)
      setPingResults(prev => {
        const newMap = new Map(prev)
        const existing = newMap.get(host) || []
        // Keep last 10 results
        newMap.set(host, [...existing.slice(-9), result])
        return newMap
      })
    }

    isPingingRef.current = false
    setIsPinging(false)
  }, [savedHosts, pingHost]) // Removed isPinging from deps - use ref instead

  // Save ping interval to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(PING_INTERVAL_KEY, String(pingInterval))
    } catch {
      // Ignore localStorage errors
    }
  }, [pingInterval])

  // Handle continuous ping with adjustable interval
  useEffect(() => {
    if (continuousPing) {
      pingAllHosts()
      pingIntervalRef.current = window.setInterval(pingAllHosts, pingInterval)
    } else {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }
    }

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
    }
  }, [continuousPing, pingAllHosts, pingInterval])

  // Add host
  const addHost = (type: 'ping' | 'port') => {
    if (!hostInput.trim()) return

    const newHost: SavedHost = {
      host: hostInput.trim(),
      type,
      port: type === 'port' ? parseInt(portInput) || 443 : undefined }

    const exists = savedHosts.some(h =>
      h.host === newHost.host && h.type === newHost.type && h.port === newHost.port
    )

    if (!exists) {
      const updated = [...savedHosts, newHost]
      setSavedHosts(updated)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    }

    setHostInput('')
  }

  // Remove host
  const removeHost = (host: string, type: 'ping' | 'port', port?: number) => {
    const updated = savedHosts.filter(h =>
      !(h.host === host && h.type === type && h.port === port)
    )
    setSavedHosts(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

    // Remove results
    setPingResults(prev => {
      const newMap = new Map(prev)
      newMap.delete(host)
      return newMap
    })
  }

  // Calculate average latency
  const getAverageLatency = (host: string): number | null => {
    const results = pingResults.get(host)
    if (!results || results.length === 0) return null

    const successful = results.filter(r => r.latency !== null)
    if (successful.length === 0) return null

    return Math.round(successful.reduce((sum, r) => sum + (r.latency || 0), 0) / successful.length)
  }

  const pingHosts = savedHosts.filter(h => h.type === 'ping')
  const portHosts = savedHosts.filter(h => h.type === 'port')

  return {
    activeTab,
    setActiveTab,
    isInitialized,
    shouldUseDemoData,
    pingResults,
    isPinging,
    continuousPing,
    setContinuousPing,
    pingInterval,
    setPingInterval,
    hostInput,
    setHostInput,
    portInput,
    setPortInput,
    networkInfo,
    pingAllHosts,
    addHost,
    removeHost,
    getAverageLatency,
    pingHosts,
    portHosts,
  }
}
