import { ArrowUp, Rocket } from 'lucide-react'
import { Button } from '../ui/Button'
import { CardAIActions } from '../../lib/cards/CardComponents'
import { getStatusIcon, type UpgradeItem } from './upgradeHelpers'

interface UpgradeClusterRowProps {
  cluster: UpgradeItem
  onDrill: (clusterName: string, data?: Record<string, unknown>) => void
  onStartUpgrade: (clusterName: string, currentVersion: string, targetVersion: string) => void
}

export function UpgradeClusterRow({ cluster, onDrill, onStartUpgrade }: UpgradeClusterRowProps) {
  return (
    <div
      className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
    >
      <div
        className="cursor-pointer"
        onClick={() => onDrill(cluster.name, {
          tab: 'upgrade',
          version: cluster.currentVersion,
          targetVersion: cluster.targetVersion,
        })}
      >
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 gap-2">
          <span className="text-sm font-medium text-foreground truncate min-w-0 flex-1">{cluster.name}</span>
          <span className="shrink-0">{getStatusIcon(cluster.status)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{cluster.currentVersion}</span>
          {cluster.targetVersion && cluster.targetVersion !== cluster.currentVersion && (
            <>
              <ArrowUp className="w-3 h-3" />
              <span className="font-mono text-green-400">{cluster.targetVersion}</span>
            </>
          )}
        </div>
      </div>
      {cluster.status === 'available' && (
        <Button
          variant="accent"
          size="sm"
          fullWidth
          icon={<Rocket className="w-3 h-3" />}
          onClick={(event) => {
            event.stopPropagation()
            onStartUpgrade(cluster.name, cluster.currentVersion, cluster.targetVersion)
          }}
          aria-label={`Start upgrade of ${cluster.name} to ${cluster.targetVersion}`}
        >
          Start Upgrade to {cluster.targetVersion}
        </Button>
      )}
      {(cluster.status === 'unreachable' || cluster.status === 'available') && (
        <CardAIActions
          resource={{ kind: 'Cluster', name: cluster.name, status: cluster.status }}
          issues={[{
            name: cluster.status === 'unreachable' ? 'Cluster unreachable' : 'Upgrade available',
            message: cluster.status === 'unreachable'
              ? `Cluster ${cluster.name} is unreachable and cannot be queried for version info`
              : `Cluster ${cluster.name} can be upgraded from ${cluster.currentVersion} to ${cluster.targetVersion}`,
          }]}
          className="mt-2"
        />
      )}
    </div>
  )
}
