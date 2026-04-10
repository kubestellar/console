import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'
import { emitDrillDownOpened, emitDrillDownClosed } from '../lib/analytics'

// Types for drill-down navigation
export type DrillDownViewType =
  | 'cluster'
  | 'namespace'
  | 'deployment'
  | 'replicaset'
  | 'pod'
  | 'service'
  | 'configmap'
  | 'secret'
  | 'serviceaccount'
  | 'pvc'
  | 'job'
  | 'hpa'
  | 'node'
  | 'events'
  | 'logs'
  | 'gpu-node'
  | 'gpu-namespace'
  | 'yaml'
  | 'resources'
  | 'custom'
  // Phase 2: GitOps and operational views
  | 'helm'
  | 'argoapp'
  | 'kustomization'
  | 'buildpack'
  | 'drift'
  // Phase 2: Policy and compliance views
  | 'policy'
  | 'compliance'
  | 'crd'
  // Phase 2: Alerting and monitoring views
  | 'alert'
  | 'alertrule'
  // Phase 2: Cost and RBAC views
  | 'cost'
  | 'rbac'
  // Phase 2: Operator views
  | 'operator'
  // Multi-cluster summary views (for stat blocks)
  | 'all-clusters'
  | 'all-namespaces'
  | 'all-deployments'
  | 'all-pods'
  | 'all-services'
  | 'all-nodes'
  | 'all-events'
  | 'all-alerts'
  | 'all-helm'
  | 'all-operators'
  | 'all-security'
  | 'all-gpu'
  | 'all-storage'
  | 'all-jobs'

export interface DrillDownView {
  type: DrillDownViewType
  title: string
  subtitle?: string
  data: Record<string, unknown>
  // Optional custom component to render
  customComponent?: ReactNode
}

export interface DrillDownState {
  isOpen: boolean
  stack: DrillDownView[]
  currentView: DrillDownView | null
}

interface DrillDownContextType {
  state: DrillDownState
  // Open drill-down with initial view
  open: (view: DrillDownView) => void
  // Push a new view onto the stack (drill deeper)
  push: (view: DrillDownView) => void
  // Pop the current view (go back)
  pop: () => void
  // Go back to a specific index in the stack
  goTo: (index: number) => void
  // Close the drill-down modal
  close: () => void
  // Replace current view
  replace: (view: DrillDownView) => void
}

const DrillDownContext = createContext<DrillDownContextType | null>(null)

export function DrillDownProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DrillDownState>({
    isOpen: false,
    stack: [],
    currentView: null })

  const open = useCallback((view: DrillDownView) => {
    setState({
      isOpen: true,
      stack: [view],
      currentView: view })
    emitDrillDownOpened(view.type)
  }, [])

  const push = useCallback((view: DrillDownView) => {
    setState(prev => ({
      ...prev,
      stack: [...prev.stack, view],
      currentView: view }))
  }, [])

  const pop = useCallback(() => {
    setState(prev => {
      if (prev.stack.length <= 1) {
        return { isOpen: false, stack: [], currentView: null }
      }
      const newStack = prev.stack.slice(0, -1)
      return {
        ...prev,
        stack: newStack,
        currentView: newStack[newStack.length - 1] }
    })
  }, [])

  const goTo = useCallback((index: number) => {
    setState(prev => {
      if (index < 0 || index >= prev.stack.length) return prev
      const newStack = prev.stack.slice(0, index + 1)
      return {
        ...prev,
        stack: newStack,
        currentView: newStack[newStack.length - 1] }
    })
  }, [])

  const close = useCallback(() => {
    setState(prev => {
      if (prev.currentView) {
        emitDrillDownClosed(prev.currentView.type, prev.stack.length)
      }
      return { isOpen: false, stack: [], currentView: null }
    })
  }, [])

  const replace = useCallback((view: DrillDownView) => {
    setState(prev => {
      const newStack = [...prev.stack.slice(0, -1), view]
      return {
        ...prev,
        stack: newStack,
        currentView: view }
    })
  }, [])

  // #6149 — Memoize the provider value so consumers don't re-render every
  // time DrillDownProvider itself re-renders for an unrelated reason.
  const contextValue = useMemo(
    () => ({ state, open, push, pop, goTo, close, replace }),
    [state, open, push, pop, goTo, close, replace]
  )

  return (
    <DrillDownContext.Provider value={contextValue}>
      {children}
    </DrillDownContext.Provider>
  )
}

