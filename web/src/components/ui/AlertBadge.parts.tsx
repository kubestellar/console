import { AlertTriangle, Bell, CheckCircle, CheckSquare, ChevronRight, Clock, ExternalLink, MinusSquare, Search, Server, Square, X } from 'lucide-react'
import type { TFunction } from 'i18next'
import { CardAIActions } from '../../lib/cards/CardComponents'
import { formatTimeAgo } from '../../lib/formatters'
import { getSeverityIcon, type AlertSeverity, type AlertStats } from '../../types/alerts'
import type { GroupedAlert } from '../../lib/alerts/groupAlertsForDisplay'
import type { Mission } from '../../hooks/useMissions'
import { cn } from '../../lib/cn'
import { getAlertBadgeCountColor, getAlertBadgeTriggerTextColor, ALERT_BADGE_VARIANT_MAP } from './AlertBadge.variants'
import { Button } from './Button'
import { Input } from './Input'
import { VirtualizedList } from './VirtualizedList'

const ALERT_BADGE_ROW_ESTIMATED_HEIGHT_PX = 144
const ALERT_BADGE_OVERSCAN_COUNT = 8

type TranslateFn = TFunction

export interface AlertBadgeTriggerButtonProps {
  stats: AlertStats
  onToggle: () => void
  renderCount: (value: number) => React.ReactNode
}

export function AlertBadgeTriggerButton({ stats, onToggle, renderCount }: AlertBadgeTriggerButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid="navbar-alerts-btn"
      onClick={onToggle}
      className={cn('relative p-2 w-9 h-9', getAlertBadgeTriggerTextColor(stats))}
      title={stats.firing > 0 ? `${stats.firing} active alerts` : 'No active alerts'}
      aria-label={stats.firing > 0 ? `${stats.firing} active alerts` : 'No active alerts'}
    >
      <Bell className="w-5 h-5" />
      {stats.firing > 0 && (
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-2xs font-bold text-white rounded-full overflow-hidden',
            getAlertBadgeCountColor(stats),
          )}
        >
          {renderCount(stats.firing)}
        </span>
      )}
    </Button>
  )
}

export interface AlertBadgeRowProps {
  alert: GroupedAlert
  mission: Mission | null
  groupSelected: boolean
  onAlertClick: (alert: GroupedAlert) => void
  onToggleAlertSelection: (event: React.MouseEvent, alertIds: string[]) => void
  onAcknowledge: (event: React.MouseEvent, alertIds: string[]) => void
  onOpenMission: (event: React.MouseEvent, alert: GroupedAlert) => void
  onDiagnose: (event: React.MouseEvent | React.KeyboardEvent<HTMLDivElement>, alertId: string) => void
  t: TranslateFn
}

