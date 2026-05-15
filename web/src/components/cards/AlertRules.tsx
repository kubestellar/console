import { useState, useRef, useEffect } from 'react'
import {
  Plus,
  Bell,
  BellOff,
  Trash2,
  Pencil,
} from 'lucide-react'
import { useAlertRules } from '../../hooks/useAlerts'
import { formatCondition, ALERT_SEVERITY_ORDER } from '../../types/alerts'
import type { AlertRule, AlertSeverity } from '../../types/alerts'
import { Button } from '../ui/Button'
import { AlertRuleEditor } from '../alerts/AlertRuleEditor'
import { StatusBadge } from '../ui/StatusBadge'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'

type SortField = 'name' | 'severity' | 'enabled'
type SortTranslationKey = 'alertRules.sortName' | 'alertRules.sortSeverity' | 'alertRules.sortStatus'

const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortField; labelKey: SortTranslationKey }> = [
  { value: 'name' as const, labelKey: 'alertRules.sortName' },
  { value: 'severity' as const, labelKey: 'alertRules.sortSeverity' },
  { value: 'enabled' as const, labelKey: 'alertRules.sortStatus' },
]

const ALERT_SORT_COMPARATORS = {
  name: commonComparators.string<AlertRule>('name'),
  severity: (a: AlertRule, b: AlertRule) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity],
  enabled: (a: AlertRule, b: AlertRule) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0),
}

