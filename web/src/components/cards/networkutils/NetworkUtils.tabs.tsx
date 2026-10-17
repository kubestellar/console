import { Activity, Globe, Server, Wifi, WifiOff, Trash2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SavedHost, NetworkInfo, NetworkUtilsTab } from '../NetworkUtils.types'
export { PingTab } from './NetworkUtilsPingTab'

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
