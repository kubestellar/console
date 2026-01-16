import { RefreshCw, Cpu, HardDrive, Zap } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'

interface ResourceCapacityProps {
  config?: Record<string, unknown>
}

export function ResourceCapacity({ config }: ResourceCapacityProps) {
  const { clusters, isLoading, refetch } = useClusters()

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  // Calculate totals from clusters
  const totals = clusters.reduce(
    (acc, c) => ({
      nodes: acc.nodes + (c.nodeCount || 0),
      pods: acc.pods + (c.podCount || 0),
    }),
    { nodes: 0, pods: 0 }
  )

  // Mock resource data - in real implementation this would come from metrics
  const resourceData = {
    cpu: {
      used: Math.round(totals.nodes * 2.4),
      total: totals.nodes * 4,
      unit: 'cores',
    },
    memory: {
      used: Math.round(totals.nodes * 6.2),
      total: totals.nodes * 16,
      unit: 'GB',
    },
    pods: {
      used: totals.pods,
      total: totals.nodes * 110,
      unit: 'pods',
    },
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-muted-foreground">Resource Capacity</span>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Resource metrics */}
      <div className="flex-1 space-y-4">
        <ResourceBar
          icon={<Cpu className="w-4 h-4" />}
          label="CPU"
          used={resourceData.cpu.used}
          total={resourceData.cpu.total}
          unit={resourceData.cpu.unit}
          color="blue"
        />
        <ResourceBar
          icon={<HardDrive className="w-4 h-4" />}
          label="Memory"
          used={resourceData.memory.used}
          total={resourceData.memory.total}
          unit={resourceData.memory.unit}
          color="purple"
        />
        <ResourceBar
          icon={<Zap className="w-4 h-4" />}
          label="Pods"
          used={resourceData.pods.used}
          total={resourceData.pods.total}
          unit={resourceData.pods.unit}
          color="green"
        />
      </div>

      {/* Summary */}
      <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-white">{totals.nodes}</p>
          <p className="text-xs text-muted-foreground">Total Nodes</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{clusters.length}</p>
          <p className="text-xs text-muted-foreground">Clusters</p>
        </div>
      </div>
    </div>
  )
}

interface ResourceBarProps {
  icon: React.ReactNode
  label: string
  used: number
  total: number
  unit: string
  color: 'blue' | 'purple' | 'green' | 'yellow' | 'red'
}

function ResourceBar({ icon, label, used, total, unit, color }: ResourceBarProps) {
  const percentage = total > 0 ? Math.round((used / total) * 100) : 0

  const colorClasses = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  }

  const bgClasses = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={bgClasses[color]}>{icon}</span>
          <span className="text-sm text-white">{label}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {used} / {total} {unit}
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} transition-all duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex justify-end mt-0.5">
        <span className={`text-xs ${percentage > 80 ? 'text-red-400' : 'text-muted-foreground'}`}>
          {percentage}%
        </span>
      </div>
    </div>
  )
}