export function AlertBadgeRow({
  alert,
  mission,
  groupSelected,
  onAlertClick,
  onToggleAlertSelection,
  onAcknowledge,
  onOpenMission,
  onDiagnose,
  t,
}: AlertBadgeRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`View ${alert.severity} alert: ${alert.ruleName}`}
      onClick={() => onAlertClick(alert)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onAlertClick(alert)
        }
      }}
      className="border-b border-border/50 p-3 transition-colors group hover:bg-secondary/30 cursor-pointer"
    >
      <div className="flex items-start gap-2">
        {!alert.acknowledgedAt && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => onToggleAlertSelection(event, alert.alertIds)}
            className="mt-0.5 p-0"
            title={groupSelected ? 'Deselect' : 'Select'}
            aria-label={groupSelected ? `Deselect alert: ${alert.ruleName}` : `Select alert: ${alert.ruleName}`}
            icon={groupSelected ? (
              <CheckSquare className="w-4 h-4 text-purple-400" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          />
        )}

        <span
          className="text-lg"
          title={`${alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)} severity`}
          aria-label={`${alert.severity} severity`}
        >
          {getSeverityIcon(alert.severity)}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{alert.ruleName}</span>
            {alert.duplicateCount > 1 && (
              <span className="shrink-0 rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t('activeAlerts.duplicateCount', { ns: 'cards', count: alert.duplicateCount })}
              </span>
            )}
          </div>

          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{alert.message}</div>

          <div className="flex items-center gap-3 mt-1">
            {alert.cluster && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Server className="w-3 h-3" />
                {alert.cluster}
              </span>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(alert.firedAt)}
            </span>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="mt-2 flex items-center gap-2">
        {!alert.acknowledgedAt && (
          <Button
            variant="secondary"
            size="sm"
            onClick={(event) => onAcknowledge(event, alert.alertIds)}
            className="rounded-md"
          >
            Acknowledge
          </Button>
        )}

        {mission ? (
          <Button
            variant="accent"
            size="sm"
            onClick={(event) => onOpenMission(event, alert)}
            className="rounded-md"
            icon={<ExternalLink className="w-3 h-3" />}
          >
            View Diagnosis
          </Button>
        ) : (
          <CardAIActions
            resource={{ kind: 'Alert', name: alert.ruleName, cluster: alert.cluster, status: alert.severity }}
            issues={[{ name: alert.ruleName, message: alert.message }]}
            showRepair={false}
            onDiagnose={(event) => onDiagnose(event, alert.id)}
          />
        )}

        {alert.acknowledgedAt && (
          <span className="flex items-center gap-1 px-2 py-1 text-xs text-green-400">
            <CheckCircle className="w-3 h-3" />
            Acknowledged
          </span>
        )}
      </div>
    </div>
  )
}

export interface AlertBadgeDropdownProps {
  isOpen: boolean
  isMobile: boolean
  dropdownRef: React.RefObject<HTMLDivElement | null>
  stats: AlertStats
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  severityFilter: AlertSeverity | 'all'
  onSeverityFilterChange: (value: AlertSeverity | 'all') => void
  displayedAlerts: GroupedAlert[]
  unacknowledgedDisplayedIds: string[]
  allSelected: boolean
  someSelected: boolean
  selectedCount: number
  close: () => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onAcknowledgeSelected: () => void
  getMissionForAlert: (alert: GroupedAlert) => Mission | null
  isGroupSelected: (alertIds: string[]) => boolean
  onAlertClick: (alert: GroupedAlert) => void
  onToggleAlertSelection: (event: React.MouseEvent, alertIds: string[]) => void
  onAcknowledge: (event: React.MouseEvent, alertIds: string[]) => void
  onOpenMission: (event: React.MouseEvent, alert: GroupedAlert) => void
  onDiagnose: (event: React.MouseEvent | React.KeyboardEvent<HTMLDivElement>, alertId: string) => void
  onOpenAlertsDashboard: () => void
  t: TranslateFn
}

