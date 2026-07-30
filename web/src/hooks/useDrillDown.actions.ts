import { useContext, useCallback } from 'react'
import { DrillDownContext } from './useDrillDown.provider'
import type { DrillDownState } from './useDrillDown.types'

// Stable no-op functions used when DrillDownProvider is absent
const _noop = () => {}
const _noopState: DrillDownState = { isOpen: false, stack: [], currentView: null }

function normalizeComplianceFilterStatus(filterStatus?: string): string | undefined {
  switch (filterStatus) {
    case 'passing':
      return 'pass'
    case 'failing':
      return 'fail'
    case 'warning':
    case 'skipped':
      return 'other'
    default:
      return filterStatus
  }
}

// Helper hook to create drill-down actions
export function useDrillDownActions() {
  const context = useContext(DrillDownContext)
  const state = context?.state ?? _noopState
  const pop = context?.pop ?? _noop
  const close = context?.close ?? _noop

  // Use the provider-level openOrPush which reads state via functional
  // setState — immune to stale closures since it always sees the latest
  // state, even when the calling component hasn't re-rendered yet.
  const providerOpenOrPush = context?.openOrPush ?? _noop

  /** Whether the drill-down stack has a previous view to navigate back to */
  const canGoBack = state.stack.length > 1

  /** Navigate back one level in the drill-down stack. If at the root view,
   *  closes the drill-down entirely. */
  const goBack = useCallback(() => {
    pop()
  }, [pop])

  /** Close the drill-down modal entirely, clearing the full stack. */
  const closeDrillDown = useCallback(() => {
    close()
  }, [close])

  // Delegate to provider-level openOrPush (stale-closure-safe)
  const openOrPush = providerOpenOrPush

  const drillToCluster = (cluster: string, clusterData?: Record<string, unknown>) => {
    openOrPush({
      type: 'cluster',
      title: cluster.split('/').pop() || cluster,
      subtitle: 'Cluster Overview',
      data: { cluster, ...clusterData } })
  }

  const drillToNamespace = (cluster: string, namespace: string) => {
    openOrPush({
      type: 'namespace',
      title: namespace,
      subtitle: `Namespace in ${cluster.split('/').pop()}`,
      data: { cluster, namespace } })
  }

  const drillToDeployment = (cluster: string, namespace: string, deployment: string, deploymentData?: Record<string, unknown>) => {
    openOrPush({
      type: 'deployment',
      title: deployment,
      subtitle: `Deployment in ${namespace}`,
      data: { cluster, namespace, deployment, ...deploymentData } })
  }

  const drillToPod = (cluster: string, namespace: string, pod: string, podData?: Record<string, unknown>) => {
    openOrPush({
      type: 'pod',
      title: pod,
      data: { cluster, namespace, pod, ...podData } })
  }

  const drillToLogs = (cluster: string, namespace: string, pod: string, container?: string) => {
    openOrPush({
      type: 'logs',
      title: `Logs: ${pod}`,
      subtitle: container ? `Container: ${container}` : 'All containers',
      data: { cluster, namespace, pod, container } })
  }

  const drillToEvents = (cluster: string, namespace?: string, objectName?: string) => {
    openOrPush({
      type: 'events',
      title: objectName ? `Events: ${objectName}` : 'Events',
      subtitle: namespace || cluster.split('/').pop(),
      data: { cluster, namespace, objectName } })
  }

  const drillToNode = (cluster: string, node: string, nodeData?: Record<string, unknown>) => {
    openOrPush({
      type: 'node',
      title: node,
      subtitle: `Node in ${cluster.split('/').pop()}`,
      data: { cluster, node, ...nodeData } })
  }

  const drillToGPUNode = (cluster: string, node: string, gpuData?: Record<string, unknown>) => {
    openOrPush({
      type: 'gpu-node',
      title: node,
      subtitle: 'GPU Node',
      data: { cluster, node, ...gpuData } })
  }

  const drillToGPUNamespace = (namespace: string, gpuData?: Record<string, unknown>) => {
    openOrPush({
      type: 'gpu-namespace',
      title: namespace,
      subtitle: 'GPU Namespace Allocations',
      data: { namespace, ...gpuData } })
  }

  const drillToYAML = (
    cluster: string,
    namespace: string,
    resourceType: string,
    resourceName: string,
    resourceData?: Record<string, unknown>
  ) => {
    openOrPush({
      type: 'yaml',
      title: `${resourceType}: ${resourceName}`,
      subtitle: `YAML definition`,
      data: { cluster, namespace, resourceType, resourceName, ...resourceData } })
  }

  const drillToResources = () => {
    openOrPush({
      type: 'resources',
      title: 'Resource Usage',
      subtitle: 'All clusters',
      data: {} })
  }

  const drillToReplicaSet = (cluster: string, namespace: string, replicaset: string, replicasetData?: Record<string, unknown>) => {
    openOrPush({
      type: 'replicaset',
      title: replicaset,
      data: { cluster, namespace, replicaset, ...replicasetData } })
  }

  const drillToConfigMap = (cluster: string, namespace: string, configmap: string, configmapData?: Record<string, unknown>) => {
    openOrPush({
      type: 'configmap',
      title: configmap,
      data: { cluster, namespace, configmap, ...configmapData } })
  }

  const drillToSecret = (cluster: string, namespace: string, secret: string, secretData?: Record<string, unknown>) => {
    openOrPush({
      type: 'secret',
      title: secret,
      data: { cluster, namespace, secret, ...secretData } })
  }

  const drillToServiceAccount = (cluster: string, namespace: string, serviceaccount: string, serviceaccountData?: Record<string, unknown>) => {
    openOrPush({
      type: 'serviceaccount',
      title: serviceaccount,
      data: { cluster, namespace, serviceaccount, ...serviceaccountData } })
  }

  const drillToPVC = (cluster: string, namespace: string, pvc: string, pvcData?: Record<string, unknown>) => {
    openOrPush({
      type: 'pvc',
      title: pvc,
      subtitle: `PVC in ${namespace}`,
      data: { cluster, namespace, pvc, ...pvcData } })
  }

  const drillToJob = (cluster: string, namespace: string, job: string, jobData?: Record<string, unknown>) => {
    openOrPush({
      type: 'job',
      title: job,
      subtitle: `Job in ${namespace}`,
      data: { cluster, namespace, job, ...jobData } })
  }

  const drillToHPA = (cluster: string, namespace: string, hpa: string, hpaData?: Record<string, unknown>) => {
    openOrPush({
      type: 'hpa',
      title: hpa,
      subtitle: `HPA in ${namespace}`,
      data: { cluster, namespace, hpa, ...hpaData } })
  }

  const drillToService = (cluster: string, namespace: string, service: string, serviceData?: Record<string, unknown>) => {
    openOrPush({
      type: 'service',
      title: service,
      subtitle: `Service in ${namespace}`,
      data: { cluster, namespace, service, ...serviceData } })
  }

  // Phase 2: GitOps and operational drill actions
  const drillToHelm = (cluster: string, namespace: string, release: string, helmData?: Record<string, unknown>) => {
    openOrPush({
      type: 'helm',
      title: release,
      subtitle: `Helm Release in ${namespace}`,
      data: { cluster, namespace, release, ...helmData } })
  }

  const drillToArgoApp = (cluster: string, namespace: string, app: string, argoData?: Record<string, unknown>) => {
    openOrPush({
      type: 'argoapp',
      title: app,
      subtitle: `ArgoCD Application`,
      data: { cluster, namespace, app, ...argoData } })
  }

  const drillToKustomization = (cluster: string, namespace: string, name: string, kustomizeData?: Record<string, unknown>) => {
    openOrPush({
      type: 'kustomization',
      title: name,
      subtitle: `Kustomization in ${namespace}`,
      data: { cluster, namespace, name, ...kustomizeData } })
  }
  const drillToBuildpack = (cluster: string, namespace: string, name: string, buildpackData?: Record<string, unknown>) => {
    openOrPush({
      type: 'buildpack',
      title: name,
      subtitle: `Buildpack in ${namespace}`,
      data: { cluster, namespace, name, ...buildpackData } })
  }

  const drillToDrift = (cluster: string, driftData?: Record<string, unknown>) => {
    openOrPush({
      type: 'drift',
      title: 'Configuration Drift',
      subtitle: cluster.split('/').pop() || cluster,
      data: { cluster, ...driftData } })
  }

  // Phase 2: Policy and compliance drill actions
  const drillToPolicy = (cluster: string, namespace: string | undefined, policy: string, policyData?: Record<string, unknown>) => {
    openOrPush({
      type: 'policy',
      title: policy,
      subtitle: namespace ? `Policy in ${namespace}` : 'Cluster Policy',
      data: { cluster, namespace, policy, ...policyData } })
  }

  const drillToCompliance = (filterStatus?: string, complianceData?: Record<string, unknown>) => {
    const normalizedFilterStatus = normalizeComplianceFilterStatus(filterStatus)
    const filterTitle = normalizedFilterStatus === 'pass'
      ? 'Passing'
      : normalizedFilterStatus === 'fail'
        ? 'Failing'
        : normalizedFilterStatus === 'other'
          ? 'Other'
          : normalizedFilterStatus
    const title = filterTitle
      ? `${filterTitle} Controls`
      : 'OSCAL Compliance Controls'
    openOrPush({
      type: 'compliance',
      title,
      subtitle: 'Compliance Trestle Assessment',
      data: { filterStatus: normalizedFilterStatus, ...complianceData } })
  }

  const drillToCRD = (cluster: string, crd: string, crdData?: Record<string, unknown>) => {
    openOrPush({
      type: 'crd',
      title: crd,
      subtitle: 'Custom Resource Definition',
      data: { cluster, crd, ...crdData } })
  }

  // Phase 2: Alerting and monitoring drill actions
  const drillToAlert = (cluster: string, namespace: string | undefined, alert: string, alertData?: Record<string, unknown>) => {
    openOrPush({
      type: 'alert',
      title: alert,
      subtitle: namespace ? `Alert in ${namespace}` : 'Cluster Alert',
      data: { cluster, namespace, alert, ...alertData } })
  }

  const drillToAlertRule = (cluster: string, namespace: string, ruleName: string, ruleData?: Record<string, unknown>) => {
    openOrPush({
      type: 'alertrule',
      title: ruleName,
      subtitle: `Alert Rule in ${namespace}`,
      data: { cluster, namespace, ruleName, ...ruleData } })
  }

  // Phase 2: Cost and RBAC drill actions
  const drillToCost = (cluster: string, costData?: Record<string, unknown>) => {
    openOrPush({
      type: 'cost',
      title: 'Cost Analysis',
      subtitle: cluster.split('/').pop() || cluster,
      data: { cluster, ...costData } })
  }

  const drillToRBAC = (cluster: string, namespace: string | undefined, subject: string, rbacData?: Record<string, unknown>) => {
    openOrPush({
      type: 'rbac',
      title: subject,
      subtitle: namespace ? `RBAC in ${namespace}` : 'Cluster RBAC',
      data: { cluster, namespace, subject, ...rbacData } })
  }

  // Phase 2: Operator drill actions
  const drillToOperator = (cluster: string, namespace: string, operator: string, operatorData?: Record<string, unknown>) => {
    openOrPush({
      type: 'operator',
      title: operator,
      subtitle: `Operator in ${namespace}`,
      data: { cluster, namespace, operator, ...operatorData } })
  }

  // Multi-cluster summary drill actions (for stat blocks)
  const drillToAllClusters = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Clusters` : 'All Clusters'
    openOrPush({
      type: 'all-clusters',
      title,
      subtitle: 'Multi-cluster overview',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllNamespaces = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Namespaces` : 'All Namespaces'
    openOrPush({
      type: 'all-namespaces',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllDeployments = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Deployments` : 'All Deployments'
    openOrPush({
      type: 'all-deployments',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllPods = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Pods` : 'All Pods'
    openOrPush({
      type: 'all-pods',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllServices = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Services` : 'All Services'
    openOrPush({
      type: 'all-services',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllNodes = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Nodes` : 'All Nodes'
    openOrPush({
      type: 'all-nodes',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllEvents = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Events` : 'All Events'
    openOrPush({
      type: 'all-events',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllAlerts = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Alerts` : 'All Alerts'
    openOrPush({
      type: 'all-alerts',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllHelm = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Helm Releases` : 'All Helm Releases'
    openOrPush({
      type: 'all-helm',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllOperators = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Operators` : 'All Operators'
    openOrPush({
      type: 'all-operators',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllSecurity = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Security Issues` : 'Security Issues'
    openOrPush({
      type: 'all-security',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllGPU = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} GPUs` : 'All GPUs'
    openOrPush({
      type: 'all-gpu',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllStorage = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Storage` : 'All Storage'
    openOrPush({
      type: 'all-storage',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  const drillToAllJobs = useCallback((filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Jobs` : 'All Jobs'
    openOrPush({
      type: 'all-jobs',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }, [openOrPush])

  return {
    drillToCluster,
    drillToNamespace,
    drillToDeployment,
    drillToReplicaSet,
    drillToPod,
    drillToLogs,
    drillToEvents,
    drillToNode,
    drillToGPUNode,
    drillToGPUNamespace,
    drillToYAML,
    drillToResources,
    drillToConfigMap,
    drillToSecret,
    drillToServiceAccount,
    drillToPVC,
    drillToJob,
    drillToHPA,
    drillToService,
    // Phase 2 actions
    drillToHelm,
    drillToArgoApp,
    drillToKustomization,
    drillToBuildpack,
    drillToDrift,
    drillToPolicy,
    drillToCompliance,
    drillToCRD,
    drillToAlert,
    drillToAlertRule,
    drillToCost,
    drillToRBAC,
    drillToOperator,
    // Multi-cluster summary actions
    drillToAllClusters,
    drillToAllNamespaces,
    drillToAllDeployments,
    drillToAllPods,
    drillToAllServices,
    drillToAllNodes,
    drillToAllEvents,
    drillToAllAlerts,
    drillToAllHelm,
    drillToAllOperators,
    drillToAllSecurity,
    drillToAllGPU,
    drillToAllStorage,
    drillToAllJobs,
    // Navigation helpers
    goBack,
    canGoBack,
    closeDrillDown }
}
