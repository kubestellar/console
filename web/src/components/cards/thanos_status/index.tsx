import { CheckCircle, AlertTriangle, RefreshCw, Database, Radio, Activity } from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { useThanosStatus } from './useThanosStatus'

function useFormatRelativeTime() {
    return (isoString: string): string => {
        const diff = Date.now() - new Date(isoString).getTime()
        if (isNaN(diff) || diff < 0) return 'just now'
        const minute = 60_000
        const hour = 60 * minute
        const day = 24 * hour
        if (diff < minute) return 'just now'
        if (diff < hour) return `${Math.floor(diff / minute)}m ago`
        if (diff < day) return `${Math.floor(diff / hour)}h ago`
        return `${Math.floor(diff / day)}d ago`
    }
}

interface MetricTileProps {
    label: string
    value: number | string
    colorClass: string
    icon: React.ReactNode
}

function MetricTile({ label, value, colorClass, icon }: MetricTileProps) {
    return (
        <div className="flex-1 p-3 rounded-lg bg-secondary/30 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
                {icon}
            </div>
            <span className={`text-2xl font-bold ${colorClass}`}>{value}</span>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
    )
}

export function ThanosStatus() {
    const formatRelativeTime = useFormatRelativeTime()
    const { data, error, showSkeleton, showEmptyState } = useThanosStatus()

    if (showSkeleton) {
        return (
            <div className="h-full flex flex-col min-h-card gap-3">
                <Skeleton variant="rounded" height={36} />
                <div className="flex gap-2">
                    <Skeleton variant="rounded" height={80} className="flex-1" />
                    <Skeleton variant="rounded" height={80} className="flex-1" />
                    <Skeleton variant="rounded" height={80} className="flex-1" />
                </div>
                <Skeleton variant="rounded" height={60} />
                <Skeleton variant="rounded" height={40} />
            </div>
        )
    }

    if (error || showEmptyState) {
        return (
            <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                <p className="text-sm text-red-400">
                    {error ? 'Failed to fetch Thanos status' : 'No Thanos targets found'}
                </p>
                <p className="text-xs">Ensure Thanos Query is running and accessible.</p>
            </div>
        )
    }

    const isHealthy = data.queryHealth === 'healthy'
    const targetsUp = data.targets.filter((t) => t.health === 'up').length
    const targetsTotal = data.targets.length
    const storesHealthy = data.storeGateways.filter((s) => s.health === 'healthy').length
    const storesTotal = data.storeGateways.length

    return (
        <div className="h-full flex flex-col min-h-card content-loaded gap-4">
            {/* Health badge + last check */}
            <div className="flex items-center justify-between">
                <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isHealthy
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}
                >
                    {isHealthy ? (
                        <CheckCircle className="w-4 h-4" />
                    ) : (
                        <AlertTriangle className="w-4 h-4" />
                    )}
                    {isHealthy ? 'Healthy' : 'Degraded'}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <RefreshCw className="w-3 h-3" />
                    <span>{formatRelativeTime(data.lastCheckTime)}</span>
                </div>
            </div>

            {/* Metric tiles */}
            <div className="flex gap-3">
                <MetricTile
                    label="Targets Up"
                    value={`${targetsUp}/${targetsTotal}`}
                    colorClass={targetsUp === targetsTotal ? 'text-green-400' : 'text-yellow-400'}
                    icon={<Radio className="w-4 h-4 text-blue-400" />}
                />
                <MetricTile
                    label="Store Gateways"
                    value={storesTotal > 0 ? `${storesHealthy}/${storesTotal}` : '—'}
                    colorClass={storesTotal === 0 || storesHealthy === storesTotal ? 'text-green-400' : 'text-yellow-400'}
                    icon={<Database className="w-4 h-4 text-purple-400" />}
                />
                <MetricTile
                    label="Query"
                    value={isHealthy ? 'OK' : '!'}
                    colorClass={isHealthy ? 'text-green-400' : 'text-yellow-400'}
                    icon={<Activity className="w-4 h-4 text-cyan-400" />}
                />
            </div>

            {/* Target list */}
            <div className="flex-1 flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Targets</p>
                <div className="space-y-1.5">
                    {data.targets.map((target) => (
                        <div key={target.name} className="flex items-center gap-2 text-xs">
                            <span
                                className={`w-2 h-2 rounded-full shrink-0 ${target.health === 'up' ? 'bg-green-400' : 'bg-red-400'
                                    }`}
                            />
                            <span className="truncate flex-1 text-muted-foreground">{target.name}</span>
                            <span className="text-muted-foreground/60 shrink-0">
                                {formatRelativeTime(target.lastScrape)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Store gateway list (only if any exist) */}
            {data.storeGateways.length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Store Gateways</p>
                    <div className="space-y-1.5">
                        {data.storeGateways.map((store) => (
                            <div key={store.name} className="flex items-center gap-2 text-xs">
                                <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${store.health === 'healthy' ? 'bg-green-400' : 'bg-red-400'
                                        }`}
                                />
                                <span className="truncate flex-1 text-muted-foreground">{store.name}</span>
                                <span className={`shrink-0 ${store.health === 'healthy' ? 'text-green-400/60' : 'text-red-400/60'}`}>
                                    {store.health}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <a
                    href="https://thanos.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
                >
                    Open Thanos Docs
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </a>
            </div>
        </div>
    )
}
