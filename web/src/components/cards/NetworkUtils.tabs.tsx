import {
  Activity, Globe, Server, Wifi, WifiOff, Clock,
  Play, Square, Trash2, Plus, CheckCircle, XCircle,
  AlertTriangle, Loader2
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PING_INTERVALS, getStatusColor } from './NetworkUtils.constants'
import type { PingResult, SavedHost, NetworkInfo, NetworkUtilsTab } from './NetworkUtils.types'

export function NetworkStatusBar({ networkInfo }: { networkInfo: NetworkInfo }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3 p-2 rounded-lg bg-secondary/30">
      <div className="flex items-center gap-2">
        {networkInfo.online ? (
          <Wifi className="w-4 h-4 text-green-400" />
        ) : (
          <WifiOff className="w-4 h-4 text-red-400" />
        )}
        <span className={`text-sm ${networkInfo.online ? 'text-green-400' : 'text-red-400'}`}>
          {networkInfo.online ? t('networkUtils.online') : t('networkUtils.offline')}
        </span>
      </div>
      {networkInfo.effectiveType && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{networkInfo.effectiveType.toUpperCase()}</span>
          {networkInfo.downlink && <span>{networkInfo.downlink} Mbps</span>}
          {networkInfo.rtt && <span>{t('networkUtils.rtt')}: {networkInfo.rtt}ms</span>}
        </div>
      )}
    </div>
  )
}

export function NetworkUtilsTabBar({
  activeTab,
  setActiveTab,
}: {
  activeTab: NetworkUtilsTab
  setActiveTab: (tab: NetworkUtilsTab) => void
}) {
  const { t } = useTranslation()
  return (
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
          {t(`networkUtils.${tab}`)}
        </button>
      ))}
    </div>
  )
}

interface PingTabProps {
  hostInput: string
  setHostInput: (value: string) => void
  addHost: (type: 'ping' | 'port') => void
  continuousPing: boolean
  setContinuousPing: (value: boolean) => void
  pingInterval: number
  setPingInterval: (value: number) => void
  pingAllHosts: () => void
  isPinging: boolean
  pingHosts: SavedHost[]
  pingResults: Map<string, PingResult[]>
  getAverageLatency: (host: string) => number | null
  removeHost: (host: string, type: 'ping' | 'port', port?: number) => void
}

export function PingTab({
  hostInput,
  setHostInput,
  addHost,
  continuousPing,
  setContinuousPing,
  pingInterval,
  setPingInterval,
  pingAllHosts,
  isPinging,
  pingHosts,
  pingResults,
  getAverageLatency,
  removeHost,
}: PingTabProps) {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col">
      {/* Controls */}
      <div className="flex gap-2 mb-3">
        {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from NetworkUtils.tsx (pre-existing baselined violation) */}
        <input
          type="text"
          value={hostInput}
          onChange={(e) => setHostInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addHost('ping')}
          placeholder={t('networkUtils.hostOrUrl')}
          className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary"
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
          disabled={!continuousPing && pingHosts.length === 0}
          className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            continuousPing
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
          }`}
          title={pingHosts.length === 0 ? t('networkUtils.noHostsWarning') : undefined}
        >
          {continuousPing ? (
            <>
              <Square className="w-4 h-4" />
              {t('networkUtils.stop')}
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              {t('networkUtils.start')}
            </>
          )}
        </button>
        {/* Ping interval selector */}
        {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from NetworkUtils.tsx (pre-existing baselined violation) */}
        <select
          value={pingInterval}
          onChange={(e) => setPingInterval(Number(e.target.value))}
          className="px-2 py-1.5 text-sm bg-secondary border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary"
          title={t('networkUtils.pingInterval')}
        >
          {PING_INTERVALS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={pingAllHosts}
          disabled={isPinging || continuousPing || pingHosts.length === 0}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded disabled:opacity-50"
          title={t('networkUtils.pingOnce')}
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
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
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
                    {latest?.latency != null ? `${latest.latency}ms` : latest?.status || t('networkUtils.notTested')}
                  </span>
                </div>
                {avg !== null && (
                  <span className="text-muted-foreground">
                    {t('networkUtils.avgLatency', { avg })}
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
                      className={`flex-1 rounded-t min-h-1 ${
                        r.status === 'success' ? 'bg-green-500' :
                        r.status === 'timeout' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{
                        height: r.latency ? `${Math.min(100, (r.latency / 500) * 100)}%` : '10%' }}
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
            {t('networkUtils.noHosts')}
          </div>
        )}
      </div>
    </div>
  )
}

