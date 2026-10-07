export interface PingResult {
  host: string
  latency: number | null
  status: 'success' | 'timeout' | 'error'
  timestamp: Date
  statusCode?: number
  error?: string
}

export interface SavedHost {
  host: string
  type: 'ping' | 'port'
  port?: number
}

export interface NetworkInfo {
  online: boolean
  effectiveType?: string
  downlink?: number
  rtt?: number
}

// Extend Navigator type for Network Information API
export interface NetworkInformation extends EventTarget {
  effectiveType?: string
  downlink?: number
  rtt?: number
  addEventListener(type: 'change', listener: EventListener): void
  removeEventListener(type: 'change', listener: EventListener): void
}

export interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation
}

export type NetworkUtilsTab = 'ping' | 'ports' | 'info'
