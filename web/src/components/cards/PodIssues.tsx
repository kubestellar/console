import { useState, useMemo } from 'react'
import { AlertTriangle, RefreshCw, MemoryStick, ImageOff, Clock, ChevronRight } from 'lucide-react'
import { usePodIssues, PodIssue } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'

type SortByOption = 'status' | 'name' | 'restarts' | 'cluster'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'restarts' as const, label: 'Restarts' },
  { value: 'cluster' as const, label: 'Cluster' },
]

const getIssueIcon = (status: string) => {
  if (status.includes('OOM')) return MemoryStick
  if (status.includes('Image')) return ImageOff
  if (status.includes('Pending')) return Clock
  return RefreshCw
}

const getStatusColors = (status: string) => {
  const lowerStatus = status.toLowerCase()
  if (lowerStatus.includes('failed') || lowerStatus.includes('error') || lowerStatus.includes('crashloop') || lowerStatus.includes('oom')) {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/20', iconBg: 'bg-red-500/20' }
  }
  if (lowerStatus.includes('pending') || lowerStatus.includes('waiting') || lowerStatus.includes('creating')) {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/20', iconBg: 'bg-yellow-500/20' }
  }
  if (lowerStatus.includes('running')) {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/20', iconBg: 'bg-green-500/20' }
  }
  // Default to orange for unknown/warning states
  return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/20', iconBg: 'bg-orange-500/20' }
}

export function PodIssues() {
  const { issues: rawIssues, isLoading, error, refetch } = usePodIssues()
  const { drillToPod } = useDrillDownActions()
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const issues = useMemo(() => {
    const sorted = [...rawIssues].sort((a, b) => {
      let result = 0
      if (sortBy === 'status') result = a.status.localeCompare(b.status)
      else if (sortBy === 'name') result = a.name.localeCompare(b.name)
      else if (sortBy === 'restarts') result = b.restarts - a.restarts
      else if (sortBy === 'cluster') result = (a.cluster || '').localeCompare(b.cluster || '')
      return sortDirection === 'asc' ? result : -result
    })
    if (limit === 'unlimited') return sorted
    return sorted.slice(0, limit)
  }, [rawIssues, sortBy, sortDirection, limit])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">Pod Issues</span>
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
            <svg
              className="w-6 h-6 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-white font-medium">All pods healthy</p>
          <p className="text-sm text-muted-foreground">No issues detected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Pod Issues</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
            {rawIssues.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Issues list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {issues.map((issue: PodIssue, idx: number) => {
          const Icon = getIssueIcon(issue.status)
          const colors = getStatusColors(issue.status)
          return (
            <div
              key={`${issue.name}-${idx}`}
              data-tour={idx === 0 ? 'drilldown' : undefined}
              className={`p-3 rounded-lg ${colors.bg} border ${colors.border} cursor-pointer hover:opacity-80 transition-all`}
              onClick={() => drillToPod(issue.cluster || 'default', issue.namespace, issue.name, {
                status: issue.status,
                restarts: issue.restarts,
                issues: issue.issues,
              })}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${colors.iconBg} flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${colors.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ClusterBadge cluster={issue.cluster || 'default'} />
                    <span className="text-xs text-muted-foreground">{issue.namespace}</span>
                  </div>
                  <p className="text-sm font-medium text-white truncate">{issue.name}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                      {issue.status}
                    </span>
                    {issue.restarts > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {issue.restarts} restarts
                      </span>
                    )}
                  </div>
                  {issue.issues.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {issue.issues.join(', ')}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Using demo data
        </div>
      )}
    </div>
  )
}
