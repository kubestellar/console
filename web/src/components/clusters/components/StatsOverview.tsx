import { useState } from 'react'
import { WifiOff, HardDrive, Server, CheckCircle2, XCircle, Cpu, MemoryStick, Layers, Zap, Box, Settings, Sparkles } from 'lucide-react'
import { formatStat, formatMemoryStat } from '../../../lib/formatStats'
import { StatsConfigModal, useStatsConfig } from '../../ui/StatsConfig'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { isInClusterMode } from '../../../hooks/useBackendHealth'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { Skeleton } from '../../ui/Skeleton'
import { useTranslation } from 'react-i18next'

export interface ClusterStats {
  total: number
  loading: number
  healthy: number
  unhealthy: number
  unreachable: number
  totalNodes: number
  totalCPUs: number
  totalMemoryGB: number
  totalStorageGB: number
  totalPods: number
  totalGPUs: number
  allocatedGPUs: number
  // Additional accelerator types
  totalTPUs?: number
  allocatedTPUs?: number
  totalAIUs?: number
  allocatedAIUs?: number
  totalXPUs?: number
  allocatedXPUs?: number
  /** Whether there are any reachable clusters with resource data */
  hasResourceData?: boolean
}

interface StatsOverviewProps {
  stats: ClusterStats
  /** Filter cluster list to show only clusters with the given status */
  onFilterByStatus?: (status: 'all' | 'healthy' | 'unhealthy' | 'unreachable') => void
  /** Open CPU detail modal */
  onCPUClick?: () => void
  /** Open Memory detail modal */
  onMemoryClick?: () => void
  /** Open Storage detail modal */
  onStorageClick?: () => void
  /** Open GPU detail modal */
  onGPUClick?: () => void
  /** Open TPU detail modal */
  onTPUClick?: () => void
  /** Open AIU detail modal */
  onAIUClick?: () => void
  /** Open XPU detail modal */
  onXPUClick?: () => void
  /** Navigate to nodes view */
  onNodesClick?: () => void
  /** Navigate to pods view */
  onPodsClick?: () => void
  /** Dashboard type for stats config (default: 'clusters') */
  dashboardType?: 'clusters' | 'compute' | 'workloads' | 'pods' | 'gitops' | 'storage' | 'network' | 'security' | 'compliance' | 'data-compliance' | 'events' | 'cost' | 'alerts' | 'dashboard' | 'operators' | 'deploy'
  /** Storage key for persisting config (optional override) */
  configKey?: string
  /** Whether to show the configure button */
  showConfigButton?: boolean
}

// Icon mapping for dynamic rendering
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Server, CheckCircle2, XCircle, WifiOff, Box, Cpu, MemoryStick, HardDrive, Zap, Layers, Sparkles,
}

// Color mapping for dynamic rendering
const COLOR_CLASSES: Record<string, string> = {
  purple: 'text-purple-400',
  green: 'text-green-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  cyan: 'text-cyan-400',
  blue: 'text-blue-400',
}

// Stat block renderer for individual blocks
interface StatBlockProps {
  blockId: string
  stats: ClusterStats
  hasData: boolean
  onClick?: () => void
  color: string
  icon: string
}