export function useDrillDown() {
  const context = useContext(DrillDownContext)
  if (!context) {
    throw new Error('useDrillDown must be used within a DrillDownProvider')
  }
  return context
}

// Helper to generate a unique key for a view to detect duplicates
function getViewKey(view: DrillDownView): string {
  const { type, data } = view
  switch (type) {
    case 'cluster':
      return `cluster:${data.cluster}`
    case 'namespace':
      return `namespace:${data.cluster}:${data.namespace}`
    case 'deployment':
      return `deployment:${data.cluster}:${data.namespace}:${data.deployment}`
    case 'replicaset':
      return `replicaset:${data.cluster}:${data.namespace}:${data.replicaset}`
    case 'pod':
      return `pod:${data.cluster}:${data.namespace}:${data.pod}`
    case 'configmap':
      return `configmap:${data.cluster}:${data.namespace}:${data.configmap}`
    case 'secret':
      return `secret:${data.cluster}:${data.namespace}:${data.secret}`
    case 'serviceaccount':
      return `serviceaccount:${data.cluster}:${data.namespace}:${data.serviceaccount}`
    case 'pvc':
      return `pvc:${data.cluster}:${data.namespace}:${data.pvc}`
    case 'job':
      return `job:${data.cluster}:${data.namespace}:${data.job}`
    case 'hpa':
      return `hpa:${data.cluster}:${data.namespace}:${data.hpa}`
    case 'service':
      return `service:${data.cluster}:${data.namespace}:${data.service}`
    case 'node':
    case 'gpu-node':
      return `node:${data.cluster}:${data.node}`
    case 'gpu-namespace':
      return `gpu-namespace:${data.namespace}`
    case 'logs':
      return `logs:${data.cluster}:${data.namespace}:${data.pod}:${data.container || ''}`
    case 'events':
      return `events:${data.cluster}:${data.namespace || ''}:${data.objectName || ''}`
    // Phase 2: GitOps and operational views
    case 'helm':
      return `helm:${data.cluster}:${data.namespace}:${data.release}`
    case 'argoapp':
      return `argoapp:${data.cluster}:${data.namespace}:${data.app}`
    case 'kustomization':
      return `kustomization:${data.cluster}:${data.namespace}:${data.name}`
    case 'buildpack':
      return `buildpack:${data.cluster}:${data.namespace}:${data.name}`
    case 'drift':
      return `drift:${data.cluster}`
    // Phase 2: Policy and compliance views
    case 'policy':
      return `policy:${data.cluster}:${data.namespace || ''}:${data.policy}`
    case 'compliance':
      return `compliance:${data.filterStatus || 'all'}`
    case 'crd':
      return `crd:${data.cluster}:${data.crd}`
    // Phase 2: Alerting and monitoring views
    case 'alert':
      return `alert:${data.cluster}:${data.namespace || ''}:${data.alert}`
    case 'alertrule':
      return `alertrule:${data.cluster}:${data.namespace}:${data.ruleName}`
    // Phase 2: Cost and RBAC views
    case 'cost':
      return `cost:${data.cluster}`
    case 'rbac':
      return `rbac:${data.cluster}:${data.namespace || ''}:${data.subject}`
    // Phase 2: Operator views
    case 'operator':
      return `operator:${data.cluster}:${data.namespace}:${data.operator}`
    // Multi-cluster summary views
    case 'all-clusters':
      return `all-clusters:${data.filter || 'all'}`
    case 'all-namespaces':
      return `all-namespaces:${data.filter || 'all'}`
    case 'all-deployments':
      return `all-deployments:${data.filter || 'all'}`
    case 'all-pods':
      return `all-pods:${data.filter || 'all'}`
    case 'all-services':
      return `all-services:${data.filter || 'all'}`
    case 'all-nodes':
      return `all-nodes:${data.filter || 'all'}`
    case 'all-events':
      return `all-events:${data.filter || 'all'}`
    case 'all-alerts':
      return `all-alerts:${data.filter || 'all'}`
    case 'all-helm':
      return `all-helm:${data.filter || 'all'}`
    case 'all-operators':
      return `all-operators:${data.filter || 'all'}`
    case 'all-security':
      return `all-security:${data.filter || 'all'}`
    case 'all-gpu':
      return `all-gpu:${data.filter || 'all'}`
    case 'all-storage':
      return `all-storage:${data.filter || 'all'}`
    case 'all-jobs':
      return `all-jobs:${data.filter || 'all'}`
    default:
      return `${type}:${JSON.stringify(data)}`
  }
}

