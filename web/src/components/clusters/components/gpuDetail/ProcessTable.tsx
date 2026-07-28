import { Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GPUNode } from '../../../../hooks/useMCP'
import { StatusBadge } from '../../../ui/StatusBadge'

const GPU_UTIL_HIGH = 90
const GPU_UTIL_WARN = 70

function getUtilizationColor(percentage: number): string {
  if (percentage >= GPU_UTIL_HIGH) return 'text-red-400'
  if (percentage >= GPU_UTIL_WARN) return 'text-yellow-400'
  return 'text-green-400'
}

interface ProcessTableProps {
  gpuNodes: GPUNode[]
}

export function ProcessTable({ gpuNodes }: ProcessTableProps) {
  const { t } = useTranslation()

  if (gpuNodes.length === 0) {
    return null
  }

  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <Server className="w-4 h-4" />
        GPU Nodes ({gpuNodes.length})
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">{t('common.node')}</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">{t('common.cluster')}</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">GPU Type</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('common.memory')}</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('common.used')}</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('common.available')}</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {gpuNodes.map(node => {
              const available = node.gpuCount - node.gpuAllocated
              const utilPercent = node.gpuCount > 0 ? Math.round((node.gpuAllocated / node.gpuCount) * 100) : 0
              const memoryGB = node.gpuMemoryMB ? Math.round(node.gpuMemoryMB / 1024) : null
              return (
                <tr
                  key={`${node.cluster}-${node.name}`}
                  className="border-b border-border/50 hover:bg-secondary/30"
                >
                  <td className="py-2 px-3 font-mono text-xs text-foreground">
                    <div className="flex items-center gap-1">
                      {node.name}
                      {node.migCapable && (
                        <StatusBadge color="purple" size="xs">
                          MIG
                        </StatusBadge>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{node.cluster}</td>
                  <td className="py-2 px-3 text-muted-foreground">
                    <div>
                      {node.gpuType}
                      {node.gpuFamily && (
                        <span className="text-xs text-muted-foreground/70 ml-1 capitalize">
                          ({node.gpuFamily})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-center text-muted-foreground">
                    {memoryGB ? `${memoryGB}GB` : '-'}
                  </td>
                  <td className={`py-2 px-3 text-center ${getUtilizationColor(utilPercent)}`}>
                    {node.gpuAllocated}
                  </td>
                  <td className="py-2 px-3 text-center text-green-400">{available}</td>
                  <td className="py-2 px-3 text-center text-foreground">{node.gpuCount}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
