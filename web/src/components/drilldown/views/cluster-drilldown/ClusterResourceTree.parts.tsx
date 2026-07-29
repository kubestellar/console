import React from 'react';
import { ChevronRight, ChevronDown, Server, Box, Layers, Database, Network, HardDrive, Search, AlertTriangle, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

              )}

              {/* Deployments with Issues (when issues lens active) */}
              {activeLens === 'issues' && issueCounts.deployments > 0 && (
                <div>
                  <div
                    onClick={() => toggleSection('deployment-issues')}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                  >
                    {expandedSections.has('deployment-issues') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <AlertTriangle className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-medium text-foreground">Deployment Issues</span>
                    <StatusBadge color="orange" size="xs" rounded="full">
                      {issueCounts.deployments}
                    </StatusBadge>
                  </div>

                  {expandedSections.has('deployment-issues') && (
                    <div className="ml-6 border-l-2 border-orange-500/30 pl-4 mt-1 space-y-1">
                      {unhealthyDeployments.map((dep, i) => (
                        <div
                          key={i}
                          onClick={() => drillToNamespace(effectiveClusterName, dep.namespace)}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                        >
                          <XCircle className="w-3 h-3 text-orange-400" />
                          <span className="text-sm text-foreground">{dep.name}</span>
                          <span className="text-xs text-muted-foreground">{dep.namespace}</span>
                          <span className="text-xs text-orange-400">{dep.readyReplicas}/{dep.replicas}</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pod Issues (when issues lens active) */}
              {activeLens === 'issues' && issueCounts.pods > 0 && (
                <div>
                  <div
                    onClick={() => toggleSection('pod-issues')}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                  >
                    {expandedSections.has('pod-issues') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-medium text-foreground">Pod Issues</span>
                    <StatusBadge color="red" size="xs" rounded="full">
                      {issueCounts.pods}
                    </StatusBadge>
                  </div>

                  {expandedSections.has('pod-issues') && (
                    <div className="ml-6 border-l-2 border-red-500/30 pl-4 mt-1 space-y-1">
                      {podIssues.slice(0, 10).map((issue, i) => (
                        <div
                          key={i}
                          onClick={() => drillToPod(effectiveClusterName, issue.namespace, issue.name, { ...issue })}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                        >
                          <XCircle className="w-3 h-3 text-red-400" />
                          <span className="text-sm text-foreground">{issue.name}</span>
                          <span className="text-xs text-muted-foreground">{issue.namespace}</span>
                          <span className="text-xs text-red-400">{issue.status}</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                        </div>
                      ))}
                      {podIssues.length > 10 && (
                        <div className="text-xs text-muted-foreground p-2">
                          +{podIssues.length - 10} more pod issues...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Storage Resources */}
              {(activeLens === 'storage' || (activeLens === 'all' && filteredPVCs.length > 0)) && filteredPVCs.length > 0 && (
                <div>
                  <div
                    onClick={() => toggleSection('storage')}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                  >
                    {expandedSections.has('storage') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <HardDrive className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-foreground">{t('common.pvcs')}</span>
                    <span className="text-xs text-muted-foreground">({filteredPVCs.length})</span>
                    {issueCounts.pvcs > 0 && (
                      <StatusBadge color="yellow" size="xs" rounded="full" className="ml-1">
                        {issueCounts.pvcs} pending
                      </StatusBadge>
                    )}
                  </div>

                  {expandedSections.has('storage') && (
                    <div className="ml-6 border-l-2 border-green-500/30 pl-4 mt-1 space-y-1">
                      {filteredPVCs.slice(0, 10).map((pvc, i) => (
                        <div
                          key={i}
                          onClick={() => drillToNamespace(effectiveClusterName, pvc.namespace)}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                        >
                          <div className={`w-2 h-2 rounded-full ${pvc.status === 'Bound' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                          <span className="text-sm text-foreground">{pvc.name}</span>
                          <span className="text-xs text-muted-foreground">{pvc.namespace}</span>
                          <span className={`text-xs ${pvc.status === 'Bound' ? 'text-green-400' : 'text-yellow-400'}`}>
                            {pvc.status}
                          </span>
                          {pvc.capacity && <span className="text-xs text-muted-foreground">{pvc.capacity}</span>}
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                        </div>
                      ))}
                      {filteredPVCs.length > 10 && (
                        <div className="text-xs text-muted-foreground p-2">
                          +{filteredPVCs.length - 10} more PVCs...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Network Resources */}
              {activeLens === 'network' && filteredServices.length > 0 && (
                <div>
                  <div
                    onClick={() => toggleSection('network')}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                  >
                    {expandedSections.has('network') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Network className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-foreground">{t('common.services')}</span>
                    <span className="text-xs text-muted-foreground">({filteredServices.length})</span>
                  </div>

                  {expandedSections.has('network') && (
                    <div className="ml-6 border-l-2 border-blue-500/30 pl-4 mt-1 space-y-1">
                      {filteredServices.slice(0, 15).map((svc, i) => (
                        <div
                          key={i}
                          onClick={() => drillToNamespace(effectiveClusterName, svc.namespace)}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                        >
                          <Network className="w-3 h-3 text-blue-400" />
                          <span className="text-sm text-foreground">{svc.name}</span>
                          <span className="text-xs text-muted-foreground">{svc.namespace}</span>
                          <StatusBadge color="blue" size="xs">{svc.type}</StatusBadge>
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                        </div>
                      ))}
                      {filteredServices.length > 15 && (
                        <div className="text-xs text-muted-foreground p-2">
                          +{filteredServices.length - 15} more services...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state for filters */}
              {!hasVisibleResourceData && (
                <div className="text-center text-muted-foreground text-sm py-4">
                  No resources match the current filter
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
