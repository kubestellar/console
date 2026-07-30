import { useState } from 'react'
import { Database } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
import { Gauge } from '../../charts/Gauge'
import { useTranslation } from 'react-i18next'
import { ResourceModalProps, Skeleton, formatMemory } from './shared'

interface StorageDetailModalProps extends ResourceModalProps {
  totalStorageGB: number
  allocatableStorageGB: number
  usedStorageGB?: number
  pvcs?: Array<{
    name: string
    namespace: string
    storageClass: string
    capacityGB: number
    usedGB?: number
    status: string
  }>
  nodes?: Array<{
    name: string
    ephemeralStorageGB: number
    ephemeralUsedGB?: number
  }>
  isLoading?: boolean
}

export function StorageDetailModal({
  clusterName,
  totalStorageGB,
  allocatableStorageGB,
  usedStorageGB = 0,
  pvcs = [],
  nodes = [],
  isLoading,
  onClose }: StorageDetailModalProps) {
  const { t } = useTranslation()
  const [showPVCs, setShowPVCs] = useState(true)
  const [showNodes, setShowNodes] = useState(false)

  const utilizationPercent = allocatableStorageGB > 0 ? Math.round((usedStorageGB / allocatableStorageGB) * 100) : 0

  return (
    <BaseModal isOpen={true} onClose={onClose} size="lg">
      <BaseModal.Header
        title="Storage Resources"
        description={clusterName}
        icon={Database}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[70vh]">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">{t('common.ephemeralStorage')}</div>
                <div className="text-3xl font-bold text-foreground">{formatMemory(totalStorageGB)}</div>
              </div>
              <div className="p-4 rounded-lg bg-card/50 border border-border">
                <div className="text-sm text-muted-foreground mb-1">{t('common.allocatable')}</div>
                <div className="text-3xl font-bold text-foreground">{formatMemory(allocatableStorageGB)}</div>
              </div>
            </div>

            {/* Utilization */}
            <div className="mb-6 p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">{t('common.storageUtilization')}</span>
                <span className={`text-sm ${utilizationPercent > 80 ? 'text-red-400' : utilizationPercent > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {utilizationPercent}% used
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Gauge value={usedStorageGB} max={allocatableStorageGB} size="lg" label="Used" />
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">{t('common.used')}</div>
                  <div className="text-xl font-bold text-foreground">{formatMemory(usedStorageGB)}</div>
                  <div className="text-sm text-muted-foreground mt-2">{t('common.available')}</div>
                  <div className="text-lg font-medium text-foreground">{formatMemory(allocatableStorageGB - usedStorageGB)}</div>
                </div>
              </div>
            </div>

            {/* Tab buttons */}
            <div className="flex gap-2 mb-4">
              {pvcs.length > 0 && (
                <button
                  onClick={() => { setShowPVCs(true); setShowNodes(false) }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${showPVCs ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:bg-secondary'}`}
                >
                  PVCs ({pvcs.length})
                </button>
              )}
              {nodes.length > 0 && (
                <button
                  onClick={() => { setShowPVCs(false); setShowNodes(true) }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${showNodes ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:bg-secondary'}`}
                >
                  Nodes ({nodes.length})
                </button>
              )}
            </div>

            {/* PVCs list */}
            {showPVCs && pvcs.length > 0 && (
              <div className="space-y-2">
                {pvcs.map((pvc, i) => (
                  <div key={i} className="p-3 rounded-lg bg-card/50 border border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-sm text-foreground">{pvc.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">({pvc.namespace})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${pvc.status === 'Bound' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {pvc.status}
                        </span>
                        <span className="text-sm text-muted-foreground">{formatMemory(pvc.capacityGB)}</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Storage Class: {pvc.storageClass}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Nodes ephemeral storage */}
            {showNodes && nodes.length > 0 && (
              <div className="space-y-2">
                {nodes.map((node, i) => {
                  const nodePercent = node.ephemeralStorageGB > 0
                    ? Math.round(((node.ephemeralUsedGB || 0) / node.ephemeralStorageGB) * 100)
                    : 0
                  return (
                    <div key={i} className="p-3 rounded-lg bg-card/50 border border-border">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-foreground">{node.name}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${nodePercent > 80 ? 'bg-red-500/20 text-red-400' : nodePercent > 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                            {nodePercent}%
                          </span>
                          <span className="text-sm text-muted-foreground">{formatMemory(node.ephemeralStorageGB)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </BaseModal.Content>
    </BaseModal>
  )
}
