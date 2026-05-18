import { Folder } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TreeNode } from './TreeRenderer'
import { ResourceIcon, type NamespaceResources, type TreeLens } from './types'
import { TruncatedIndicator } from './TruncatedIndicator'
import { getPodsForDeployment } from './ClusterResourceTree.utils'

interface NamespaceTreeNodeProps {
  clusterId: string
  clusterName: string
  namespaceName: string
  nsData: NamespaceResources
  namespaceResources: Map<string, NamespaceResources>
  activeLens: TreeLens
  renderLimit: number
  expandedNodes: Set<string>
  toggleNode: (nodeId: string) => void
  drillToNamespace: (clusterName: string, namespace: string) => void
  drillToPod: (clusterName: string, namespace: string, podName: string, metadata: { status: string; restarts: number }) => void
  drillToDeployment: (clusterName: string, namespace: string, deploymentName: string) => void
  drillToService: (clusterName: string, namespace: string, serviceName: string) => void
  drillToPVC: (clusterName: string, namespace: string, pvcName: string) => void
}

export function NamespaceTreeNode({
  clusterId,
  clusterName,
  namespaceName,
  nsData,
  namespaceResources,
  activeLens,
  renderLimit,
  expandedNodes,
  toggleNode,
  drillToNamespace,
  drillToPod,
  drillToDeployment,
  drillToService,
  drillToPVC,
}: NamespaceTreeNodeProps) {
  const { t } = useTranslation()
  const nsId = `${clusterId}:ns:${namespaceName}`
  const nsPodIssues = nsData.pods.filter(pod => pod.status !== 'Running' && pod.status !== 'Succeeded').length
  const nsDeploymentIssues = nsData.deployments.filter(deployment => deployment.readyReplicas < deployment.replicas).length
  const totalIssues = nsPodIssues + nsDeploymentIssues

  const showDeployments = (activeLens === 'all' || activeLens === 'workloads' || activeLens === 'issues') && nsData.deployments.length > 0
  const showPods = (activeLens === 'all' || activeLens === 'workloads' || activeLens === 'issues') && nsData.pods.length > 0
  const showServices = (activeLens === 'all' || activeLens === 'network') && nsData.services.length > 0
  const showPVCs = (activeLens === 'all' || activeLens === 'storage' || activeLens === 'issues') && nsData.pvcs.length > 0
  const showConfigMaps = (activeLens === 'all' || activeLens === 'workloads') && nsData.configmaps.length > 0
  const showSecrets = (activeLens === 'all' || activeLens === 'workloads') && nsData.secrets.length > 0
  const showServiceAccounts = (activeLens === 'all' || activeLens === 'workloads') && nsData.serviceaccounts.length > 0
  const showJobs = (activeLens === 'all' || activeLens === 'workloads') && nsData.jobs.length > 0
  const showHPAs = (activeLens === 'all' || activeLens === 'workloads') && nsData.hpas.length > 0
  const showReplicaSets = (activeLens === 'all' || activeLens === 'workloads') && nsData.replicasets.length > 0
  const showStatefulSets = (activeLens === 'all' || activeLens === 'workloads') && nsData.statefulsets.length > 0
  const showDaemonSets = (activeLens === 'all' || activeLens === 'workloads') && nsData.daemonsets.length > 0
  const showCronJobs = (activeLens === 'all' || activeLens === 'workloads') && nsData.cronjobs.length > 0
  const showIngresses = (activeLens === 'all' || activeLens === 'network') && nsData.ingresses.length > 0
  const showNetworkPolicies = (activeLens === 'all' || activeLens === 'network') && nsData.networkpolicies.length > 0

  return (
    <TreeNode
      id={nsId}
      label={namespaceName}
      icon={Folder}
      iconColor="text-yellow-400"
      badge={totalIssues > 0 ? totalIssues : undefined}
      badgeColor="bg-red-500/20 text-red-400"
      onClick={() => drillToNamespace(clusterName, namespaceName)}
      indent={3}
      expandedNodes={expandedNodes}
      toggleNode={toggleNode}
    >
      {showDeployments && (
        <TreeNode id={`${nsId}:deployments`} label={t('resourceTree.deployments')} icon={ResourceIcon.deployment} iconColor="text-green-400" count={nsData.deployments.length} badge={nsDeploymentIssues > 0 ? nsDeploymentIssues : undefined} badgeColor="bg-yellow-500/20 text-yellow-400" indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.deployments.slice(0, renderLimit).map(deployment => {
            const deploymentId = `${nsId}:dep:${deployment.name}`
            const deploymentPods = getPodsForDeployment(namespaceResources, deployment.name, namespaceName)
            const isHealthy = deployment.readyReplicas === deployment.replicas
            return (
              <TreeNode key={deployment.name} id={deploymentId} label={deployment.name} icon={ResourceIcon.deployment} iconColor={isHealthy ? 'text-green-400' : 'text-yellow-400'} badge={`${deployment.readyReplicas}/${deployment.replicas}`} badgeColor={isHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'} onClick={() => drillToDeployment(clusterName, namespaceName, deployment.name)} indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode}>
                {deploymentPods.length > 0 && deploymentPods.slice(0, renderLimit).map(pod => (
                  <TreeNode key={pod.name} id={`${deploymentId}:pod:${pod.name}`} label={pod.name} icon={ResourceIcon.pod} iconColor={pod.status === 'Running' ? 'text-green-400' : 'text-red-400'} badge={pod.status} badgeColor={pod.status === 'Running' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} onClick={() => drillToPod(clusterName, namespaceName, pod.name, { status: pod.status, restarts: pod.restarts })} indent={6} expandedNodes={expandedNodes} toggleNode={toggleNode} />
                ))}
                {deploymentPods.length > renderLimit && <TruncatedIndicator total={deploymentPods.length} shown={renderLimit} indent={6} />}
              </TreeNode>
            )
          })}
          <TruncatedIndicator total={nsData.deployments.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showPods && (
        <TreeNode id={`${nsId}:pods`} label={t('resourceTree.pods')} icon={ResourceIcon.pod} iconColor="text-cyan-400" count={nsData.pods.length} badge={nsPodIssues > 0 ? nsPodIssues : undefined} badgeColor="bg-red-500/20 text-red-400" indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.pods.slice(0, renderLimit).map(pod => (
            <TreeNode key={pod.name} id={`${nsId}:pod:${pod.name}`} label={pod.name} icon={ResourceIcon.pod} iconColor={pod.status === 'Running' || pod.status === 'Succeeded' ? 'text-green-400' : 'text-red-400'} badge={pod.restarts > 0 ? `${pod.status} (${pod.restarts} restarts)` : pod.status} badgeColor={pod.status === 'Running' || pod.status === 'Succeeded' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} onClick={() => drillToPod(clusterName, namespaceName, pod.name, { status: pod.status, restarts: pod.restarts })} indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          ))}
          <TruncatedIndicator total={nsData.pods.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showServices && (
        <TreeNode id={`${nsId}:services`} label={t('resourceTree.services')} icon={ResourceIcon.service} iconColor="text-blue-400" count={nsData.services.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.services.slice(0, renderLimit).map(service => (
            <TreeNode key={service.name} id={`${nsId}:svc:${service.name}`} label={service.name} icon={ResourceIcon.service} iconColor="text-blue-400" badge={service.type} badgeColor="bg-blue-500/20 text-blue-400" onClick={() => drillToService(clusterName, namespaceName, service.name)} indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          ))}
          <TruncatedIndicator total={nsData.services.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showPVCs && (
        <TreeNode id={`${nsId}:pvcs`} label={t('resourceTree.pvcs')} icon={ResourceIcon.pvc} iconColor="text-green-400" count={nsData.pvcs.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.pvcs.slice(0, renderLimit).map(pvc => (
            <TreeNode key={pvc.name} id={`${nsId}:pvc:${pvc.name}`} label={pvc.name} icon={ResourceIcon.pvc} iconColor={pvc.status === 'Bound' ? 'text-green-400' : 'text-yellow-400'} badge={pvc.status} badgeColor={pvc.status === 'Bound' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'} onClick={() => drillToPVC(clusterName, namespaceName, pvc.name)} indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          ))}
          <TruncatedIndicator total={nsData.pvcs.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showConfigMaps && (
        <TreeNode id={`${nsId}:configmaps`} label={t('resourceTree.configMaps')} icon={ResourceIcon.configmap} iconColor="text-orange-400" count={nsData.configmaps.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.configmaps.slice(0, renderLimit).map(configMap => (
            <TreeNode key={configMap.name} id={`${nsId}:cm:${configMap.name}`} label={configMap.name} icon={ResourceIcon.configmap} iconColor="text-orange-400" badge={t('resourceTree.keysCount', { count: configMap.dataCount })} badgeColor="bg-orange-500/20 text-orange-400" indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          ))}
          <TruncatedIndicator total={nsData.configmaps.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showSecrets && (
        <TreeNode id={`${nsId}:secrets`} label={t('resourceTree.secrets')} icon={ResourceIcon.secret} iconColor="text-red-400" count={nsData.secrets.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.secrets.slice(0, renderLimit).map(secret => (
            <TreeNode key={secret.name} id={`${nsId}:secret:${secret.name}`} label={secret.name} icon={ResourceIcon.secret} iconColor="text-red-400" badge={secret.type} badgeColor="bg-red-500/20 text-red-400" indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          ))}
          <TruncatedIndicator total={nsData.secrets.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showServiceAccounts && (
        <TreeNode id={`${nsId}:serviceaccounts`} label={t('resourceTree.serviceAccounts')} icon={ResourceIcon.serviceaccount} iconColor="text-cyan-400" count={nsData.serviceaccounts.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.serviceaccounts.slice(0, renderLimit).map(serviceAccount => (
            <TreeNode key={serviceAccount.name} id={`${nsId}:sa:${serviceAccount.name}`} label={serviceAccount.name} icon={ResourceIcon.serviceaccount} iconColor="text-cyan-400" indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          ))}
          <TruncatedIndicator total={nsData.serviceaccounts.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showJobs && (
        <TreeNode id={`${nsId}:jobs`} label={t('resourceTree.jobs')} icon={ResourceIcon.job} iconColor="text-yellow-400" count={nsData.jobs.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.jobs.slice(0, renderLimit).map(job => {
            const isComplete = job.status === 'Complete'
            const isRunning = job.status === 'Running'
            return <TreeNode key={job.name} id={`${nsId}:job:${job.name}`} label={job.name} icon={ResourceIcon.job} iconColor={isComplete || isRunning ? 'text-green-400' : 'text-red-400'} badge={`${job.status} (${job.completions})`} badgeColor={isComplete || isRunning ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          })}
          <TruncatedIndicator total={nsData.jobs.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showHPAs && (
        <TreeNode id={`${nsId}:hpas`} label={t('resourceTree.hpas')} icon={ResourceIcon.hpa} iconColor="text-purple-400" count={nsData.hpas.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.hpas.slice(0, renderLimit).map(hpa => (
            <TreeNode key={hpa.name} id={`${nsId}:hpa:${hpa.name}`} label={hpa.name} icon={ResourceIcon.hpa} iconColor="text-purple-400" badge={`${hpa.currentReplicas} (${hpa.minReplicas}-${hpa.maxReplicas})`} badgeColor="bg-purple-500/20 text-purple-400" indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          ))}
          <TruncatedIndicator total={nsData.hpas.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showReplicaSets && (
        <TreeNode id={`${nsId}:replicasets`} label={t('resourceTree.replicaSets')} icon={ResourceIcon.replicaset} iconColor="text-blue-400" count={nsData.replicasets.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.replicasets.slice(0, renderLimit).map(replicaSet => {
            const isHealthy = replicaSet.readyReplicas === replicaSet.replicas
            return <TreeNode key={replicaSet.name} id={`${nsId}:rs:${replicaSet.name}`} label={replicaSet.name} icon={ResourceIcon.replicaset} iconColor={isHealthy ? 'text-green-400' : 'text-yellow-400'} badge={`${replicaSet.readyReplicas}/${replicaSet.replicas}`} badgeColor={isHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'} indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          })}
          <TruncatedIndicator total={nsData.replicasets.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showStatefulSets && (
        <TreeNode id={`${nsId}:statefulsets`} label={t('resourceTree.statefulSets')} icon={ResourceIcon.statefulset} iconColor="text-blue-400" count={nsData.statefulsets.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.statefulsets.slice(0, renderLimit).map(statefulSet => {
            const isHealthy = statefulSet.readyReplicas === statefulSet.replicas
            return <TreeNode key={statefulSet.name} id={`${nsId}:ss:${statefulSet.name}`} label={statefulSet.name} icon={ResourceIcon.statefulset} iconColor={isHealthy ? 'text-green-400' : 'text-yellow-400'} badge={`${statefulSet.readyReplicas}/${statefulSet.replicas}`} badgeColor={isHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'} indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          })}
          <TruncatedIndicator total={nsData.statefulsets.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showDaemonSets && (
        <TreeNode id={`${nsId}:daemonsets`} label={t('resourceTree.daemonSets')} icon={ResourceIcon.daemonset} iconColor="text-cyan-400" count={nsData.daemonsets.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.daemonsets.slice(0, renderLimit).map(daemonSet => {
            const isHealthy = daemonSet.ready === daemonSet.desiredScheduled
            return <TreeNode key={daemonSet.name} id={`${nsId}:ds:${daemonSet.name}`} label={daemonSet.name} icon={ResourceIcon.daemonset} iconColor={isHealthy ? 'text-green-400' : 'text-yellow-400'} badge={`${daemonSet.ready}/${daemonSet.desiredScheduled}`} badgeColor={isHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'} indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          })}
          <TruncatedIndicator total={nsData.daemonsets.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showCronJobs && (
        <TreeNode id={`${nsId}:cronjobs`} label={t('resourceTree.cronJobs')} icon={ResourceIcon.cronjob} iconColor="text-yellow-400" count={nsData.cronjobs.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.cronjobs.slice(0, renderLimit).map(cronJob => (
            <TreeNode key={cronJob.name} id={`${nsId}:cj:${cronJob.name}`} label={cronJob.name} icon={ResourceIcon.cronjob} iconColor={cronJob.suspend ? 'text-muted-foreground' : 'text-yellow-400'} badge={cronJob.suspend ? t('resourceTree.suspended') : cronJob.schedule} badgeColor={cronJob.suspend ? 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground' : 'bg-yellow-500/20 text-yellow-400'} indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          ))}
          <TruncatedIndicator total={nsData.cronjobs.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showIngresses && (
        <TreeNode id={`${nsId}:ingresses`} label={t('resourceTree.ingresses')} icon={ResourceIcon.ingress} iconColor="text-blue-400" count={nsData.ingresses.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.ingresses.slice(0, renderLimit).map(ingress => (
            <TreeNode key={ingress.name} id={`${nsId}:ing:${ingress.name}`} label={ingress.name} icon={ResourceIcon.ingress} iconColor="text-blue-400" badge={ingress.hosts.length > 0 ? ingress.hosts.join(', ') : ingress.class || t('resourceTree.noHost')} badgeColor="bg-blue-500/20 text-blue-400" indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          ))}
          <TruncatedIndicator total={nsData.ingresses.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}

      {showNetworkPolicies && (
        <TreeNode id={`${nsId}:networkpolicies`} label={t('resourceTree.networkPolicies')} icon={ResourceIcon.networkpolicy} iconColor="text-red-400" count={nsData.networkpolicies.length} indent={4} expandedNodes={expandedNodes} toggleNode={toggleNode}>
          {nsData.networkpolicies.slice(0, renderLimit).map(networkPolicy => (
            <TreeNode key={networkPolicy.name} id={`${nsId}:np:${networkPolicy.name}`} label={networkPolicy.name} icon={ResourceIcon.networkpolicy} iconColor="text-red-400" badge={(networkPolicy.policyTypes || []).join(', ') || t('resourceTree.noTypes')} badgeColor="bg-red-500/20 text-red-400" indent={5} expandedNodes={expandedNodes} toggleNode={toggleNode} />
          ))}
          <TruncatedIndicator total={nsData.networkpolicies.length} shown={renderLimit} indent={5} />
        </TreeNode>
      )}
    </TreeNode>
  )
}
