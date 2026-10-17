import { Activity, Clock, Play, Square, Trash2, Plus, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PING_INTERVALS, getStatusColor } from '../NetworkUtils.constants'
import type { PingResult, SavedHost } from '../NetworkUtils.types'

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
