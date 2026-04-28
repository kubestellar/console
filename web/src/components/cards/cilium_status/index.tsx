import React from 'react'
import { useTranslation } from 'react-i18next'
import { SortOption } from '../../../lib/cards/cardHooks'
import { Network, Shield, Activity, ExternalLink, Box, Server } from 'lucide-react'
import { useCachedCiliumStatus } from '../../../hooks/useCachedCiliumStatus'
import { useCardLoadingState } from '../CardDataContext'
import { cn } from '../../../lib/cn'
import { StatusBadge } from '../../ui/StatusBadge'
import { CardComponentProps } from '../cardRegistry'
import { CardControls } from '../../ui/CardControls'
import { useCardData, commonComparators, CardPaginationFooter } from '../../../lib/cards'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { CiliumNode } from '../../../types/cilium'

const STATUS_CONFIG = {
    Healthy: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', dot: 'bg-green-400 shadow-green-500/40' },
    Degraded: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', dot: 'bg-yellow-400 shadow-yellow-500/40' },
    Unhealthy: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', dot: 'bg-red-400 shadow-red-500/40' },
}

export const CiliumStatus: React.FC<CardComponentProps> = () => {
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
    } = useCachedCiliumStatus()

    // Filter nodes by global cluster filter if applicable
    const nodeItems = React.useMemo(() => {
        if (!data?.nodes) return []
        if (selectedClusters.length === 0) return data.nodes

        // If CiliumNode doesn't have a cluster field, we can't filter effectively here
        // unless we know which cluster each node belongs to. 
        // For now, we'll return all if no explicit cluster match is possible,
        // or filter if 'cluster' field exists.
        return data.nodes.filter(node => {
            const nodeCluster = (node as CiliumNode & { cluster?: string }).cluster
            return !nodeCluster || selectedClusters.includes(nodeCluster)
        })
    }, [data?.nodes, selectedClusters])

    const {
        items: paginatedNodes,
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
    } = useCardData<CiliumNode, 'name' | 'status' | 'version'>(nodeItems, {
        filter: { searchFields: ['name'], storageKey: 'cilium-nodes' },
        sort: {
            defaultField: 'name',
            defaultDirection: 'asc',
            comparators: {
                name: commonComparators.string('name'),
                status: commonComparators.statusOrder('status', { Healthy: 0, Degraded: 1, Unhealthy: 2 }),
                version: commonComparators.string('version'),
            }
        },
        defaultLimit: 5,
    })

    const { showSkeleton } = useCardLoadingState({
        isLoading,
        isRefreshing,
        isDemoData,
        hasAnyData: (data?.nodes?.length || 0) > 0 || data.networkPolicies > 0,
        isFailed,
        consecutiveFailures,
        lastRefresh
    })

    if (showSkeleton) {
        return (
            <div className="p-4 space-y-4 animate-pulse">
                <div className="h-10 bg-muted/20 rounded-lg w-1/3" />
                <div className="grid grid-cols-2 @sm:grid-cols-3 gap-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-20 bg-muted/10 rounded-xl" />
                    ))}
                </div>
                <div className="space-y-2">
                    {[1, 2].map(i => (
                        <div key={i} className="h-12 bg-muted/5 rounded-lg" />
                    ))}
                </div>
            </div>
        )
    }

    const status = STATUS_CONFIG[data.status] || STATUS_CONFIG.Healthy

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                {/* Header Status */}
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", status.bg)}>
                            <Network className={cn("w-5 h-5", status.color)} />
                        </div>
                        <div>
                            <div className="font-semibold text-foreground tracking-tight">{t('ciliumStatus.title')}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                {t('ciliumStatus.subtitle')}
                            </div>
                        </div>
                    </div>
                    <StatusBadge
                        variant="outline"
                        color={data.status === 'Healthy' ? 'green' : data.status === 'Degraded' ? 'yellow' : 'red'}
                    >
                        {t(`ciliumStatus.${data.status.toLowerCase()}` as `ciliumStatus.${'healthy' | 'degraded' | 'unhealthy'}`)}
                    </StatusBadge>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 @sm:grid-cols-3 gap-3">
                    <MetricTile
                        icon={<Shield className="w-4 h-4 text-cyan-400" />}
                        label={t('ciliumStatus.networkPolicies')}
                        value={data.networkPolicies}
                    />
                    <MetricTile
                        icon={<Box className="w-4 h-4 text-purple-400" />}
                        label={t('ciliumStatus.endpoints')}
                        value={data.endpoints}
                    />
                    <MetricTile
                        icon={<Activity className="w-4 h-4 text-emerald-400" />}
                        label={t('ciliumStatus.hubbleFlows')}
                        value={(data.hubble?.flowsPerSecond || 0).toLocaleString()}
                        suffix={t('ciliumStatus.perSecond')}
                    />
                </div>

                {/* Node Status List */}
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-y-2 px-1">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-widest">
                            {t('ciliumStatus.nodes')}
                        </div>
                        <CardControls
                            limit={itemsPerPage}
                            onLimitChange={setItemsPerPage}
                            sortBy={sorting.sortBy}
                            onSortChange={sorting.setSortBy}
                            sortDirection={sorting.sortDirection}
                            onSortDirectionChange={sorting.setSortDirection}
                            sortOptions={[
                                { value: 'name', label: t('ciliumStatus.name') },
                                { value: 'status', label: t('ciliumStatus.status') },
                                { value: 'version', label: t('ciliumStatus.version') },
                            ] as SortOption<'name' | 'status' | 'version'>[]}
                            showLimit={false}
                        />
                    </div>
                    <div
                        ref={containerRef}
                        style={containerStyle}
                        className="space-y-1.5 flex flex-col gap-1 transition-all duration-300"
                    >
                        {paginatedNodes.map((node) => {
                            const nodeStatus = STATUS_CONFIG[node.status] || STATUS_CONFIG.Healthy
                            return (
                                <div
                                    key={node.name}
                                    onClick={() => drillToNode('all', node.name)}
                                    className="flex flex-wrap items-center justify-between gap-y-2 p-2 rounded-lg bg-secondary/30 border border-border/40 hover:border-border/80 transition-colors cursor-pointer group/row"
                                    title={`${node.name} - ${node.version}`}
                                >
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <Server className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover/row:text-primary transition-colors" />
                                        <span className="text-sm font-medium truncate tracking-tight">{node.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] font-mono text-muted-foreground bg-black/20 px-1.5 py-0.5 rounded border border-border/20">
                                            {node.version}
                                        </span>
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full shadow-[0_0_8px]",
                                            nodeStatus.dot
                                        )} />
                                    </div>
                                </div>
                            )
                        })}
                        {paginatedNodes.length === 0 && (
                            <div className="py-8 text-center text-xs text-muted-foreground italic">
                                {t('common:labels.noData')}
                            </div>
                        )}
                    </div>
                    {needsPagination && (
                        <CardPaginationFooter
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage === 'unlimited' ? nodeItems.length : itemsPerPage}
                            onPageChange={goToPage}
                            needsPagination={needsPagination}
                        />
                    )}
                </div>
            </div>

            {/* Footer link */}
            <div className="p-3 bg-muted/10 border-t border-border/40 flex flex-wrap items-center justify-between gap-y-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                    <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        {t('ciliumStatus.hubbleEnabled')}
                    </div>
                    <div className="flex items-center gap-1.5 ml-2">
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shadow-[0_0_8px_theme(colors.blue.400/50%)]" />
                        {t('ciliumStatus.ebpf')}
                    </div>
                </div>
                <a
                    href="https://docs.cilium.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-medium transition-colors group"
                >
                    {t('ciliumStatus.openDocs')}
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
            </div>
        </div>
    )
}

const MetricTile = ({ icon, label, value, suffix }: { icon: React.ReactNode, label: string, value: string | number, suffix?: string }) => (
    <div className="p-3 rounded-xl bg-secondary/20 border border-border/40 flex flex-col items-center text-center group hover:bg-secondary/40 transition-all hover:scale-[1.02]">
        <div className="mb-1 p-1.5 rounded-lg bg-background/50 border border-border/20 group-hover:scale-110 transition-transform">
            {icon}
        </div>
        <div className="text-lg font-bold text-foreground leading-none tabular-nums truncate w-full px-1">
            {value}
            {suffix && <span className="text-[10px] font-normal ml-0.5 text-muted-foreground">{suffix}</span>}
        </div>
        <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight mt-0.5 truncate w-full px-1">
            {label}
        </div>
    </div>
)
