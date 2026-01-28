import { useState, useMemo } from 'react'
import {
  Plus,
  Bell,
  BellOff,
  Trash2,
  Pencil,
  Search,
  Filter,
  ChevronDown,
  Server,
} from 'lucide-react'
import { useAlertRules } from '../../hooks/useAlerts'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { formatCondition } from '../../types/alerts'
import type { AlertRule, AlertSeverity } from '../../types/alerts'
import { CardControls, SortDirection } from '../ui/CardControls'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Pagination, usePagination } from '../ui/Pagination'
import { AlertRuleEditor } from '../alerts/AlertRuleEditor'
import { useChartFilters } from '../../lib/cards'

type SortField = 'name' | 'severity' | 'enabled'

export function AlertRulesCard() {
  const { rules, createRule, updateRule, toggleRule, deleteRule } = useAlertRules()
  const { customFilter } = useGlobalFilters()
  const [showEditor, setShowEditor] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | undefined>(undefined)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [localSearch, setLocalSearch] = useState('')

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({
    storageKey: 'alert-rules',
  })

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

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      filtered = filtered.filter(rule =>
        rule.name.toLowerCase().includes(query) ||
        formatCondition(rule.condition).toLowerCase().includes(query) ||
        rule.severity.toLowerCase().includes(query)
      )
    }

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (sortBy === 'severity') {
        const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
        cmp = severityOrder[a.severity] - severityOrder[b.severity]
      } else {
        // Sort by enabled (enabled first)
        cmp = (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [rules, sortBy, sortDirection, customFilter, localSearch])

  // Apply pagination using usePagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: displayedRules,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(sortedRules, effectivePerPage)

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
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 1. Plus button */}
          <button
            onClick={handleCreateNew}
            className="p-1 rounded hover:bg-secondary/50 text-purple-400 transition-colors"
            title="Create new rule"
          >
            <Plus className="w-4 h-4" />
          </button>
          {/* 2. Cluster Filter */}
          {availableClusters.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button
                      onClick={clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.length === 0
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {availableClusters.map(cluster => (
                      <button
                        key={cluster.name}
                        onClick={() => toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                          localClusterFilter.includes(cluster.name)
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        {cluster.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* 3. CardControls */}
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
            sortOptions={[
              { value: 'name', label: 'Name' },
              { value: 'severity', label: 'Severity' },
              { value: 'enabled', label: 'Status' },
            ]}
          />
          {/* 4. RefreshButton */}
          <RefreshButton
            isRefreshing={false}
            onRefresh={() => window.location.reload()}
          />
        </div>
      </div>

      {/* Local Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search rules..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
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

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
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
