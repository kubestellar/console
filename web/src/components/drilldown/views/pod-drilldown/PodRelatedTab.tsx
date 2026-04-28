import React from 'react'
import { FileText, Loader2, Box, Layers, Server, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import { Button } from '../../../ui/Button'
import { StatusBadge } from '../../../ui/StatusBadge'
import { useTranslation } from 'react-i18next'
import type { RelatedResource } from './types'

/** Indent step (px) per tree depth level in the resource hierarchy */
const TREE_INDENT_STEP_PX = 24
/** Connector offset (px) for tree-drawing lines linking parent to child */
const TREE_CONNECTOR_OFFSET_PX = 12

export interface PodRelatedTabProps {
  podName: string
  namespace: string
  agentConnected: boolean
  relatedLoading: boolean
  relatedError?: string | null
  ownerChain: RelatedResource[]
  configMaps: string[]
  secrets: string[]
  pvcs: string[]
  serviceAccount: string | null
  fetchRelatedResources: (force: boolean) => void
  drillToDeployment: (cluster: string, namespace: string, name: string) => void
  drillToReplicaSet: (cluster: string, namespace: string, name: string) => void
  drillToConfigMap: (cluster: string, namespace: string, name: string) => void
  drillToSecret: (cluster: string, namespace: string, name: string) => void
  drillToServiceAccount: (cluster: string, namespace: string, name: string) => void
  drillToPVC: (cluster: string, namespace: string, name: string) => void
  cluster: string
}

export function PodRelatedTab({
  podName,
  namespace,
  agentConnected,
  relatedLoading,
  relatedError,
  ownerChain,
  configMaps,
  secrets,
  pvcs,
  serviceAccount,
  fetchRelatedResources,
  drillToDeployment,
  drillToReplicaSet,
  drillToConfigMap,
  drillToSecret,
  drillToServiceAccount,
  drillToPVC,
  cluster,
}: PodRelatedTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {relatedLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">{t('drilldown.status.discoveringRelated')}</span>
        </div>
      ) : relatedError ? (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">{relatedError}</p>
          <button
            onClick={() => fetchRelatedResources(true)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{t('common.retry')}</span>
          </button>
        </div>
      ) : (
        <>
          {/* Tree View of Resource Relationships */}
          <div className="font-mono text-sm">
            {/* Owner Chain - show from top (Deployment) down */}
            {[...ownerChain].reverse().map((resource, index) => {
              const isDeployment = resource.kind === 'Deployment'
              const isReplicaSet = resource.kind === 'ReplicaSet'
              const indent = index * TREE_INDENT_STEP_PX
              const isLast = index === ownerChain.length - 1

              return (
                <div key={`${resource.kind}-${resource.name}`} className="relative">
                  {/* Vertical line from parent */}
                  {index > 0 && (
                    <div
                      className="absolute border-l-2 border-muted-foreground/30"
                      style={{ left: indent - TREE_CONNECTOR_OFFSET_PX, top: -8, height: 20 }}
                    />
                  )}
                  {/* Horizontal connector */}
                  {index > 0 && (
                    <div
                      className="absolute border-t-2 border-muted-foreground/30"
                      style={{ left: indent - TREE_CONNECTOR_OFFSET_PX, top: TREE_CONNECTOR_OFFSET_PX, width: TREE_CONNECTOR_OFFSET_PX }}
                    />
                  )}
                  {/* Vertical line to children */}
                  {!isLast && (
                    <div
                      className="absolute border-l-2 border-muted-foreground/30"
                      style={{ left: indent + TREE_CONNECTOR_OFFSET_PX, top: TREE_INDENT_STEP_PX, height: `calc(100% - ${TREE_CONNECTOR_OFFSET_PX}px)` }}
                    />
                  )}
                  <div style={{ paddingLeft: indent }} className="py-1">
                    <button
                      onClick={() => {
                        if (isDeployment) drillToDeployment(cluster, namespace, resource.name)
                        else if (isReplicaSet) drillToReplicaSet(cluster, namespace, resource.name)
                      }}
                      className={cn(
                        'px-3 py-2 rounded-lg border inline-flex items-center gap-2 group cursor-pointer transition-all hover:scale-[1.02]',
                        isDeployment && 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 hover:border-green-500/50',
                        isReplicaSet && 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50'
                      )}
                    >
                      {isDeployment && (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      )}
                      {isReplicaSet && <Layers className="w-4 h-4" />}
                      <span className="text-xs text-muted-foreground">{resource.kind}</span>
                      <span>{resource.name}</span>
                      <svg className="w-3 h-3 opacity-50 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Current Pod - the focal point */}
            <div className="relative">
              {ownerChain.length > 0 && (
                <>
                  <div
                    className="absolute border-l-2 border-muted-foreground/30"
                    style={{ left: ownerChain.length * 24 - 12, top: -8, height: 20 }}
                  />
                  <div
                    className="absolute border-t-2 border-muted-foreground/30"
                    style={{ left: ownerChain.length * 24 - 12, top: 12, width: 12 }}
                  />
                </>
              )}
              {/* Vertical line to children if any */}
              {(serviceAccount || configMaps.length > 0 || secrets.length > 0 || pvcs.length > 0) && (
                <div
                  className="absolute border-l-2 border-cyan-500/30"
                  style={{ left: ownerChain.length * TREE_INDENT_STEP_PX + TREE_CONNECTOR_OFFSET_PX, top: 36, height: `calc(100% - ${TREE_INDENT_STEP_PX}px)` }}
                />
              )}
              <div style={{ paddingLeft: ownerChain.length * TREE_INDENT_STEP_PX }} className="py-1">
                <div className="px-3 py-2 rounded-lg bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400 inline-flex items-center gap-2 shadow-lg shadow-cyan-500/10">
                  <Box className="w-4 h-4" />
                  <span className="text-xs text-cyan-300">{t('common.pod')}</span>
                  <span className="font-semibold">{podName}</span>
                  <StatusBadge color="cyan">current</StatusBadge>
                </div>
              </div>
            </div>

            {/* Pod's referenced resources as children */}
            {(() => {
              const podIndent = (ownerChain.length + 1) * 24
              const children: { type: string; items: string[]; color: string; icon: React.ReactNode; onClick: (name: string) => void }[] = []

              if (serviceAccount) {
                children.push({
                  type: 'ServiceAccount',
                  items: [serviceAccount],
                  color: 'purple',
                  icon: <Server className="w-4 h-4" />,
                  onClick: (name) => drillToServiceAccount(cluster, namespace, name)
                })
              }
              if (configMaps.length > 0) {
                children.push({
                  type: 'ConfigMaps',
                  items: configMaps,
                  color: 'yellow',
                  icon: <FileText className="w-4 h-4" />,
                  onClick: (name) => drillToConfigMap(cluster, namespace, name)
                })
              }
              if (secrets.length > 0) {
                children.push({
                  type: 'Secrets',
                  items: secrets,
                  color: 'red',
                  icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  ),
                  onClick: (name) => drillToSecret(cluster, namespace, name)
                })
              }
              if (pvcs.length > 0) {
                children.push({
                  type: 'PVCs',
                  items: pvcs,
                  color: 'green',
                  icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                  ),
                  onClick: (name) => drillToPVC(cluster, namespace, name)
                })
              }

              return children.map((child, childIndex) => {
                const isLastChild = childIndex === children.length - 1

                return (
                  <div key={child.type} className="relative">
                    {/* Vertical line continuation */}
                    {!isLastChild && (
                      <div
                        className="absolute border-l-2 border-cyan-500/30"
                        style={{ left: podIndent - 12, top: 0, height: '100%' }}
                      />
                    )}
                    {/* Connector to this child */}
                    <div
                      className="absolute border-l-2 border-cyan-500/30"
                      style={{ left: podIndent - 12, top: 0, height: child.items.length > 1 ? 20 : 16 }}
                    />
                    <div
                      className="absolute border-t-2 border-cyan-500/30"
                      style={{ left: podIndent - 12, top: child.items.length > 1 ? 20 : 16, width: 12 }}
                    />

                    <div style={{ paddingLeft: podIndent }} className="py-1">
                      {child.items.length === 1 ? (
                        // Single item - show inline
                        <button
                          onClick={() => child.onClick(child.items[0])}
                          className={cn(
                            'px-3 py-2 rounded-lg border inline-flex items-center gap-2 group cursor-pointer transition-all hover:scale-[1.02]',
                            child.color === 'purple' && 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/50',
                            child.color === 'yellow' && 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500/50',
                            child.color === 'red' && 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50'
                          )}
                        >
                          {child.icon}
                          <span className="text-xs text-muted-foreground">{child.type.replace(/s$/, '')}</span>
                          <span>{child.items[0]}</span>
                          <svg className="w-3 h-3 opacity-50 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ) : (
                        // Multiple items - show as expandable group
                        <div className="space-y-1">
                          <div className={cn(
                            'px-3 py-1.5 rounded-lg border inline-flex items-center gap-2 text-xs',
                            child.color === 'yellow' && 'bg-yellow-500/5 border-yellow-500/20 text-yellow-400',
                            child.color === 'red' && 'bg-red-500/5 border-red-500/20 text-red-400'
                          )}>
                            {child.icon}
                            <span>{child.type}</span>
                            <span className="px-1.5 py-0.5 rounded bg-current/20">{child.items.length}</span>
                          </div>
                          <div className="relative ml-6 space-y-1">
                            {/* Vertical line for sub-items */}
                            <div
                              className={cn(
                                'absolute border-l-2',
                                child.color === 'yellow' && 'border-yellow-500/30',
                                child.color === 'red' && 'border-red-500/30'
                              )}
                              style={{ left: -TREE_CONNECTOR_OFFSET_PX, top: 0, height: 'calc(100% - 16px)' }}
                            />
                            {child.items.map((item, itemIndex) => {
                              const isLastItem = itemIndex === child.items.length - 1
                              return (
                                <div key={item} className="relative">
                                  {/* Connector */}
                                  <div
                                    className={cn(
                                      'absolute border-l-2',
                                      child.color === 'yellow' && 'border-yellow-500/30',
                                      child.color === 'red' && 'border-red-500/30'
                                    )}
                                    style={{ left: -12, top: 0, height: isLastItem ? 12 : 24 }}
                                  />
                                  <div
                                    className={cn(
                                      'absolute border-t-2',
                                      child.color === 'yellow' && 'border-yellow-500/30',
                                      child.color === 'red' && 'border-red-500/30'
                                    )}
                                    style={{ left: -12, top: 12, width: 12 }}
                                  />
                                  <button
                                    onClick={() => child.onClick(item)}
                                    className={cn(
                                      'px-2 py-1 rounded border inline-flex items-center gap-2 group cursor-pointer transition-all hover:scale-[1.02]',
                                      child.color === 'yellow' && 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500/50',
                                      child.color === 'red' && 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50'
                                    )}
                                  >
                                    <span className="text-xs">{item}</span>
                                    <svg className="w-3 h-3 opacity-50 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            })()}

            {/* No owner chain - show pod as root */}
            {ownerChain.length === 0 && !serviceAccount && configMaps.length === 0 && secrets.length === 0 && (
              <div className="py-1">
                <div className="px-3 py-2 rounded-lg bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400 inline-flex items-center gap-2 shadow-lg shadow-cyan-500/10">
                  <Box className="w-4 h-4" />
                  <span className="text-xs text-cyan-300">{t('common.pod')}</span>
                  <span className="font-semibold">{podName}</span>
                  <StatusBadge color="cyan">current</StatusBadge>
                </div>
                <p className="text-muted-foreground text-sm mt-3">{t('drilldown.empty.noRelatedResourcesDiscovered')}</p>
              </div>
            )}
          </div>

          {/* Refresh button */}
          {agentConnected && (
            <div className="pt-4 border-t border-border mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchRelatedResources(true)}
                icon={<Loader2 className={cn('w-4 h-4', relatedLoading && 'animate-spin')} />}
              >
                Refresh
              </Button>
            </div>
          )}

          {/* Agent not connected warning */}
          {!agentConnected && ownerChain.length === 0 && configMaps.length === 0 && secrets.length === 0 && !serviceAccount && (
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
              <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('drilldown.empty.connectAgentRelated')}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