export function AlertRulesCard() {
  const { t } = useTranslation('cards')
  const { rules, createRule, updateRule, toggleRule, deleteRule } = useAlertRules()
  const [showEditor, setShowEditor] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | undefined>(undefined)
  const { isDemoMode } = useDemoMode()

  // Report state to CardWrapper (local storage rules are always available)
  useCardLoadingState({
    isLoading: false,
    isRefreshing: false,
    hasAnyData: true,
    isDemoData: isDemoMode,
  })

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: displayedRules,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
    containerRef,
    containerStyle,
  } = useCardData<AlertRule, SortField>(rules, {
    filter: {
      searchFields: ['name', 'severity'],
      customPredicate: (rule, query) =>
        formatCondition(rule.condition).toLowerCase().includes(query),
      storageKey: 'alert-rules',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: ALERT_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // Translated sort options
  const sortOptions = SORT_OPTIONS_KEYS.map(o => ({ value: o.value, label: t(o.labelKey) as string }))

  // Count enabled rules
  const enabledCount = rules.filter(r => r.enabled).length

  // Severity indicator
  const SeverityIndicator = ({ severity }: { severity: AlertSeverity }) => {
    const colors: Record<AlertSeverity, string> = {
      critical: 'bg-red-500',
      warning: 'bg-orange-500',
      info: 'bg-blue-500',
    }

    return (
      <span
        className={`w-2 h-2 rounded-full ${colors[severity]}`}
        title={severity}
      />
    )
  }

  const handleToggle = (e: React.MouseEvent, ruleId: string) => {
    e.stopPropagation()
    toggleRule(ruleId)
  }

  // Two-click delete: first click shows "Confirm?", second click deletes (#5591)
  const DELETE_CONFIRM_TIMEOUT_MS = 3000
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(deleteTimerRef.current), [])

  const handleDelete = (e: React.MouseEvent, ruleId: string) => {
    e.stopPropagation()
    if (pendingDeleteId === ruleId) {
      // Second click — confirmed
      clearTimeout(deleteTimerRef.current)
      setPendingDeleteId(null)
      deleteRule(ruleId)
    } else {
      // First click — enter confirm state with auto-reset
      setPendingDeleteId(ruleId)
      clearTimeout(deleteTimerRef.current)
      deleteTimerRef.current = setTimeout(
        () => setPendingDeleteId(prev => prev === ruleId ? null : prev),
        DELETE_CONFIRM_TIMEOUT_MS
      )
    }
  }

  const handleEdit = (e: React.MouseEvent, rule: AlertRule) => {
    e.stopPropagation()
    setEditingRule(rule)
    setShowEditor(true)
  }

  const handleCreateNew = () => {
    setEditingRule(undefined)
    setShowEditor(true)
  }

  const handleSave = (ruleData: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingRule) {
      updateRule(editingRule.id, ruleData)
    } else {
      createRule(ruleData)
    }
    setShowEditor(false)
    setEditingRule(undefined)
  }

  const handleCloseEditor = () => {
    setShowEditor(false)
    setEditingRule(undefined)
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with controls */}
      <div className="mb-3 flex flex-col gap-2 shrink-0 @lg:flex-row @lg:items-start @lg:justify-between">
        <div className="flex items-start gap-2">
          <span className="px-1.5 py-0.5 text-xs rounded bg-secondary text-muted-foreground">
            {t('alertRules.activeCount', { count: enabledCount })}
          </span>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 @lg:w-auto @lg:min-w-[18rem] @lg:max-w-[20rem] @lg:items-end">
          <CardSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder={t('alertRules.searchRules')}
            className="mb-0 w-full"
          />
          <div className="flex flex-wrap items-start gap-2 @lg:justify-end">
            {/* Plus button */}
            <button
              onClick={handleCreateNew}
              className="p-1 rounded hover:bg-secondary/50 text-purple-400 transition-colors"
              title={t('alertRules.createNewRule')}
            >
              <Plus className="w-4 h-4" />
            </button>
            {/* CardControls */}
            <CardControlsRow
              cardControls={{
                limit: itemsPerPage,
                onLimitChange: setItemsPerPage,
                sortBy,
                sortOptions,
                onSortChange: (v) => setSortBy(v as SortField),
                sortDirection,
                onSortDirectionChange: setSortDirection,
              }}
              className="mb-0!"
            />
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2 min-h-card-content" style={containerStyle}>
        {displayedRules.length === 0 ? (
          <div className="rounded-lg border border-border/50 bg-secondary/10 p-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t('alertRules.noRulesConfigured')}</p>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={handleCreateNew}
                  icon={<Plus className="w-3 h-3" />}
                  className="mt-3"
                >
                  {t('alertRules.createRule')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          displayedRules.map((rule: AlertRule) => (
            <div
              key={rule.id}
              className={`p-2 rounded-lg border transition-colors ${
                rule.enabled
                  ? 'bg-secondary/30 border-border/50 hover:bg-secondary/50'
                  : 'bg-secondary/10 border-border/30 opacity-60'
              }`}
            >
              <div className="flex items-start gap-2">
                <SeverityIndicator severity={rule.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium truncate ${
                        rule.enabled ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {rule.name}
                    </span>
                    {rule.aiDiagnose && (
                      <StatusBadge color="purple" size="xs">
                        AI
                      </StatusBadge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatCondition(rule.condition)}
                  </p>

                  {/* Channels */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {rule.channels.map((channel, idx) => (
                      <span
                        key={idx}
                        className={`px-1.5 py-0.5 text-2xs rounded ${
                          channel.enabled
                            ? 'bg-secondary text-foreground'
                            : 'bg-secondary/50 text-muted-foreground'
                        }`}
                      >
                        {channel.type}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={e => handleEdit(e, rule)}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                    title={t('alertRules.editRule')}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={e => handleToggle(e, rule.id)}
                    className={`p-1 rounded transition-colors ${
                      rule.enabled
                        ? 'hover:bg-secondary/50 text-green-400'
                        : 'hover:bg-secondary/50 text-muted-foreground'
                    }`}
                    title={rule.enabled ? t('alertRules.disableRule') : t('alertRules.enableRule')}
                  >
                    {rule.enabled ? (
                      <Bell className="w-4 h-4" />
                    ) : (
                      <BellOff className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={e => handleDelete(e, rule.id)}
                    className={`p-1 rounded transition-colors ${
                      pendingDeleteId === rule.id
                        ? 'bg-red-500/20 text-red-400'
                        : 'hover:bg-red-500/20 text-muted-foreground hover:text-red-400'
                    }`}
                    title={pendingDeleteId === rule.id ? t('alertRules.confirmDelete') : t('alertRules.deleteRule')}
                  >
                    {pendingDeleteId === rule.id
                      ? <span className="text-[10px] font-medium px-0.5">{t('alertRules.confirmDelete')}</span>
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      {/* Alert Rule Editor Modal */}
      {showEditor && (
        <AlertRuleEditor
          rule={editingRule}
          onSave={handleSave}
          onCancel={handleCloseEditor}
        />
      )}
    </div>
  )
}
