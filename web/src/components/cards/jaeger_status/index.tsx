import React from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, Share2, Clock, Database, ShieldCheck, ExternalLink, Zap, Server, AlertTriangle, TrendingUp } from 'lucide-react'
import { useCachedJaegerStatus } from '../../../hooks/useCachedData'
import { useCardLoadingState } from '../CardDataContext'
import { StatusBadge } from '../../ui/StatusBadge'
import { SkeletonCardWithRefresh } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { EmptyState } from '../../ui/EmptyState'
import { cn } from '../../../lib/cn'
import { CardComponentProps } from '../cardRegistry'
import { useCardData, commonComparators, CardPaginationFooter, SortOption } from '../../../lib/cards'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { CardControls } from '../../ui/CardControls'
import { JaegerCollector } from '../../../types/jaeger'

const QUEUE_DEPTH_WARNING_THRESHOLD = 50
const QUEUE_DEPTH_ALERT_THRESHOLD = 80

const STATUS_CONFIG = {
    Healthy: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', dot: 'bg-green-400 shadow-green-500/40' },
    Degraded: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', dot: 'bg-yellow-400 shadow-yellow-500/40' },
    Unhealthy: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', dot: 'bg-red-400 shadow-red-500/40' },
}

/**
 * JaegerStatus — Advanced tracing monitoring card.
 * Adopts the standard platform patterns for filtering, sorting, and drill-downs.
 * Refined with critical KPIs (dropped spans, queue depth) from Jaeger docs.
 */