// Stable no-op functions used when DrillDownProvider is absent
const _noopOpen = () => {}
const _noopPush = () => {}
const _noopGoTo = () => {}
const _noopState: DrillDownState = { isOpen: false, stack: [], currentView: null }

// Helper hook to create drill-down actions
export function useDrillDownActions() {
  const context = useContext(DrillDownContext)
  const state = context?.state ?? _noopState
  const open = context?.open ?? _noopOpen
  const push = context?.push ?? _noopPush
  const goTo = context?.goTo ?? _noopGoTo

  // Helper to navigate - checks if view already exists in stack
  const openOrPush = (view: DrillDownView) => {
    if (!context) return
    if (!state.isOpen) {
      open(view)
      return
    }

    // Check if this view already exists in the stack
    const viewKey = getViewKey(view)
    const existingIndex = state.stack.findIndex(v => getViewKey(v) === viewKey)

    if (existingIndex >= 0) {
      // Navigate to existing view instead of pushing duplicate
      goTo(existingIndex)
    } else {
      push(view)
    }
  }

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
    const title = filterStatus
      ? `${filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)} Controls`
      : 'OSCAL Compliance Controls'
    openOrPush({
      type: 'compliance',
      title,
      subtitle: 'Compliance Trestle Assessment',
      data: { filterStatus, ...complianceData } })
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
  const drillToAllClusters = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Clusters` : 'All Clusters'
    openOrPush({
      type: 'all-clusters',
      title,
      subtitle: 'Multi-cluster overview',
      data: { filter, ...filterData } })
  }

  const drillToAllNamespaces = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Namespaces` : 'All Namespaces'
    openOrPush({
      type: 'all-namespaces',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllDeployments = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Deployments` : 'All Deployments'
    openOrPush({
      type: 'all-deployments',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllPods = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Pods` : 'All Pods'
    openOrPush({
      type: 'all-pods',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllServices = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Services` : 'All Services'
    openOrPush({
      type: 'all-services',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllNodes = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Nodes` : 'All Nodes'
    openOrPush({
      type: 'all-nodes',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllEvents = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Events` : 'All Events'
    openOrPush({
      type: 'all-events',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllAlerts = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Alerts` : 'All Alerts'
    openOrPush({
      type: 'all-alerts',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllHelm = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Helm Releases` : 'All Helm Releases'
    openOrPush({
      type: 'all-helm',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllOperators = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Operators` : 'All Operators'
    openOrPush({
      type: 'all-operators',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllSecurity = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Security Issues` : 'Security Issues'
    openOrPush({
      type: 'all-security',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllGPU = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} GPUs` : 'All GPUs'
    openOrPush({
      type: 'all-gpu',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllStorage = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Storage` : 'All Storage'
    openOrPush({
      type: 'all-storage',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

  const drillToAllJobs = (filter?: string, filterData?: Record<string, unknown>) => {
    const title = filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Jobs` : 'All Jobs'
    openOrPush({
      type: 'all-jobs',
      title,
      subtitle: 'Across all clusters',
      data: { filter, ...filterData } })
  }

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
    drillToAllJobs }
}
