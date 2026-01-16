import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

// Types for drill-down navigation
export type DrillDownViewType =
  | 'cluster'
  | 'namespace'
  | 'deployment'
  | 'pod'
  | 'service'
  | 'node'
  | 'events'
  | 'logs'
  | 'gpu-node'
  | 'custom'

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
    currentView: null,
  })

  const open = useCallback((view: DrillDownView) => {
    setState({
      isOpen: true,
      stack: [view],
      currentView: view,
    })
  }, [])

  const push = useCallback((view: DrillDownView) => {
    setState(prev => ({
      ...prev,
      stack: [...prev.stack, view],
      currentView: view,
    }))
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
        currentView: newStack[newStack.length - 1],
      }
    })
  }, [])

  const goTo = useCallback((index: number) => {
    setState(prev => {
      if (index < 0 || index >= prev.stack.length) return prev
      const newStack = prev.stack.slice(0, index + 1)
      return {
        ...prev,
        stack: newStack,
        currentView: newStack[newStack.length - 1],
      }
    })
  }, [])

  const close = useCallback(() => {
    setState({ isOpen: false, stack: [], currentView: null })
  }, [])

  const replace = useCallback((view: DrillDownView) => {
    setState(prev => {
      const newStack = [...prev.stack.slice(0, -1), view]
      return {
        ...prev,
        stack: newStack,
        currentView: view,
      }
    })
  }, [])

  return (
    <DrillDownContext.Provider value={{ state, open, push, pop, goTo, close, replace }}>
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

// Helper hook to create drill-down actions
export function useDrillDownActions() {
  const { open, push } = useDrillDown()

  const drillToCluster = useCallback((cluster: string, clusterData?: Record<string, unknown>) => {
    open({
      type: 'cluster',
      title: cluster.split('/').pop() || cluster,
      subtitle: 'Cluster Overview',
      data: { cluster, ...clusterData },
    })
  }, [open])

  const drillToNamespace = useCallback((cluster: string, namespace: string) => {
    push({
      type: 'namespace',
      title: namespace,
      subtitle: `Namespace in ${cluster.split('/').pop()}`,
      data: { cluster, namespace },
    })
  }, [push])

  const drillToDeployment = useCallback((cluster: string, namespace: string, deployment: string, deploymentData?: Record<string, unknown>) => {
    push({
      type: 'deployment',
      title: deployment,
      subtitle: `Deployment in ${namespace}`,
      data: { cluster, namespace, deployment, ...deploymentData },
    })
  }, [push])

  const drillToPod = useCallback((cluster: string, namespace: string, pod: string, podData?: Record<string, unknown>) => {
    push({
      type: 'pod',
      title: pod,
      subtitle: `Pod in ${namespace}`,
      data: { cluster, namespace, pod, ...podData },
    })
  }, [push])

  const drillToLogs = useCallback((cluster: string, namespace: string, pod: string, container?: string) => {
    push({
      type: 'logs',
      title: `Logs: ${pod}`,
      subtitle: container ? `Container: ${container}` : 'All containers',
      data: { cluster, namespace, pod, container },
    })
  }, [push])

  const drillToEvents = useCallback((cluster: string, namespace?: string, objectName?: string) => {
    push({
      type: 'events',
      title: objectName ? `Events: ${objectName}` : 'Events',
      subtitle: namespace || cluster.split('/').pop(),
      data: { cluster, namespace, objectName },
    })
  }, [push])

  const drillToNode = useCallback((cluster: string, node: string, nodeData?: Record<string, unknown>) => {
    push({
      type: 'node',
      title: node,
      subtitle: `Node in ${cluster.split('/').pop()}`,
      data: { cluster, node, ...nodeData },
    })
  }, [push])

  const drillToGPUNode = useCallback((cluster: string, node: string, gpuData?: Record<string, unknown>) => {
    push({
      type: 'gpu-node',
      title: node,
      subtitle: 'GPU Node',
      data: { cluster, node, ...gpuData },
    })
  }, [push])

  return {
    drillToCluster,
    drillToNamespace,
    drillToDeployment,
    drillToPod,
    drillToLogs,
    drillToEvents,
    drillToNode,
    drillToGPUNode,
  }
}
