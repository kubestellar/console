import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Activity, Globe, Server, Wifi, WifiOff, Clock,
  Play, Square, Trash2, Plus, CheckCircle, XCircle,
  AlertTriangle, Loader2
} from 'lucide-react'

// Types
interface PingResult {
  host: string
  latency: number | null
  status: 'success' | 'timeout' | 'error'
  timestamp: Date
}

interface SavedHost {
  host: string
  type: 'ping' | 'port'
  port?: number
}

interface NetworkInfo {
  online: boolean
  effectiveType?: string
  downlink?: number
  rtt?: number
}

// Extend Navigator type for Network Information API
interface NetworkInformation extends EventTarget {
  effectiveType?: string
  downlink?: number
  rtt?: number
  addEventListener(type: 'change', listener: EventListener): void
  removeEventListener(type: 'change', listener: EventListener): void
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation
}

const STORAGE_KEY = 'network_utils_hosts'
const PING_INTERVAL_KEY = 'network_utils_ping_interval'
const PING_TIMEOUT = 5000

// Ping interval options in milliseconds
const PING_INTERVALS = [
  { value: 1000, label: '1s' },
  { value: 2000, label: '2s' },
  { value: 3000, label: '3s' },
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' },
  { value: 30000, label: '30s' },
]

// Default hosts to ping
const DEFAULT_HOSTS = [
  'https://www.google.com',
  'https://api.github.com',
  'https://kubernetes.io',
]

