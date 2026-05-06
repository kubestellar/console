import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, ReactNode } from 'react'
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
  // Open or push: opens if closed, pushes if open, navigates to existing
  // if the view is already in the stack. Reads provider state from a ref to
  // avoid stale-closure bugs when callers haven't re-rendered yet.
  openOrPush: (view: DrillDownView) => void
}

const DrillDownContext = createContext<DrillDownContextType | null>(null)

const CLOSED_DRILLDOWN_STATE: DrillDownState = {
  isOpen: false,
  stack: [],
  currentView: null,
}
const DRILLDOWN_HISTORY_STATE_KEY = '__kscDrillDownHistoryId'
const MAX_DRILLDOWN_HISTORY_ENTRIES = 100

type BrowserHistoryState = Record<string, unknown>

function canUseBrowserHistory() {
  return typeof window !== 'undefined' && typeof window.history !== 'undefined'
}

function getCurrentBrowserHistoryState(): BrowserHistoryState {
  if (!canUseBrowserHistory()) return {}
  const currentState = window.history.state
  return currentState && typeof currentState === 'object'
    ? currentState as BrowserHistoryState
    : {}
}

function getDrillDownHistoryEntryId(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const entryId = (state as BrowserHistoryState)[DRILLDOWN_HISTORY_STATE_KEY]
  return typeof entryId === 'number' ? entryId : null
}

export function DrillDownProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DrillDownState>(CLOSED_DRILLDOWN_STATE)
  const stateRef = useRef<DrillDownState>(CLOSED_DRILLDOWN_STATE)
  const historyEntriesRef = useRef(new Map<number, DrillDownState>())
  const nextHistoryEntryIdRef = useRef(1)

  const applyState = useCallback((nextState: DrillDownState) => {
    stateRef.current = nextState
    setState(nextState)
  }, [])

  const persistHistoryEntry = useCallback((nextState: DrillDownState, mode: 'push' | 'replace') => {
    if (!canUseBrowserHistory()) return

    const entryId = nextHistoryEntryIdRef.current
    nextHistoryEntryIdRef.current += 1
    historyEntriesRef.current.set(entryId, nextState)

    while (historyEntriesRef.current.size > MAX_DRILLDOWN_HISTORY_ENTRIES) {
      const oldestEntryId = historyEntriesRef.current.keys().next().value
      if (typeof oldestEntryId !== 'number') break
      historyEntriesRef.current.delete(oldestEntryId)
    }

    const nextHistoryState: BrowserHistoryState = {
      ...getCurrentBrowserHistoryState(),
      [DRILLDOWN_HISTORY_STATE_KEY]: entryId,
    }
    const nextUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (mode === 'push') {
      window.history.pushState(nextHistoryState, '', nextUrl)
      return
    }

    window.history.replaceState(nextHistoryState, '', nextUrl)
  }, [])

  const navigateHistory = useCallback((delta: number) => {
    if (!canUseBrowserHistory() || delta === 0) return false
    if (getDrillDownHistoryEntryId(window.history.state) === null) return false
    window.history.go(delta)
    return true
  }, [])

  const open = useCallback((view: DrillDownView) => {
    const nextState = {
      isOpen: true,
      stack: [view],
      currentView: view,
    }
    applyState(nextState)
    emitDrillDownOpened(view.type)
    persistHistoryEntry(nextState, 'push')
  }, [applyState, persistHistoryEntry])

  const push = useCallback((view: DrillDownView) => {
    const prev = stateRef.current
    const wasOpen = prev.isOpen
    const nextState = wasOpen
      ? {
          ...prev,
          stack: [...prev.stack, view],
          currentView: view,
        }
      : {
          isOpen: true,
          stack: [view],
          currentView: view,
        }
    applyState(nextState)
    if (!wasOpen) {
      emitDrillDownOpened(view.type)
    }
    persistHistoryEntry(nextState, 'push')
  }, [applyState, persistHistoryEntry])

  const pop = useCallback(() => {
    const prev = stateRef.current
    if (prev.stack.length === 0) return

    if (prev.stack.length === 1) {
      if (prev.currentView) {
        emitDrillDownClosed(prev.currentView.type, prev.stack.length)
      }
      applyState(CLOSED_DRILLDOWN_STATE)
      navigateHistory(-1)
      return
    }

    const newStack = prev.stack.slice(0, -1)
    const nextState = {
      ...prev,
      stack: newStack,
      currentView: newStack[newStack.length - 1],
    }
    applyState(nextState)
    navigateHistory(-1)
  }, [applyState, navigateHistory])

  const goTo = useCallback((index: number) => {
    const prev = stateRef.current
    if (index < 0 || index >= prev.stack.length) return

    const newStack = prev.stack.slice(0, index + 1)
    const nextState = {
      ...prev,
      stack: newStack,
      currentView: newStack[newStack.length - 1],
    }
    applyState(nextState)
    navigateHistory(index + 1 - prev.stack.length)
  }, [applyState, navigateHistory])

  const close = useCallback(() => {
    const prev = stateRef.current
    if (!prev.isOpen) return

    if (prev.currentView) {
      emitDrillDownClosed(prev.currentView.type, prev.stack.length)
    }
    applyState(CLOSED_DRILLDOWN_STATE)
    navigateHistory(-prev.stack.length)
  }, [applyState, navigateHistory])

  const replace = useCallback((view: DrillDownView) => {
    const prev = stateRef.current
    const newStack = prev.stack.length > 0 ? [...prev.stack.slice(0, -1), view] : [view]
    const nextState = {
      ...prev,
      isOpen: newStack.length > 0,
      stack: newStack,
      currentView: view,
    }
    applyState(nextState)
    if (nextState.isOpen) {
      persistHistoryEntry(nextState, 'replace')
    }
  }, [applyState, persistHistoryEntry])

  // Open-or-push that reads state via a ref to guarantee freshness even when
  // the calling component hasn't re-rendered yet.
  const openOrPushFn = useCallback((view: DrillDownView) => {
    const prev = stateRef.current
    if (!prev.isOpen) {
      open(view)
      return
    }

    const viewKey = getViewKey(view)
    const existingIndex = prev.stack.findIndex(v => getViewKey(v) === viewKey)

    if (existingIndex >= 0) {
      goTo(existingIndex)
      return
    }

    push(view)
  }, [goTo, open, push])

  useEffect(() => {
    if (!canUseBrowserHistory()) return undefined

    const handlePopState = (event: PopStateEvent) => {
      const previousState = stateRef.current
      const entryId = getDrillDownHistoryEntryId(event.state)
      const nextState = entryId !== null ? historyEntriesRef.current.get(entryId) ?? null : null

      if (nextState) {
        applyState(nextState)
        if (!previousState.isOpen && nextState.currentView) {
          emitDrillDownOpened(nextState.currentView.type)
        }
        return
      }

      if (previousState.isOpen && previousState.currentView) {
        emitDrillDownClosed(previousState.currentView.type, previousState.stack.length)
      }
      applyState(CLOSED_DRILLDOWN_STATE)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [applyState])

  // #6149 — Memoize the provider value so consumers don't re-render every
  // time DrillDownProvider itself re-renders for an unrelated reason.
  const contextValue = useMemo(
    () => ({ state, open, push, pop, goTo, close, replace, openOrPush: openOrPushFn }),
    [state, open, push, pop, goTo, close, replace, openOrPushFn]
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
const _noop = () => {}
const _noopState: DrillDownState = { isOpen: false, stack: [], currentView: null }

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
