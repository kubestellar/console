import { memo, type RefObject } from 'react'

// Split helper component; parent card owns useCardLoadingState.
import { BellOff, CheckCircle, ChevronRight, Cpu, HardDrive, Server, Wifi, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CardAIActions, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { ClusterBadge } from '../ui/ClusterBadge'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { StatusBadge } from '../ui/StatusBadge'
import { CARD_UI_STRINGS } from './strings'
import { formatSnoozeRemaining, SNOOZE_DURATIONS, type SnoozeDuration } from '../../hooks/useSnoozedAlerts'
import type { DeviceAlert, NodeDeviceInventory } from '../../hooks/useCachedData'
import type { ViewMode } from './HardwareHealthCard.types'
import { DeviceIcon, extractHostname, getDeviceLabel, getTotalDevices } from './HardwareHealthCard.utils'
import { cn } from '../../lib/cn'

interface HardwareHealthCardContentProps {
  viewMode: ViewMode
  paginatedAlerts: DeviceAlert[]
  sortedAlerts: DeviceAlert[]
  paginatedInventory: NodeDeviceInventory[]
  sortedInventory: NodeDeviceInventory[]
  search: string
  localClusterFilter: string[]
  drillToNode: (cluster: string, nodeName: string, options?: { issue?: string }) => void
  isSnoozed: (alertId: string) => boolean
  unsnoozeAlert: (alertId: string) => void
  getSnoozeRemaining: (alertId: string) => number | null
  snoozeMenuOpen: string | null
  setSnoozeMenuOpen: (alertId: string | null) => void
  snoozeMenuRef: RefObject<HTMLDivElement | null>
  snoozeAlert: (alertId: string, duration: SnoozeDuration) => void
  clearAlert: (alertId: string) => void
  currentPage: number
  currentTotalPages: number
  currentTotalItems: number
  effectivePerPage: number
  setCurrentPage: (page: number) => void
  currentNeedsPagination: boolean
  isRefreshing: boolean
  isDemoFallback: boolean
  lastUpdate: Date | null
}

export const HardwareHealthCardContent = memo(function HardwareHealthCardContent({
  viewMode,
  paginatedAlerts,
  sortedAlerts,
  paginatedInventory,
  sortedInventory,
  search,
  localClusterFilter,
  drillToNode,
  isSnoozed,
  unsnoozeAlert,
  getSnoozeRemaining,
  snoozeMenuOpen,
  setSnoozeMenuOpen,
  snoozeMenuRef,
  snoozeAlert,
  clearAlert,
  currentPage,
  currentTotalPages,
  currentTotalItems,
  effectivePerPage,
  setCurrentPage,
  currentNeedsPagination,
  isRefreshing,
  isDemoFallback,
  lastUpdate,
}: HardwareHealthCardContentProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <>
      <div className="flex-1 space-y-1.5 overflow-y-auto mb-2">
        {viewMode === 'alerts' ? (
          <>
            {paginatedAlerts.map(alert => (
              <div key={alert.id} className={cn('p-2 rounded text-xs transition-colors group', alert.severity === 'critical' ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-yellow-500/10 hover:bg-yellow-500/20')}>
                <div className="flex items-start justify-between gap-1">
                  <div
                    className="min-w-0 flex items-start gap-2 flex-1 cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
                    role="button"
                    tabIndex={0}
                    aria-label={t('cards:hardwareHealth.viewAlertAria', { nodeName: extractHostname(alert.nodeName), cluster: alert.cluster, device: getDeviceLabel(alert.deviceType) })}
                    onClick={() => drillToNode(alert.cluster, alert.nodeName, { issue: `${getDeviceLabel(alert.deviceType)} disappeared: ${alert.previousCount} → ${alert.currentCount}` })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        drillToNode(alert.cluster, alert.nodeName, { issue: `${getDeviceLabel(alert.deviceType)} disappeared: ${alert.previousCount} → ${alert.currentCount}` })
                      }
                    }}
                  >
                    <DeviceIcon deviceType={alert.deviceType} className={cn('w-4 h-4 shrink-0 mt-0.5', alert.severity === 'critical' ? 'text-red-400' : 'text-yellow-400')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground break-all">{extractHostname(alert.nodeName)}</span>
                        <span className={cn('shrink-0 px-1 py-0.5 text-[9px] font-medium rounded', alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400')}>{getDeviceLabel(alert.deviceType)}</span>
                        <ClusterBadge cluster={alert.cluster} size="sm" />
                      </div>
                      <div className={cn('truncate mt-0.5', alert.severity === 'critical' ? 'text-red-400' : 'text-yellow-400')}>
                        {alert.previousCount} → {alert.currentCount} ({alert.droppedCount} disappeared)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <CardAIActions
                      resource={{ kind: 'HardwareDevice', name: alert.nodeName, cluster: alert.cluster, status: alert.severity }}
                      issues={[{ name: `${getDeviceLabel(alert.deviceType)} disappeared`, message: `${alert.previousCount} → ${alert.currentCount} (${alert.droppedCount} disappeared)` }]}
                    />
                    {isSnoozed(alert.id) ? (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          unsnoozeAlert(alert.id)
                        }}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-yellow-400 bg-yellow-500/20 hover:bg-yellow-500/30 transition-colors"
                        title={CARD_UI_STRINGS.hardwareHealth.clickToUnsnooze}
                        aria-label={t('cards:hardwareHealth.unsnoozeAlertAria')}
                      >
                        <BellOff className="w-3 h-3" />
                        <span className="text-2xs font-medium">{formatSnoozeRemaining(getSnoozeRemaining(alert.id) || 0)}</span>
                      </button>
                    ) : (
                      <div className="relative" ref={snoozeMenuOpen === alert.id ? snoozeMenuRef : undefined}>
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setSnoozeMenuOpen(snoozeMenuOpen === alert.id ? null : alert.id)
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          title={CARD_UI_STRINGS.hardwareHealth.snoozeAlert}
                          aria-label={t('cards:hardwareHealth.snoozeAlertAria')}
                        >
                          <BellOff className="w-3 h-3" />
                        </button>
                        {snoozeMenuOpen === alert.id && (
                          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[100px]">
                            {(Object.keys(SNOOZE_DURATIONS) as SnoozeDuration[]).map(duration => (
                              <button
                                key={duration}
                                onClick={e => {
                                  e.stopPropagation()
                                  snoozeAlert(alert.id, duration)
                                  setSnoozeMenuOpen(null)
                                }}
                                className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted/50 transition-colors"
                                aria-label={t('cards:hardwareHealth.snoozeForAria', { duration })}
                              >
                                {duration}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        clearAlert(alert.id)
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      title={CARD_UI_STRINGS.hardwareHealth.clearAlertAfterPowerCycle}
                      aria-label={t('cards:hardwareHealth.clearAlertAria')}
                    >
                      <XCircle className="w-3 h-3" />
                    </button>
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                </div>
              </div>
            ))}

            {sortedAlerts.length === 0 && (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
                <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
                {search || localClusterFilter.length > 0 ? CARD_UI_STRINGS.hardwareHealth.noMatchingAlerts : CARD_UI_STRINGS.hardwareHealth.allHardwareDevicesHealthy}
              </div>
            )}
          </>
        ) : (
          <>
            {paginatedInventory.map(node => (
              <div
                key={`${node.cluster}/${node.nodeName}`}
                className="p-2 rounded text-xs transition-colors group bg-muted/20 hover:bg-muted/40 cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400"
                role="button"
                tabIndex={0}
                aria-label={t('cards:hardwareHealth.viewNodeAria', { nodeName: extractHostname(node.nodeName), cluster: node.cluster })}
                onClick={() => drillToNode(node.cluster, node.nodeName)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    drillToNode(node.cluster, node.nodeName)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex items-start gap-2 flex-1">
                    <Server className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground break-all">{extractHostname(node.nodeName)}</span>
                        <ClusterBadge cluster={node.cluster} size="sm" />
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {node.devices.gpuCount > 0 && <span className="flex items-center gap-1 text-2xs text-muted-foreground"><Cpu className="w-3 h-3 text-green-400" />{node.devices.gpuCount} GPU</span>}
                        {node.devices.nicCount > 0 && <span className="flex items-center gap-1 text-2xs text-muted-foreground"><Wifi className="w-3 h-3 text-blue-400" />{node.devices.nicCount} NIC</span>}
                        {node.devices.nvmeCount > 0 && <span className="flex items-center gap-1 text-2xs text-muted-foreground"><HardDrive className="w-3 h-3 text-purple-400" />{node.devices.nvmeCount} NVMe</span>}
                        {node.devices.infinibandCount > 0 && <span className="flex items-center gap-1 text-2xs text-muted-foreground"><Wifi className="w-3 h-3 text-orange-400" />{node.devices.infinibandCount} IB</span>}
                        {node.devices.sriovCapable && <StatusBadge color="blue" size="xs">{CARD_UI_STRINGS.hardwareHealth.badgeLabels.sriov}</StatusBadge>}
                        {node.devices.rdmaAvailable && <StatusBadge color="purple" size="xs">{CARD_UI_STRINGS.hardwareHealth.badgeLabels.rdma}</StatusBadge>}
                        {node.devices.mellanoxPresent && <StatusBadge color="orange" size="xs">{CARD_UI_STRINGS.hardwareHealth.badgeLabels.mellanox}</StatusBadge>}
                        {node.devices.mofedReady && <StatusBadge color="green" size="xs">{CARD_UI_STRINGS.hardwareHealth.badgeLabels.mofed}</StatusBadge>}
                        {node.devices.gpuDriverReady && <StatusBadge color="green" size="xs">{CARD_UI_STRINGS.hardwareHealth.badgeLabels.gpuDriver}</StatusBadge>}
                        {getTotalDevices(node.devices) === 0 && (
                          <span className="text-2xs text-muted-foreground italic" title={t('cards:hardwareHealth.noDevicesExplanation')}>
                            {t('cards:hardwareHealth.noDevicesDetected')}
                            <span className="block text-muted-foreground/60 mt-0.5">{t('cards:hardwareHealth.noDevicesExplanation')}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                </div>
              </div>
            ))}

            {sortedInventory.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground py-8">
                <Server className="w-6 h-6 mb-2 text-muted-foreground/50" />
                {search || localClusterFilter.length > 0 ? CARD_UI_STRINGS.hardwareHealth.noMatchingNodes : CARD_UI_STRINGS.hardwareHealth.noNodesTrackedYet}
                <span className="text-xs mt-1">{CARD_UI_STRINGS.hardwareHealth.waitingForDeviceScan}</span>
              </div>
            )}
          </>
        )}
      </div>

      <CardPaginationFooter currentPage={currentPage} totalPages={currentTotalPages} totalItems={currentTotalItems} itemsPerPage={effectivePerPage} onPageChange={setCurrentPage} needsPagination={currentNeedsPagination} />

      <div className="mt-2 flex items-center justify-center">
        <RefreshIndicator isRefreshing={isRefreshing} lastUpdated={isDemoFallback ? null : lastUpdate} size="sm" showLabel={true} staleThresholdMinutes={5} />
      </div>
    </>
  )
})