export function AlertBadgeDropdown({
  isOpen,
  isMobile,
  dropdownRef,
  stats,
  searchQuery,
  onSearchQueryChange,
  severityFilter,
  onSeverityFilterChange,
  displayedAlerts,
  unacknowledgedDisplayedIds,
  allSelected,
  someSelected,
  selectedCount,
  close,
  onSelectAll,
  onDeselectAll,
  onAcknowledgeSelected,
  getMissionForAlert,
  isGroupSelected,
  onAlertClick,
  onToggleAlertSelection,
  onAcknowledge,
  onOpenMission,
  onDiagnose,
  onOpenAlertsDashboard,
  t,
}: AlertBadgeDropdownProps) {
  if (!isOpen) return null

  return (
    <>
      {isMobile && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-overlay"
          aria-hidden="true"
          onClick={close}
        />
      )}

      <div
        ref={dropdownRef}
        data-testid="navbar-alerts-dropdown"
        role="dialog"
        aria-label="Active Alerts"
        aria-modal={isMobile}
        className={cn(
          isMobile
            ? 'fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[70vh]'
            : 'absolute right-0 top-full mt-2 w-96 rounded-lg',
          'bg-background border border-border shadow-xl z-toast',
        )}
      >
        {isMobile && (
          <div className="flex justify-center py-2">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>
        )}

        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stats.firing > 0 ? (
              <AlertTriangle className="w-4 h-4 text-orange-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )}
            <span className="font-medium text-foreground">Active Alerts</span>
            {stats.firing > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-secondary text-muted-foreground">
                {stats.firing}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={close}
            className="p-1"
            aria-label="Close alert panel"
            icon={<X className="w-4 h-4" />}
          />
        </div>

        {stats.firing > 0 && (
          <div className="p-2 border-b border-border">
            <Input
              type="text"
              inputSize="sm"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder={t('common.searchAlerts')}
              leadingIcon={<Search className="h-3.5 w-3.5" />}
              className="bg-secondary/50"
            />
          </div>
        )}

        {stats.firing > 0 && (
          <div className="p-2 border-b border-border flex items-center gap-2">
            <Button
              variant={severityFilter === 'all' ? 'accent' : 'ghost'}
              size="sm"
              onClick={() => onSeverityFilterChange('all')}
            >
              All ({stats.firing})
            </Button>

            {(['critical', 'warning', 'info'] as AlertSeverity[]).map((severity) => (
              <Button
                key={severity}
                variant="ghost"
                size="sm"
                onClick={() => onSeverityFilterChange(severity)}
                aria-label={`Filter by ${severity} alerts (${stats[severity]})`}
                className={severityFilter === severity
                  ? ALERT_BADGE_VARIANT_MAP[severity].filterActiveClassName
                  : ''}
                icon={<span className={cn('w-2 h-2 rounded-full', ALERT_BADGE_VARIANT_MAP[severity].filterDotClassName)} />}
              >
                {stats[severity]}
              </Button>
            ))}
          </div>
        )}

        {unacknowledgedDisplayedIds.length > 0 && (
          <div className="p-2 border-b border-border flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={allSelected ? onDeselectAll : onSelectAll}
              title={allSelected ? 'Deselect all' : 'Select all'}
              icon={allSelected ? (
                <CheckSquare className="w-4 h-4 text-purple-400" />
              ) : someSelected ? (
                <MinusSquare className="w-4 h-4 text-purple-400" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </Button>

            {selectedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onAcknowledgeSelected}
                className="bg-green-500/20 hover:bg-green-500/30 text-green-400"
                icon={<CheckCircle className="w-3 h-3" />}
              >
                Ack {selectedCount}
              </Button>
            )}
          </div>
        )}

        {displayedAlerts.length === 0 ? (
          <div className="max-h-64 overflow-y-auto scroll-enhanced">
            <div className="p-6 text-center text-muted-foreground">
              {stats.firing === 0 ? (
                <>
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <div className="text-sm text-foreground">No Active Alerts</div>
                  <div className="text-xs">All systems are operating normally</div>
                </>
              ) : (
                <>
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <div className="text-sm">No alerts match your filters</div>
                </>
              )}
            </div>
          </div>
        ) : (
          <VirtualizedList
            items={displayedAlerts}
            estimateSize={() => ALERT_BADGE_ROW_ESTIMATED_HEIGHT_PX}
            overscan={ALERT_BADGE_OVERSCAN_COUNT}
            className="max-h-64 overflow-y-auto scroll-enhanced"
            getItemKey={(alert) => `${alert.id}-${alert.duplicateCount}`}
            renderItem={(alert) => (
              <AlertBadgeRow
                alert={alert}
                mission={getMissionForAlert(alert)}
                groupSelected={isGroupSelected(alert.alertIds)}
                onAlertClick={onAlertClick}
                onToggleAlertSelection={onToggleAlertSelection}
                onAcknowledge={onAcknowledge}
                onOpenMission={onOpenMission}
                onDiagnose={onDiagnose}
                t={t}
              />
            )}
          />
        )}

        <div className="p-2 border-t border-border text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenAlertsDashboard}
            className="text-purple-400 hover:text-purple-300"
          >
            Open Alerts Dashboard
          </Button>
        </div>
      </div>
    </>
  )
}
