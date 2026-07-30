/* eslint-disable react-refresh/only-export-components */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Info, AlertCircle, FileText, Stethoscope,
  CheckCircle, XCircle, ChevronLeft, Layers, Server,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { TOUCH_TARGET_SIZE_CLASS } from '../../../lib/constants/ui'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useTranslation } from 'react-i18next'
import type { Violation, PolicySpec } from './usePolicyDrillDown'

export type TabType = 'overview' | 'violations' | 'spec' | 'ai'

export const POLICY_TABS: { id: TabType; label: string; icon: typeof Info }[] = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'violations', label: 'Violations', icon: AlertCircle },
  { id: 'spec', label: 'Policy Spec', icon: FileText },
  { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
]

// Policy status styles
export interface StatusStyle {
  bg: string
  text: string
  border: string
  icon: typeof CheckCircle
}

export function getStatusStyle(status: string): StatusStyle {
  const lower = status?.toLowerCase() || ''
  if (lower === 'active' || lower === 'ready' || lower === 'enforced') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'audit' || lower === 'warn') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: XCircle }
  }
  if (lower === 'failed' || lower === 'error' || lower === 'inactive') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  return { bg: 'bg-secondary', text: 'text-muted-foreground', border: 'border-border', icon: AlertCircle }
}

export function getTabsWithCount(violationCount: number): { id: TabType; label: string; icon: typeof Info }[] {
  return [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'violations', label: `Violations (${violationCount})`, icon: AlertCircle },
    { id: 'spec', label: 'Policy Spec', icon: FileText },
    { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
  ]
}

interface TabBarProps {
  activeTab: TabType
  tabs: { id: TabType; label: string; icon: typeof Info }[]
  onSelect: (tabId: TabType) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}

export function PolicyTabBar({ activeTab, tabs, onSelect, onKeyDown }: TabBarProps) {
  return (
    <div className="border-b border-border px-6" onKeyDown={onKeyDown}>
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={cn(
                cn('flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors', TOUCH_TARGET_SIZE_CLASS),
                activeTab === tab.id
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface HeaderProps {
  cluster: string
  namespace?: string
  policyType: string
  policyStatus: string
  statusStyle: StatusStyle
  canGoBack: boolean
  onBack: () => void
  onNamespaceClick?: () => void
  onClusterClick: () => void
}

export function PolicyDrillDownHeader({
  cluster,
  namespace,
  policyType,
  policyStatus,
  statusStyle,
  canGoBack,
  onBack,
  onNamespaceClick,
  onClusterClick,
}: HeaderProps) {
  const { t } = useTranslation()
  const StatusIcon = statusStyle.icon

  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          {canGoBack && (
            <button onClick={onBack} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors min-h-11 min-w-11 px-2 py-2">
              <ChevronLeft className="w-4 h-4" />
              {t('drilldown.goBack', 'Back')}
            </button>
          )}
          {namespace && onNamespaceClick && (
            <button
              onClick={onNamespaceClick}
              className={cn('group flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 transition-all hover:border-purple-500/30 hover:bg-purple-500/10', TOUCH_TARGET_SIZE_CLASS)}
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
              <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
              <svg className="w-3 h-3 text-purple-400/70 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          <button
            onClick={onClusterClick}
            className={cn('group flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 transition-all hover:border-blue-500/30 hover:bg-blue-500/10', TOUCH_TARGET_SIZE_CLASS)}
          >
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
            <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
            <svg className="w-3 h-3 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{policyType === 'kyverno' ? 'Kyverno' : 'OPA'}</span>
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', statusStyle.bg, statusStyle.text, 'border', statusStyle.border)}>
            <StatusIcon className="w-3 h-3" />
            {policyStatus}
          </span>
        </div>
      </div>
    </div>
  )
}

interface ViolationRowProps {
  violation: Violation
  onClick?: () => void
}

export function ViolationRow({ violation, onClick }: ViolationRowProps) {
  const isClickable = violation.kind === 'Pod' && violation.namespace
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10',
        isClickable && 'cursor-pointer hover:bg-red-500/20 transition-colors'
      )}
    >
      <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{violation.kind}/{violation.resource}</span>
          {violation.namespace && (
            <span className="text-xs text-muted-foreground">in {violation.namespace}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{violation.message}</p>
        {violation.timestamp && (
          <span className="text-xs text-muted-foreground">{violation.timestamp}</span>
        )}
      </div>
      {isClickable && (
        <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  )
}

interface PolicyRulesListProps {
  rules: NonNullable<PolicySpec['rules']>
}

export function PolicyRulesList({ rules }: PolicyRulesListProps) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card/50">
      <h4 className="text-sm font-medium text-foreground mb-3">Rules ({rules.length})</h4>
      <div className="space-y-2">
        {rules.map((rule, i) => (
          <div key={i} className="p-3 rounded-lg bg-secondary/50 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{rule.name}</span>
            <div className="flex gap-2">
              {rule.validate && (
                <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">Validate</span>
              )}
              {rule.mutate && (
                <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">Mutate</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