interface PortsTabProps {
  hostInput: string
  setHostInput: (value: string) => void
  portInput: string
  setPortInput: (value: string) => void
  addHost: (type: 'ping' | 'port') => void
  portHosts: SavedHost[]
  removeHost: (host: string, type: 'ping' | 'port', port?: number) => void
}

export function PortsTab({
  hostInput,
  setHostInput,
  portInput,
  setPortInput,
  addHost,
  portHosts,
  removeHost,
}: PortsTabProps) {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex gap-2 mb-3">
        {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from NetworkUtils.tsx (pre-existing baselined violation) */}
        <input
          type="text"
          value={hostInput}
          onChange={(e) => setHostInput(e.target.value)}
          placeholder={t('networkUtils.host')}
          className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
        {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from NetworkUtils.tsx (pre-existing baselined violation) */}
        <input
          type="number"
          value={portInput}
          onChange={(e) => setPortInput(e.target.value)}
          placeholder={t('networkUtils.port')}
          className="w-20 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary"
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
            {t('networkUtils.portScanTitle')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('networkUtils.portScanBrowserSecurity')}
          </p>

          {portHosts.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">{t('networkUtils.savedPortChecks')}</p>
              {portHosts.map(({ host, port }) => (
                <div key={`${host}:${port}`} className="flex flex-wrap items-center justify-between gap-y-2 px-3 py-2 bg-secondary/30 rounded">
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
  )
}

export function InfoTab({ networkInfo }: { networkInfo: NetworkInfo }) {
  const { t } = useTranslation()
  return (
    <div className="flex-1 overflow-y-auto space-y-3">
      <div className="p-3 rounded-lg bg-secondary/20 border border-border/50">
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Wifi className="w-4 h-4" />
          {t('networkUtils.connectionInfo')}
        </h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('common.status')}</span>
            <span className={networkInfo.online ? 'text-green-400' : 'text-red-400'}>
              {networkInfo.online ? t('networkUtils.online') : t('networkUtils.offline')}
            </span>
          </div>
          {networkInfo.effectiveType && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('networkUtils.connectionType')}</span>
              <span>{networkInfo.effectiveType.toUpperCase()}</span>
            </div>
          )}
          {networkInfo.downlink !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('networkUtils.downlink')}</span>
              <span>{networkInfo.downlink} Mbps</span>
            </div>
          )}
          {networkInfo.rtt !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('networkUtils.rtt')}</span>
              <span>{networkInfo.rtt} ms</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-secondary/20 border border-border/50">
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Globe className="w-4 h-4" />
          {t('networkUtils.browserInfo')}
        </h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('networkUtils.userAgent')}</span>
          </div>
          <p className="text-xs text-muted-foreground break-all">
            {typeof navigator !== 'undefined' ? navigator.userAgent : ''}
          </p>
          <div className="flex justify-between mt-2">
            <span className="text-muted-foreground">{t('networkUtils.language')}</span>
            <span>{typeof navigator !== 'undefined' ? navigator.language : ''}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('networkUtils.platform')}</span>
            <span>{navigator.platform}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('networkUtils.cookiesEnabled')}</span>
            <span>{navigator.cookieEnabled ? t('networkUtils.yes') : t('networkUtils.no')}</span>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
        <p className="text-xs text-blue-400">
          <strong>Note:</strong> {t('networkUtils.diagnosticsNote')}
        </p>
      </div>
    </div>
  )
}
