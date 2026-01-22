import { useState, useMemo } from 'react'
import {
  Settings,
  Plus,
  Bell,
  BellOff,
  Trash2,
  Pencil,
} from 'lucide-react'
import { useAlertRules } from '../../hooks/useAlerts'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { formatCondition } from '../../types/alerts'
import type { AlertRule, AlertSeverity } from '../../types/alerts'
import { CardControls } from '../ui/CardControls'
import { AlertRuleEditor } from '../alerts/AlertRuleEditor'

type SortField = 'name' | 'severity' | 'enabled'

export function AlertRulesCard() {
  const { rules, createRule, updateRule, toggleRule, deleteRule } = useAlertRules()
  const { customFilter } = useGlobalFilters()
  const [showEditor, setShowEditor] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | undefined>(undefined)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<SortField>('name')

  // Filter and sort rules
  const sortedRules = useMemo(() => {
    let filtered = [...rules]

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      filtered = filtered.filter(rule =>
        rule.name.toLowerCase().includes(query) ||
        formatCondition(rule.condition).toLowerCase().includes(query)
      )
    }

    return filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name)
      } else if (sortBy === 'severity') {
        const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
        return severityOrder[a.severity] - severityOrder[b.severity]
      } else {
        // Sort by enabled (enabled first)
        return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)
      }
    })
  }, [rules, sortBy, customFilter])

  // Apply pagination
  const displayedRules = useMemo(() => {
    if (limit === 'unlimited') return sortedRules
    return sortedRules.slice(0, limit)
  }, [sortedRules, limit])

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
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">Alert Rules</span>
          <span className="px-1.5 py-0.5 text-xs rounded bg-secondary text-muted-foreground">
            {enabledCount} active
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateNew}
            className="p-1 rounded hover:bg-secondary/50 text-purple-400 transition-colors"
            title="Create new rule"
          >
            <Plus className="w-4 h-4" />
          </button>
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            onSortChange={setSortBy}
            sortOptions={[
              { value: 'name', label: 'Name' },
              { value: 'severity', label: 'Severity' },
              { value: 'enabled', label: 'Status' },
            ]}
          />
        </div>
      </div>

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

      {/* Footer */}
      {rules.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {limit === 'unlimited' || displayedRules.length >= sortedRules.length
              ? `Showing all ${sortedRules.length} rules`
              : `Showing ${displayedRules.length} of ${sortedRules.length} rules`}
          </span>
          <button
            onClick={handleCreateNew}
            className="text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            New Rule
          </button>
        </div>
      )}

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
