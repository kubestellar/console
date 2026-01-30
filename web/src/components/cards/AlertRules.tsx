import { useState } from 'react'
import {
  Plus,
  Bell,
  BellOff,
  Trash2,
  Pencil,
} from 'lucide-react'
import { useAlertRules } from '../../hooks/useAlerts'
import { formatCondition } from '../../types/alerts'
import type { AlertRule, AlertSeverity } from '../../types/alerts'
import { AlertRuleEditor } from '../alerts/AlertRuleEditor'
import {
  useCardData,
  commonComparators,
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../lib/cards'

type SortField = 'name' | 'severity' | 'enabled'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'severity' as const, label: 'Severity' },
  { value: 'enabled' as const, label: 'Status' },
]

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

const ALERT_SORT_COMPARATORS = {
  name: commonComparators.string<AlertRule>('name'),
  severity: (a: AlertRule, b: AlertRule) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  enabled: (a: AlertRule, b: AlertRule) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0),
}

export function AlertRulesCard() {
  const { rules, createRule, updateRule, toggleRule, deleteRule } = useAlertRules()
  const [showEditor, setShowEditor] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | undefined>(undefined)

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

  const handleDelete = (e: React.MouseEvent, ruleId: string) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this alert rule?')) {
      deleteRule(ruleId)
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
    <div className="h-full flex flex-col">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 text-xs rounded bg-secondary text-muted-foreground">
            {enabledCount} active
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Plus button */}
          <button
            onClick={handleCreateNew}
            className="p-1 rounded hover:bg-secondary/50 text-purple-400 transition-colors"
            title="Create new rule"
          >
            <Plus className="w-4 h-4" />
          </button>
          {/* CardControls */}
          <CardControlsRow
            cardControls={{
              limit: itemsPerPage,
              onLimitChange: setItemsPerPage,
              sortBy,
              sortOptions: SORT_OPTIONS,
              onSortChange: (v) => setSortBy(v as SortField),
              sortDirection,
              onSortDirectionChange: setSortDirection,
            }}
            className="!mb-0"
          />
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search rules..."
        className="mb-3"
      />

      {/* Rules List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {displayedRules.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
            <Bell className="w-8 h-8 mb-2" />
            <span>No alert rules configured</span>
            <button
              onClick={handleCreateNew}
              className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Create Rule
            </button>
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
                      <span className="px-1 py-0.5 text-[10px] rounded bg-purple-500/20 text-purple-400">
                        AI
                      </span>
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
                        className={`px-1.5 py-0.5 text-[10px] rounded ${
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
                    title="Edit rule"
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
                    title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                  >
                    {rule.enabled ? (
                      <Bell className="w-4 h-4" />
                    ) : (
                      <BellOff className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={e => handleDelete(e, rule.id)}
                    className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Delete rule"
                  >
                    <Trash2 className="w-4 h-4" />
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