export function NetworkUtils() {
  const [activeTab, setActiveTab] = useState<'ping' | 'ports' | 'info'>('ping')
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
  const [pingInterval, setPingInterval] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(PING_INTERVAL_KEY)
      return saved ? parseInt(saved) : 3000
    } catch {
      return 3000
    }
  })
  const [hostInput, setHostInput] = useState('')
  const [portInput, setPortInput] = useState('443')
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>({ online: navigator.onLine })

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
        rtt: connection?.rtt,
      })
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

  // Ping a single host using fetch timing
  const pingHost = useCallback(async (host: string): Promise<PingResult> => {
    const startTime = performance.now()

    try {
      // Ensure URL has protocol
      let url = host
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }

      abortControllerRef.current = new AbortController()
      const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), PING_TIMEOUT)

      await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors', // Allow cross-origin requests
        cache: 'no-store',
        signal: abortControllerRef.current.signal,
      })

      clearTimeout(timeoutId)
      const endTime = performance.now()
      const latency = Math.round(endTime - startTime)

      return {
        host,
        latency,
        status: 'success',
        timestamp: new Date(),
      }
    } catch (error) {
      const endTime = performance.now()
      const latency = Math.round(endTime - startTime)

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          host,
          latency: null,
          status: 'timeout',
          timestamp: new Date(),
        }
      }

      // Even with errors, we might have gotten a response (CORS blocks reading)
      // If latency is reasonable, consider it a success
      if (latency < PING_TIMEOUT - 100) {
        return {
          host,
          latency,
          status: 'success',
          timestamp: new Date(),
        }
      }

      return {
        host,
        latency: null,
        status: 'error',
        timestamp: new Date(),
      }
    }
  }, [])

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
  const addHost = useCallback((type: 'ping' | 'port') => {
    if (!hostInput.trim()) return

    const newHost: SavedHost = {
      host: hostInput.trim(),
      type,
      port: type === 'port' ? parseInt(portInput) || 443 : undefined,
    }

    const exists = savedHosts.some(h =>
      h.host === newHost.host && h.type === newHost.type && h.port === newHost.port
    )

    if (!exists) {
      const updated = [...savedHosts, newHost]
      setSavedHosts(updated)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    }

    setHostInput('')
  }, [hostInput, portInput, savedHosts])

  // Remove host
  const removeHost = useCallback((host: string, type: 'ping' | 'port', port?: number) => {
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
  }, [savedHosts])

  // Calculate average latency
  const getAverageLatency = (host: string): number | null => {
    const results = pingResults.get(host)
    if (!results || results.length === 0) return null

    const successful = results.filter(r => r.latency !== null)
    if (successful.length === 0) return null

    return Math.round(successful.reduce((sum, r) => sum + (r.latency || 0), 0) / successful.length)
  }

  // Get status color
  const getStatusColor = (latency: number | null, status: string) => {
    if (status === 'error' || status === 'timeout') return 'text-red-400'
    if (latency === null) return 'text-muted-foreground'
    if (latency < 100) return 'text-green-400'
    if (latency < 300) return 'text-yellow-400'
    return 'text-orange-400'
  }

  const pingHosts = savedHosts.filter(h => h.type === 'ping')
  const portHosts = savedHosts.filter(h => h.type === 'port')

  // Show loading state during initialization
  if (!isInitialized) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
        {/* Network status bar */}
        <div className="flex items-center justify-between mb-3 p-2 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2">
            {networkInfo.online ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-400" />
            )}
            <span className={`text-sm ${networkInfo.online ? 'text-green-400' : 'text-red-400'}`}>
              {networkInfo.online ? 'Online' : 'Offline'}
            </span>
          </div>
          {networkInfo.effectiveType && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{networkInfo.effectiveType.toUpperCase()}</span>
              {networkInfo.downlink && <span>{networkInfo.downlink} Mbps</span>}
              {networkInfo.rtt && <span>RTT: {networkInfo.rtt}ms</span>}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3">
          {(['ping', 'ports', 'info'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-1.5 text-sm rounded-lg transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
              }`}
            >
              {tab === 'ping' && <Activity className="w-3 h-3 inline mr-1" />}
              {tab === 'ports' && <Server className="w-3 h-3 inline mr-1" />}
              {tab === 'info' && <Globe className="w-3 h-3 inline mr-1" />}
              {tab}
            </button>
          ))}
        </div>

        {/* Ping tab */}
        {activeTab === 'ping' && (
          <div className="flex-1 flex flex-col">
            {/* Controls */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={hostInput}
                onChange={(e) => setHostInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addHost('ping')}
                placeholder="Host or URL"
                className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => addHost('ping')}
                disabled={!hostInput.trim()}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setContinuousPing(!continuousPing)}
                className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm rounded transition-colors ${
                  continuousPing
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                }`}
              >
                {continuousPing ? (
                  <>
                    <Square className="w-4 h-4" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start
                  </>
                )}
              </button>
              {/* Ping interval selector */}
              <select
                value={pingInterval}
                onChange={(e) => setPingInterval(Number(e.target.value))}
                className="px-2 py-1.5 text-sm bg-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                title="Ping interval"
              >
                {PING_INTERVALS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                onClick={pingAllHosts}
                disabled={isPinging || continuousPing}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded disabled:opacity-50"
                title="Ping once"
              >
                {isPinging ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {pingHosts.map(({ host }) => {
                const results = pingResults.get(host) || []
                const latest = results[results.length - 1]
                const avg = getAverageLatency(host)

                return (
                  <div
                    key={host}
                    className="p-3 rounded-lg bg-secondary/20 border border-border/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium truncate flex-1 mr-2">{host}</span>
                      <button
                        onClick={() => removeHost(host, 'ping')}
                        className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        {latest?.status === 'success' ? (
                          <CheckCircle className="w-3 h-3 text-green-400" />
                        ) : latest?.status === 'timeout' ? (
                          <Clock className="w-3 h-3 text-yellow-400" />
                        ) : latest?.status === 'error' ? (
                          <XCircle className="w-3 h-3 text-red-400" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className={getStatusColor(latest?.latency ?? null, latest?.status || '')}>
                          {latest?.latency != null ? `${latest.latency}ms` : latest?.status || 'Not tested'}
                        </span>
                      </div>
                      {avg !== null && (
                        <span className="text-muted-foreground">
                          Avg: {avg}ms
                        </span>
                      )}
                      {results.length > 0 && (
                        <span className="text-muted-foreground">
                          ({results.filter(r => r.status === 'success').length}/{results.length} ok)
                        </span>
                      )}
                    </div>

                    {/* Mini latency graph */}
                    {results.length > 1 && (
                      <div className="mt-2 flex items-end gap-0.5 h-6">
                        {results.slice(-10).map((r, i) => (
                          <div
                            key={i}
                            className={`flex-1 rounded-t ${
                              r.status === 'success' ? 'bg-green-500' :
                              r.status === 'timeout' ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{
                              height: r.latency ? `${Math.min(100, (r.latency / 500) * 100)}%` : '10%',
                              minHeight: '4px',
                            }}
                            title={`${r.latency || 'N/A'}ms`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {pingHosts.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No hosts configured. Add a host above.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ports tab */}
        {activeTab === 'ports' && (
          <div className="flex-1 flex flex-col">
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={hostInput}
                onChange={(e) => setHostInput(e.target.value)}
                placeholder="Host"
                className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="number"
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                placeholder="Port"
                className="w-20 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => addHost('port')}
                disabled={!hostInput.trim()}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-4 rounded-lg bg-secondary/20 border border-border/50 text-center">
                <Server className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  Port scanning requires backend support
                </p>
                <p className="text-xs text-muted-foreground">
                  Browser security prevents direct port checks.
                  A backend API endpoint would be needed for this feature.
                </p>

                {portHosts.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-muted-foreground">Saved port checks:</p>
                    {portHosts.map(({ host, port }) => (
                      <div key={`${host}:${port}`} className="flex items-center justify-between px-3 py-2 bg-secondary/30 rounded">
                        <span className="text-sm">{host}:{port}</span>
                        <button
                          onClick={() => removeHost(host, 'port', port)}
                          className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info tab */}
        {activeTab === 'info' && (
          <div className="flex-1 overflow-y-auto space-y-3">
            <div className="p-3 rounded-lg bg-secondary/20 border border-border/50">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Wifi className="w-4 h-4" />
                Connection Info
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={networkInfo.online ? 'text-green-400' : 'text-red-400'}>
                    {networkInfo.online ? 'Online' : 'Offline'}
                  </span>
                </div>
                {networkInfo.effectiveType && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Connection Type</span>
                    <span>{networkInfo.effectiveType.toUpperCase()}</span>
                  </div>
                )}
                {networkInfo.downlink !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Downlink</span>
                    <span>{networkInfo.downlink} Mbps</span>
                  </div>
                )}
                {networkInfo.rtt !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RTT</span>
                    <span>{networkInfo.rtt} ms</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-secondary/20 border border-border/50">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Browser Info
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User Agent</span>
                </div>
                <p className="text-xs text-muted-foreground break-all">
                  {navigator.userAgent}
                </p>
                <div className="flex justify-between mt-2">
                  <span className="text-muted-foreground">Language</span>
                  <span>{navigator.language}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform</span>
                  <span>{navigator.platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cookies Enabled</span>
                  <span>{navigator.cookieEnabled ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-xs text-blue-400">
                <strong>Note:</strong> Full network diagnostics (traceroute, DNS lookup, port scanning)
                require backend API support due to browser security restrictions.
              </p>
            </div>
          </div>
        )}
    </div>
  )
}