export const JaegerStatus: React.FC<CardComponentProps> = () => {
    const { t } = useTranslation(['cards', 'common'])
    const { drillToNode } = useDrillDownActions()
    const { selectedClusters } = useGlobalFilters()

    const {
        data,
        isLoading,
        isRefreshing,
        isDemoData,
        isFailed,
        consecutiveFailures,
        lastRefresh
    } = useCachedJaegerStatus()

    const filteredCollectors = React.useMemo(() => {
        const items = data?.collectors?.items || []
        if (selectedClusters.length === 0) return items
        if (selectedClusters.includes('__none__')) return []
        return items.filter((c: JaegerCollector) => !!c.cluster && selectedClusters.includes(c.cluster))
    }, [data?.collectors?.items, selectedClusters])

    const {
        items: paginatedCollectors,
        totalItems,
        currentPage,
        totalPages,
        itemsPerPage,
        goToPage,
        setItemsPerPage,
        needsPagination,
        sorting,
        containerRef,
        containerStyle,
    } = useCardData<JaegerCollector, 'name' | 'status' | 'version'>(filteredCollectors, {
        filter: { searchFields: ['name'], storageKey: 'jaeger-collectors' },
        sort: {
            defaultField: 'name',
            defaultDirection: 'asc',
            comparators: {
                name: commonComparators.string('name'),
                status: commonComparators.statusOrder('status', { Healthy: 0, Degraded: 1, Unhealthy: 2 }),
                version: commonComparators.string('version'),
            }
        },
        defaultLimit: 4,
    })

    const { showSkeleton, showEmptyState } = useCardLoadingState({
        isLoading,
        isRefreshing,
        isDemoData,
        hasAnyData: !!data.version || data.metrics.servicesCount > 0,
        isFailed,
        consecutiveFailures,
        lastRefresh,
    })

    if (showSkeleton) {
        return <SkeletonCardWithRefresh showStats={true} rows={2} />
    }

    if (showEmptyState || (!data.version && !isDemoData)) {
        return (
            <div className="h-full flex items-center justify-center p-4">
                <EmptyState
                    icon={<Zap className="w-8 h-8 text-muted-foreground/40" />}
                    title={t('jaeger.notDetected')}
                    description={t('jaeger.notDetectedDesc')}
                    action={{
                        label: t('jaeger.viewDocs'),
                        href: 'https://www.jaegertracing.io/docs/',
                        icon: ExternalLink
                    }}
                />
            </div>
        )
    }

    const brandStatus = STATUS_CONFIG[data.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.Healthy

    return (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">
            {/* Header: Fixed Height */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-xl border shadow-sm transition-all", brandStatus.bg, brandStatus.border)}>
                            <Activity className={cn("w-5 h-5", brandStatus.color)} />
                        </div>
                        <div>
                            <span className="font-bold tracking-tight text-foreground block leading-none mb-1">
                                {t('jaeger.title')}
                            </span>
                            <RefreshIndicator
                                isRefreshing={isRefreshing}
                                lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
                                size="xs"
                            />
                        </div>
                    </div>
                    <StatusBadge color={data.status === 'Healthy' ? 'green' : data.status === 'Degraded' ? 'yellow' : 'red'} variant="outline">
                        {data.status}
                    </StatusBadge>
                </div>

                {/* Critical Health KPIs (New based on research) */}
                <div className="grid grid-cols-2 gap-2">
                    <KPIField
                        icon={<AlertTriangle className={cn("w-3 h-3", data.metrics.spansDroppedLastHour > 0 ? "text-red-400" : "text-muted-foreground/40")} />}
                        label={t('jaeger.dropped')}
                        value={data.metrics.spansDroppedLastHour}
                        alert={data.metrics.spansDroppedLastHour > 0}
                    />
                    <KPIField
                        icon={<TrendingUp className={cn("w-3 h-3", data.metrics.avgQueueLength > QUEUE_DEPTH_WARNING_THRESHOLD ? "text-yellow-400" : "text-muted-foreground/40")} />}
                        label={t('jaeger.queueDepth')}
                        value={data.metrics.avgQueueLength}
                        alert={data.metrics.avgQueueLength > QUEUE_DEPTH_ALERT_THRESHOLD}
                    />
                </div>

                {/* Resource Metrics Grid */}
                <div className="grid grid-cols-2 @sm:grid-cols-3 gap-2">
                    <MetricTile
                        icon={<Database className="w-3.5 h-3.5 text-orange-400" />}
                        label={t('jaeger.services')}
                        value={data.metrics.servicesCount}
                    />
                    <MetricTile
                        icon={<Share2 className="w-3.5 h-3.5 text-purple-400" />}
                        label={t('jaeger.dependencies')}
                        value={data.metrics.dependenciesCount}
                    />
                    <MetricTile
                        icon={<Activity className="w-3.5 h-3.5 text-blue-400" />}
                        label={t('jaeger.traces')}
                        value={data.metrics.tracesLastHour}
                        compact
                    />
                </div>

                {/* Latency Analysis Section */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 uppercase tracking-widest font-bold px-1">
                        <Clock className="w-3 h-3" />
                        <span>{t('jaeger.latencyAnalysis')}</span>
                    </div>
                    <div className="grid grid-cols-2 @sm:grid-cols-3 gap-2 p-2 rounded-xl bg-secondary/10 border border-border/30">
                        <LatencyInfo label={t('jaeger.avg')} value={data.metrics.avgLatencyMs} />
                        <LatencyInfo label={t('jaeger.p95')} value={data.metrics.p95LatencyMs} isMiddle />
                        <LatencyInfo label={t('jaeger.p99')} value={data.metrics.p99LatencyMs} />
                    </div>
                </div>

                {/* Collectors List */}
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-y-2 px-1">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 uppercase tracking-widest font-bold">
                            <ShieldCheck className="w-3 h-3" />
                            <span>{t('jaeger.collectors')}</span>
                        </div>
                        <CardControls
                            limit={itemsPerPage}
                            onLimitChange={setItemsPerPage}
                            sortBy={sorting.sortBy}
                            onSortChange={sorting.setSortBy}
                            sortDirection={sorting.sortDirection}
                            onSortDirectionChange={sorting.setSortDirection}
                            sortOptions={[
                                { value: 'name', label: t('jaeger.name', 'Name') },
                                { value: 'status', label: t('jaeger.status', 'Status') },
                            ] as SortOption<'name' | 'status' | 'version'>[]}
                            showLimit={false}
                        />
                    </div>

                    <div ref={containerRef} style={containerStyle} className="space-y-1">
                        {paginatedCollectors.map((collector) => {
                            const colStatus = STATUS_CONFIG[collector.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.Healthy
                            return (
                                <div
                                    key={collector.name}
                                    onClick={() => drillToNode(collector.cluster || 'all', collector.name)}
                                    className="flex flex-wrap items-center justify-between gap-y-2 p-2 rounded-lg bg-secondary/20 border border-border/40 hover:border-border/80 transition-all cursor-pointer group/row"
                                >
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <Server className="w-3.5 h-3.5 text-muted-foreground/60 group-hover/row:text-primary transition-colors shrink-0" />
                                        <span className="text-xs font-semibold truncate tabular-nums">{collector.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[9px] font-mono opacity-40">v{collector.version}</span>
                                        <div className={cn("w-1.5 h-1.5 rounded-full", colStatus.dot)} />
                                    </div>
                                </div>
                            )
                        })}
                        {paginatedCollectors.length === 0 && (
                            <div className="py-4 text-center text-[10px] text-muted-foreground italic">
                                {t('common:labels.noData', 'No data available')}
                            </div>
                        )}
                    </div>

                    {needsPagination && (
                        <CardPaginationFooter
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage === 'unlimited' ? filteredCollectors.length : itemsPerPage}
                            onPageChange={goToPage}
                            needsPagination={needsPagination}
                        />
                    )}
                </div>
            </div>

            <div className="p-3 bg-muted/10 border-t border-border/40 flex flex-wrap items-center justify-between gap-y-2 shrink-0">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                    <span className="bg-secondary/50 px-1.5 py-0.5 rounded border border-border/20 font-mono opacity-60">
                        v{data.version}
                    </span>
                    {data.collectors.count > 0 && (
                        <span className="text-emerald-500/80 flex items-center gap-1 ml-1">
                            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                            {t('common:labels.healthy', 'Healthy')}
                        </span>
                    )}
                </div>
                <a
                    href="https://www.jaegertracing.io/docs/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 font-bold uppercase tracking-tight transition-all group"
                >
                    {t('jaeger.viewDocs')}
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
            </div>
        </div>
    )
}

function KPIField({ icon, label, value, alert }: { icon: React.ReactNode, label: string, value: number, alert?: boolean }) {
    return (
        <div className={cn(
            "flex flex-wrap items-center justify-between gap-y-2 px-3 py-2 rounded-xl border transition-all",
            alert ? "bg-red-500/5 border-red-500/20 shadow-[var(--shadow-error-glow)]" : "bg-secondary/10 border-border/30"
        )}>
            <div className="flex items-center gap-2">
                {icon}
                <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-tight">{label}</span>
            </div>
            <span className={cn("text-xs font-black tabular-nums", alert ? "text-red-400" : "text-foreground")}>
                {value.toLocaleString()}
            </span>
        </div>
    )
}

function MetricTile({ icon, label, value, compact }: { icon: React.ReactNode, label: string, value: number, compact?: boolean }) {
    return (
        <div className="p-2.5 rounded-xl bg-secondary/15 border border-border/40 hover:bg-secondary/25 transition-all group">
            <div className="flex items-center gap-1.5 text-muted-foreground/60 mb-1 grayscale group-hover:grayscale-0 transition-all">
                {icon}
                <span className="text-[9px] font-black uppercase tracking-tighter truncate">{label}</span>
            </div>
            <div className={cn("font-black text-foreground tracking-tight tabular-nums truncate", compact ? "text-base" : "text-lg")}>
                {value.toLocaleString()}
            </div>
        </div>
    )
}

function LatencyInfo({ label, value, isMiddle }: { label: string, value: number, isMiddle?: boolean }) {
    return (
        <div className={`text-center py-1 ${isMiddle ? 'border-x border-border/30' : ''}`}>
            <div className="text-[9px] text-muted-foreground/40 uppercase font-black mb-0.5 tracking-tighter">{label}</div>
            <div className="text-sm font-bold text-foreground tabular-nums">
                {value}<span className="text-[10px] font-normal ml-0.5 opacity-30">ms</span>
            </div>
        </div>
    )
}
