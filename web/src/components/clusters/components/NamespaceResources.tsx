import { useTranslation } from 'react-i18next'
import { Box, Layers, Network, Activity, Briefcase, Lock, Settings, User, HardDrive } from 'lucide-react'
import { TechnicalAcronym } from '../../shared/TechnicalAcronym'
import { ResourceTypeAccordion } from './ResourceTypeAccordion'
import { SimpleResourceRow } from './SimpleResourceRow'
import { useNamespaceResources } from './useNamespaceResources'
import {
  NamespaceLoadingView,
  NamespaceTimedOutView,
  NamespaceEmptyState,
  ResourceViewToolbar,
  ListResourceRow,
  DeploymentTreeRow,
} from './NamespaceResources.parts'

interface NamespaceResourcesProps {
  clusterName: string
  namespace: string
  onClose?: () => void
}

export function NamespaceResources({ clusterName, namespace, onClose }: NamespaceResourcesProps) {
  const { t } = useTranslation()
  const {
    pods,
    deployments,
    services,
    jobs,
    hpas,
    configmaps,
    secrets,
    serviceAccounts,
    pvcs,
    allResources,
    podsByDeployment,
    isInitialLoading,
    isPartiallyLoading,
    isTimedOut,
    deploymentsLoading,
    podsRefreshing,
    podsLastRefresh,
    viewMode,
    setViewMode,
    expandedTypes,
    expandedItems,
    toggleType,
    toggleItem,
    handleResourceClick,
  } = useNamespaceResources(clusterName, namespace, onClose)

  // Only show full loading screen if nothing has loaded yet
  if (isInitialLoading && pods.length === 0 && deployments.length === 0) {
    return <NamespaceLoadingView />
  }

  // Show timeout message if loading took too long and we still have no data
  if (isTimedOut && pods.length === 0 && deployments.length === 0) {
    return <NamespaceTimedOutView />
  }

  const hasResources = allResources.length > 0

  return (
    <div className="pt-2">
      <ResourceViewToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        isPartiallyLoading={isPartiallyLoading}
        isRefreshing={podsRefreshing}
        lastUpdated={podsLastRefresh}
      />

      {viewMode === 'list' ? (
        /* List View - Individual resources with icons */
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {allResources.slice(0, 50).map((resource, idx) => (
            <ListResourceRow
              key={`${resource.kind}-${resource.name}-${idx}`}
              resource={resource}
              onClick={() => handleResourceClick(resource.kind, resource.name, resource.namespace || namespace, resource.data)}
            />
          ))}
          {allResources.length > 50 && <div className="text-xs text-muted-foreground text-center py-2">+{allResources.length - 50} more resources</div>}
        </div>
      ) : (
        /* Tree View */
        <div className="font-mono text-xs max-h-[300px] overflow-y-auto">
          <div className="border-l border-border/50 pl-2">
            {deployments.length > 0 && (
              <ResourceTypeAccordion
                typeKey="deployments"
                isExpanded={expandedTypes.has('deployments')}
                onToggle={toggleType}
                disabled={deploymentsLoading}
                badgeColor="purple"
                badgeIcon={<Layers className="w-3 h-3" />}
                label="Deploy"
                countLabel={`(${deployments.length})`}
              >
                {deployments.map((dep) => (
                  <DeploymentTreeRow
                    key={dep.name}
                    dep={dep}
                    depPods={podsByDeployment.byDeployment[dep.name] || []}
                    isExpanded={expandedItems.has(`dep-${dep.name}`)}
                    onToggle={() => toggleItem(`dep-${dep.name}`)}
                    onDeploymentClick={() => handleResourceClick('Deployment', dep.name, dep.namespace, { replicas: dep.replicas, readyReplicas: dep.readyReplicas, status: dep.status })}
                    onPodClick={(pod) => handleResourceClick('Pod', pod.name, pod.namespace, { status: pod.status, restarts: pod.restarts })}
                  />
                ))}
              </ResourceTypeAccordion>
            )}

            {podsByDeployment.standalone.length > 0 && (
              <ResourceTypeAccordion
                typeKey="pods"
                isExpanded={expandedTypes.has('pods')}
                onToggle={toggleType}
                badgeColor="blue"
                badgeIcon={<Box className="w-3 h-3" />}
                label={t('common.pod')}
                countLabel={`Standalone (${podsByDeployment.standalone.length})`}
              >
                {podsByDeployment.standalone.slice(0, 20).map(pod => (
                  <SimpleResourceRow
                    key={pod.name}
                    icon={<Box className="w-3 h-3 text-blue-400" />}
                    name={pod.name}
                    primaryText={pod.status}
                    primaryClassName={pod.status === 'Running' ? 'text-green-400' : pod.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}
                    onClick={() => handleResourceClick('Pod', pod.name, pod.namespace, { status: pod.status, restarts: pod.restarts })}
                  />
                ))}
                {podsByDeployment.standalone.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{podsByDeployment.standalone.length - 20} more</div>}
              </ResourceTypeAccordion>
            )}

            {services.length > 0 && (
              <ResourceTypeAccordion
                typeKey="services"
                isExpanded={expandedTypes.has('services')}
                onToggle={toggleType}
                badgeColor="cyan"
                badgeIcon={<Network className="w-3 h-3" />}
                label="Svc"
                countLabel={`(${services.length})`}
              >
                {services.map(svc => (
                  <SimpleResourceRow
                    key={svc.name}
                    icon={<Network className="w-3 h-3 text-cyan-400" />}
                    name={svc.name}
                    primaryText={svc.type}
                    primaryClassName="text-cyan-400"
                    secondaryText={svc.ports && svc.ports.length > 0 ? svc.ports[0] : undefined}
                    onClick={() => handleResourceClick('Service', svc.name, svc.namespace, { type: svc.type, clusterIP: svc.clusterIP, ports: svc.ports })}
                  />
                ))}
              </ResourceTypeAccordion>
            )}

            {jobs.length > 0 && (
              <ResourceTypeAccordion
                typeKey="jobs"
                isExpanded={expandedTypes.has('jobs')}
                onToggle={toggleType}
                badgeColor="yellow"
                badgeIcon={<Briefcase className="w-3 h-3" />}
                label="Job"
                countLabel={`(${jobs.length})`}
              >
                {jobs.map(job => (
                  <SimpleResourceRow
                    key={job.name}
                    icon={<Briefcase className="w-3 h-3 text-yellow-400" />}
                    name={job.name}
                    primaryText={job.status}
                    primaryClassName={job.status === 'Complete' ? 'text-green-400' : job.status === 'Running' ? 'text-green-400' : 'text-red-400'}
                    secondaryText={job.completions}
                    onClick={() => handleResourceClick('Job', job.name, job.namespace, { status: job.status, completions: job.completions })}
                  />
                ))}
              </ResourceTypeAccordion>
            )}

            {hpas.length > 0 && (
              <ResourceTypeAccordion
                typeKey="hpas"
                isExpanded={expandedTypes.has('hpas')}
                onToggle={toggleType}
                badgeColor="purple"
                badgeIcon={<Activity className="w-3 h-3" />}
                label={<TechnicalAcronym term="HPA">HPA</TechnicalAcronym>}
                countLabel={`(${hpas.length})`}
              >
                {hpas.map(hpa => (
                  <SimpleResourceRow
                    key={hpa.name}
                    icon={<Activity className="w-3 h-3 text-purple-400" />}
                    name={hpa.name}
                    primaryText={`${hpa.currentReplicas}/${hpa.minReplicas}-${hpa.maxReplicas}`}
                    primaryClassName="text-purple-400"
                    secondaryText={`→ ${hpa.reference}`}
                    onClick={() => handleResourceClick('HPA', hpa.name, hpa.namespace, { reference: hpa.reference, minReplicas: hpa.minReplicas, maxReplicas: hpa.maxReplicas })}
                  />
                ))}
              </ResourceTypeAccordion>
            )}

            {serviceAccounts.length > 0 && (
              <ResourceTypeAccordion
                typeKey="serviceaccounts"
                isExpanded={expandedTypes.has('serviceaccounts')}
                onToggle={toggleType}
                badgeColor="cyan"
                badgeIcon={<User className="w-3 h-3" />}
                label="SA"
                countLabel={`(${serviceAccounts.length})`}
              >
                {serviceAccounts.slice(0, 20).map(sa => (
                  <SimpleResourceRow
                    key={sa.name}
                    icon={<User className="w-3 h-3 text-cyan-400" />}
                    name={sa.name}
                    secondaryText={`${sa.secrets?.length || 0} secrets`}
                    onClick={() => handleResourceClick('ServiceAccount', sa.name, sa.namespace, { secrets: sa.secrets, imagePullSecrets: sa.imagePullSecrets })}
                  />
                ))}
                {serviceAccounts.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{serviceAccounts.length - 20} more</div>}
              </ResourceTypeAccordion>
            )}

            {pvcs.length > 0 && (
              <ResourceTypeAccordion
                typeKey="pvcs"
                isExpanded={expandedTypes.has('pvcs')}
                onToggle={toggleType}
                badgeColor="green"
                badgeIcon={<HardDrive className="w-3 h-3" />}
                label={<TechnicalAcronym term="PVC">PVC</TechnicalAcronym>}
                countLabel={`(${pvcs.length})`}
              >
                {pvcs.slice(0, 20).map(pvc => (
                  <SimpleResourceRow
                    key={pvc.name}
                    icon={<HardDrive className="w-3 h-3 text-green-400" />}
                    name={pvc.name}
                    primaryText={pvc.status}
                    primaryClassName={pvc.status === 'Bound' ? 'text-green-400' : pvc.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}
                    secondaryText={pvc.capacity}
                    onClick={() => handleResourceClick('PVC', pvc.name, pvc.namespace, { status: pvc.status, storageClass: pvc.storageClass, capacity: pvc.capacity })}
                  />
                ))}
                {pvcs.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{pvcs.length - 20} more</div>}
              </ResourceTypeAccordion>
            )}

            {configmaps.length > 0 && (
              <ResourceTypeAccordion
                typeKey="configmaps"
                isExpanded={expandedTypes.has('configmaps')}
                onToggle={toggleType}
                badgeColor="orange"
                badgeIcon={<Settings className="w-3 h-3" />}
                label="CM"
                countLabel={`(${configmaps.length})`}
              >
                {configmaps.slice(0, 20).map(cm => (
                  <SimpleResourceRow
                    key={cm.name}
                    icon={<Settings className="w-3 h-3 text-orange-400" />}
                    name={cm.name}
                    secondaryText={`${cm.dataCount} keys`}
                    onClick={() => handleResourceClick('ConfigMap', cm.name, cm.namespace, { dataCount: cm.dataCount })}
                  />
                ))}
                {configmaps.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{configmaps.length - 20} more</div>}
              </ResourceTypeAccordion>
            )}

            {secrets.length > 0 && (
              <ResourceTypeAccordion
                typeKey="secrets"
                isExpanded={expandedTypes.has('secrets')}
                onToggle={toggleType}
                badgeColor="purple"
                badgeIcon={<Lock className="w-3 h-3" />}
                label="Secret"
                countLabel={`(${secrets.length})`}
              >
                {secrets.slice(0, 20).map(secret => (
                  <SimpleResourceRow
                    key={secret.name}
                    icon={<Lock className="w-3 h-3 text-purple-400" />}
                    name={secret.name}
                    primaryText={secret.type}
                    primaryClassName="text-purple-400"
                    secondaryText={`${secret.dataCount} keys`}
                    onClick={() => handleResourceClick('Secret', secret.name, secret.namespace, { type: secret.type, dataCount: secret.dataCount })}
                  />
                ))}
                {secrets.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{secrets.length - 20} more</div>}
              </ResourceTypeAccordion>
            )}
          </div>
        </div>
      )}

      {!hasResources && <NamespaceEmptyState />}
    </div>
  )
}
