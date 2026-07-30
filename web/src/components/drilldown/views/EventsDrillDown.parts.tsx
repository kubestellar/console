import React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { ClusterEvent } from './useEventsDrillDown'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { Terminal, Copy, CheckCircle, RefreshCw, AlertCircle } from 'lucide-react'

// Skeleton component for loading state
export function EventsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-4 rounded-lg bg-card/50 border border-border">
            <div className="h-8 w-16 bg-muted rounded mb-2" />
            <div className="h-4 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-4 rounded-lg bg-card/50 border-l-4 border-l-muted">
            <div className="h-4 w-32 bg-muted rounded mb-2" />
            <div className="h-3 w-48 bg-muted rounded mb-2" />
            <div className="h-3 w-full bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface StatsProps {
  totalCount: number
  warningCount: number
  normalCount: number
}

export function EventsStats({ totalCount, warningCount, normalCount }: StatsProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <div className="text-2xl font-bold text-foreground">{totalCount}</div>
        <div className="text-sm text-muted-foreground">{t('drilldown.events.totalEvents', 'Total Events')}</div>
      </div>
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <div className="text-2xl font-bold text-yellow-400">{warningCount}</div>
        <div className="text-sm text-muted-foreground">{t('common.warnings', 'Warnings')}</div>
      </div>
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <div className="text-2xl font-bold text-green-400">{normalCount}</div>
        <div className="text-sm text-muted-foreground">{t('common.normal')}</div>
      </div>
    </div>
  )
}

interface EventRowProps {
  event: ClusterEvent
}

export function EventRow({ event }: EventRowProps) {
  return (
    <div
      className={`p-4 rounded-lg border-l-4 ${
        event.type === 'Warning'
          ? 'bg-yellow-500/10 border-l-yellow-500'
          : 'bg-card/50 border-l-green-500'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <StatusIndicator status={event.type === 'Warning' ? 'warning' : 'healthy'} size="sm" />
          <span className="font-medium text-foreground">{event.reason}</span>
        </div>
        {event.count > 1 && (
          <span className="text-xs px-2 py-1 rounded bg-card text-muted-foreground">
            x{event.count}
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {event.namespace}/{event.object}
      </div>
      <p className="text-sm text-foreground mt-2">{event.message}</p>
      {event.lastSeen && (
        <div className="text-xs text-muted-foreground mt-2">
          Last seen: {new Date(event.lastSeen).toLocaleString()}
        </div>
      )}
    </div>
  )
}

interface KubectlFallbackProps {
  clusterShort: string
  namespace: string | undefined
  objectName: string | undefined
  copied: boolean
  onCopyCommand: () => void
}

export function KubectlFallback({ clusterShort, namespace, objectName, copied, onCopyCommand }: KubectlFallbackProps) {
  const { t } = useTranslation()

  return (
    <div className="p-4 rounded-lg bg-card/50 border border-border">
      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Terminal className="w-4 h-4" />
        {t('drilldown.actions.getEvents', 'Get Events via kubectl')}
      </h4>
      <div className="flex items-center justify-between p-2 rounded bg-background/50 font-mono text-xs">
        <code className="text-muted-foreground truncate">
          kubectl --context {clusterShort} get events{objectName ? ` --field-selector involvedObject.name=${objectName}` : ''}{namespace ? ` -n ${namespace}` : ' -A'} --sort-by=.lastTimestamp
        </code>
        <button
          onClick={onCopyCommand}
          className="ml-2 p-1 hover:bg-card rounded shrink-0"
          title={t('drilldown.tooltips.copyCommand')}
        >
          {copied ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
        </button>
      </div>
    </div>
  )
}

interface ErrorStateProps {
  error: string | null
  clusterShort: string
  namespace: string | undefined
  objectName: string | undefined
  isLoading: boolean
  copied: boolean
  onRefetch: () => void
  onCopyCommand: () => void
}

export function ErrorState({ error, clusterShort, namespace, objectName, isLoading, copied, onRefetch, onCopyCommand }: ErrorStateProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div className="p-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
        <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
        <h4 className="font-medium text-yellow-400 mb-2">
          {error ? t('drilldown.events.failedToLoad', 'Failed to load events') : t('drilldown.events.noEventsFound', 'No events found')}
        </h4>
        <p className="text-sm text-muted-foreground mb-4">
          {error || `No events found for ${objectName || clusterShort}. Events may have expired or the cluster may be unreachable.`}
        </p>
        <div className="flex justify-center gap-2">
          <button
            onClick={onRefetch}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-sm hover:bg-card/80 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.retry', 'Retry')}
          </button>
        </div>
      </div>
      <KubectlFallback
        clusterShort={clusterShort}
        namespace={namespace}
        objectName={objectName}
        copied={copied}
        onCopyCommand={onCopyCommand}
      />
    </div>
  )
}

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalCount: number
  onPageChange: (page: number) => void
}

/** Events displayed per page. */
export const PAGE_SIZE = 20

export function Pagination({ currentPage, totalPages, totalCount, onPageChange }: PaginationProps) {
  const { t } = useTranslation()
  const ChevronLeft = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
  const ChevronRight = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )

  return (
    <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground border-t border-border">
      <span>
        {t('pagination.showing', {
          start: (currentPage - 1) * PAGE_SIZE + 1,
          end: Math.min(currentPage * PAGE_SIZE, totalCount),
          total: totalCount,
        })}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label={t('pagination.previousPage', 'Previous page')}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            currentPage === 1
              ? 'text-muted-foreground/40 cursor-not-allowed'
              : 'hover:bg-card text-muted-foreground hover:text-foreground'
          )}
        >
          <ChevronLeft />
        </button>
        <span className="px-2 tabular-nums">
          {t('pagination.pageOf', {
            page: currentPage,
            total: totalPages,
          })}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label={t('pagination.nextPage', 'Next page')}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            currentPage === totalPages
              ? 'text-muted-foreground/40 cursor-not-allowed'
              : 'hover:bg-card text-muted-foreground hover:text-foreground'
          )}
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  )
}