function StatBlock({ blockId, stats, hasData, onClick, color, icon }: StatBlockProps) {
  const IconComponent = ICONS[icon] || Server
  const colorClass = COLOR_CLASSES[color] || 'text-foreground'

  // Get value and label based on block type
  let value: string | number = '-'
  let label = ''
  let sublabel = ''
  let isClickable = !!onClick

  switch (blockId) {
    case 'clusters':
      value = formatStat(stats.total)
      label = 'Clusters'
      sublabel = 'total'
      break
    case 'healthy':
      value = formatStat(stats.healthy)
      label = 'Healthy'
      sublabel = 'clusters'
      isClickable = isClickable && stats.healthy > 0
      break
    case 'unhealthy':
      value = formatStat(stats.unhealthy)
      label = 'Unhealthy'
      sublabel = 'clusters'
      isClickable = isClickable && stats.unhealthy > 0
      break
    case 'unreachable':
      value = formatStat(stats.unreachable)
      label = 'Offline'
      sublabel = 'clusters'
      isClickable = isClickable && stats.unreachable > 0
      break
    case 'nodes':
      value = hasData ? formatStat(stats.totalNodes) : '-'
      label = 'Nodes'
      sublabel = 'total'
      isClickable = isClickable && hasData && stats.totalNodes > 0
      break
    case 'cpus':
      value = hasData ? formatStat(stats.totalCPUs) : '-'
      label = 'CPUs'
      sublabel = 'cores'
      isClickable = isClickable && hasData && stats.totalCPUs > 0
      break
    case 'memory':
      value = formatMemoryStat(stats.totalMemoryGB, hasData)
      label = 'Memory'
      sublabel = 'allocatable'
      isClickable = isClickable && hasData && stats.totalMemoryGB > 0
      break
    case 'storage':
      value = formatMemoryStat(stats.totalStorageGB, hasData)
      label = 'Storage'
      sublabel = 'ephemeral'
      isClickable = isClickable && hasData && stats.totalStorageGB > 0
      break
    case 'gpus':
      value = hasData ? formatStat(stats.totalGPUs) : '-'
      label = 'GPUs'
      sublabel = hasData && stats.allocatedGPUs > 0 ? `${formatStat(stats.allocatedGPUs)} allocated` : 'total'
      isClickable = isClickable && hasData && stats.totalGPUs > 0
      break
    case 'tpus':
      value = hasData ? formatStat(stats.totalTPUs ?? 0) : '-'
      label = 'TPUs'
      sublabel = hasData && (stats.allocatedTPUs ?? 0) > 0 ? `${formatStat(stats.allocatedTPUs ?? 0)} allocated` : 'total'
      isClickable = isClickable && hasData && (stats.totalTPUs ?? 0) > 0
      break
    case 'aius':
      value = hasData ? formatStat(stats.totalAIUs ?? 0) : '-'
      label = 'AIUs'
      sublabel = hasData && (stats.allocatedAIUs ?? 0) > 0 ? `${formatStat(stats.allocatedAIUs ?? 0)} allocated` : 'total'
      isClickable = isClickable && hasData && (stats.totalAIUs ?? 0) > 0
      break
    case 'xpus':
      value = hasData ? formatStat(stats.totalXPUs ?? 0) : '-'
      label = 'XPUs'
      sublabel = hasData && (stats.allocatedXPUs ?? 0) > 0 ? `${formatStat(stats.allocatedXPUs ?? 0)} allocated` : 'total'
      isClickable = isClickable && hasData && (stats.totalXPUs ?? 0) > 0
      break
    case 'pods':
      value = hasData ? formatStat(stats.totalPods) : '-'
      label = 'Pods'
      sublabel = 'running'
      isClickable = isClickable && hasData && stats.totalPods > 0
      break
  }

  // Value color - some blocks have colored values
  const valueColor = ['healthy'].includes(blockId) ? 'text-green-400' :
    ['unhealthy'].includes(blockId) ? 'text-orange-400' :
    ['unreachable'].includes(blockId) ? 'text-yellow-400' : 'text-foreground'

  return (
    <div
      className={`glass p-4 rounded-lg ${isClickable ? 'cursor-pointer hover:bg-secondary/50' : ''} transition-colors`}
      onClick={() => isClickable && onClick?.()}
    >
      <div className="flex items-center gap-2 mb-2">
        <IconComponent className={`w-5 h-5 shrink-0 ${colorClass}`} />
        <span className="text-sm text-muted-foreground truncate">{label}</span>
      </div>
      <div className={`text-3xl font-bold ${valueColor}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{sublabel}</div>
    </div>
  )
}

export function StatsOverview({
  stats,
  onFilterByStatus,
  onCPUClick,
  onMemoryClick,
  onStorageClick,
  onGPUClick,
  onTPUClick,
  onAIUClick,
  onXPUClick,
  onNodesClick,
  onPodsClick,
  dashboardType = 'clusters',
  configKey,
  showConfigButton = true,
}: StatsOverviewProps) {
  const { t: _t } = useTranslation()
  const { blocks, saveBlocks, visibleBlocks, defaultBlocks } = useStatsConfig(dashboardType, configKey)
  const [showConfig, setShowConfig] = useState(false)
  const { status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()

  // When demo mode is OFF and agent is not connected, force skeleton display
  const isAgentOffline = agentStatus === 'disconnected'
  const forceLoadingForOffline = !isDemoMode && isAgentOffline && !isInClusterMode()

  // Resource data is available if we have reachable clusters with node data
  const hasData = forceLoadingForOffline ? false : stats.hasResourceData !== false

  // Map block IDs to their click handlers
  const getClickHandler = (blockId: string) => {
    switch (blockId) {
      case 'clusters':
        return onFilterByStatus ? () => onFilterByStatus('all') : undefined
      case 'healthy':
        return onFilterByStatus ? () => onFilterByStatus('healthy') : undefined
      case 'unhealthy':
        return onFilterByStatus ? () => onFilterByStatus('unhealthy') : undefined
      case 'unreachable':
        return onFilterByStatus ? () => onFilterByStatus('unreachable') : undefined
      case 'nodes':
        return onNodesClick
      case 'cpus':
        return onCPUClick
      case 'memory':
        return onMemoryClick
      case 'storage':
        return onStorageClick
      case 'gpus':
        return onGPUClick
      case 'tpus':
        return onTPUClick
      case 'aius':
        return onAIUClick
      case 'xpus':
        return onXPUClick
      case 'pods':
        return onPodsClick
      default:
        return undefined
    }
  }

  // Dynamic grid columns based on visible blocks
  const gridCols = visibleBlocks.length <= 5 ? 'grid-cols-5' :
    visibleBlocks.length <= 6 ? 'grid-cols-6' :
    visibleBlocks.length <= 8 ? 'grid-cols-4 lg:grid-cols-8' :
    'grid-cols-5 lg:grid-cols-10'

  return (
    <div className="relative mb-6">
      {/* Configure button */}
      {showConfigButton && (
        <button
          onClick={() => setShowConfig(true)}
          className="absolute -top-8 right-0 p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
          title="Configure stats"
        >
          <Settings className="w-4 h-4" />
        </button>
      )}

      {/* Stats grid */}
      <div className={`grid ${gridCols} gap-3`}>
        {forceLoadingForOffline ? (
          // Show skeletons when agent is offline and demo mode is OFF
          visibleBlocks.map(block => (
            <div key={block.id} className="glass p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Skeleton variant="circular" width={20} height={20} />
                <Skeleton variant="text" width={80} height={16} />
              </div>
              <Skeleton variant="text" width={60} height={36} className="mb-1" />
              <Skeleton variant="text" width={100} height={12} />
            </div>
          ))
        ) : (
          visibleBlocks.map(block => (
            <StatBlock
              key={block.id}
              blockId={block.id}
              stats={stats}
              hasData={hasData}
              onClick={getClickHandler(block.id)}
              color={block.color}
              icon={block.icon}
            />
          ))
        )}
      </div>

      {/* Config modal */}
      <StatsConfigModal
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        blocks={blocks}
        onSave={saveBlocks}
        defaultBlocks={defaultBlocks}
        title="Configure Stats Overview"
      />
    </div>
  )
}
