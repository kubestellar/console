import { useEffect, lazy, Suspense } from 'react'
import { Box, Server, Layers, Rocket, FileText, Zap, Cpu, Lock, User, Bell, Ship, GitBranch, Settings, Shield, Package } from 'lucide-react'
import { useDrillDown } from '../../hooks/useDrillDown'
import { useMobile } from '../../hooks/useMobile'
// Lazy load large components (>350 lines) for better performance
const ClusterDrillDown = lazy(() => import('./views/ClusterDrillDown').then(m => ({ default: m.ClusterDrillDown })))
const OperatorDrillDown = lazy(() => import('./views/OperatorDrillDown').then(m => ({ default: m.OperatorDrillDown })))
const PolicyDrillDown = lazy(() => import('./views/PolicyDrillDown').then(m => ({ default: m.PolicyDrillDown })))
const PodDrillDown = lazy(() => import('./views/PodDrillDown').then(m => ({ default: m.PodDrillDown })))
const DeploymentDrillDown = lazy(() => import('./views/DeploymentDrillDown').then(m => ({ default: m.DeploymentDrillDown })))
const MultiClusterSummaryDrillDown = lazy(() => import('./views/MultiClusterSummaryDrillDown').then(m => ({ default: m.MultiClusterSummaryDrillDown })))
const ReplicaSetDrillDown = lazy(() => import('./views/ReplicaSetDrillDown').then(m => ({ default: m.ReplicaSetDrillDown })))
const SecretDrillDown = lazy(() => import('./views/SecretDrillDown').then(m => ({ default: m.SecretDrillDown })))
const KustomizationDrillDown = lazy(() => import('./views/KustomizationDrillDown').then(m => ({ default: m.KustomizationDrillDown })))
const AlertDrillDown = lazy(() => import('./views/AlertDrillDown').then(m => ({ default: m.AlertDrillDown })))
const DriftDrillDown = lazy(() => import('./views/DriftDrillDown').then(m => ({ default: m.DriftDrillDown })))
const CRDDrillDown = lazy(() => import('./views/CRDDrillDown').then(m => ({ default: m.CRDDrillDown })))
const ResourcesDrillDown = lazy(() => import('./views/ResourcesDrillDown').then(m => ({ default: m.ResourcesDrillDown })))
const ServiceAccountDrillDown = lazy(() => import('./views/ServiceAccountDrillDown').then(m => ({ default: m.ServiceAccountDrillDown })))
const ArgoAppDrillDown = lazy(() => import('./views/ArgoAppDrillDown').then(m => ({ default: m.ArgoAppDrillDown })))
const HelmReleaseDrillDown = lazy(() => import('./views/HelmReleaseDrillDown').then(m => ({ default: m.HelmReleaseDrillDown })))
const ConfigMapDrillDown = lazy(() => import('./views/ConfigMapDrillDown').then(m => ({ default: m.ConfigMapDrillDown })))
// Keep smaller components as direct imports for immediate loading
import { NamespaceDrillDown } from './views/NamespaceDrillDown'
import { LogsDrillDown } from './views/LogsDrillDown'
import { EventsDrillDown } from './views/EventsDrillDown'
import { NodeDrillDown } from './views/NodeDrillDown'
import { GPUNodeDrillDown } from './views/GPUNodeDrillDown'
import { YAMLDrillDown } from './views/YAMLDrillDown'

// Loading fallback for lazy-loaded drilldown views
function DrillDownLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
    </div>
  )
}

// Helper to get status badge color for pods
const getPodStatusColor = (status: string) => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'running') return 'bg-green-500/20 text-green-400'
  if (lower === 'succeeded' || lower === 'completed') return 'bg-blue-500/20 text-blue-400'
  if (lower === 'pending') return 'bg-yellow-500/20 text-yellow-400'
  if (lower === 'failed' || lower === 'error' || lower === 'crashloopbackoff' || lower === 'evicted') return 'bg-red-500/20 text-red-400'
  return 'bg-orange-500/20 text-orange-400'
}

// Helper to get icon for view type
const getViewIcon = (type: string) => {
  switch (type) {
    case 'pod': return <Box className="w-4 h-4 text-cyan-400" />
    case 'cluster': return <Server className="w-4 h-4 text-blue-400" />
    case 'namespace': return <Layers className="w-4 h-4 text-purple-400" />
    case 'deployment': return <Rocket className="w-4 h-4 text-green-400" />
    case 'replicaset': return <Layers className="w-4 h-4 text-blue-400" />
    case 'configmap': return <FileText className="w-4 h-4 text-yellow-400" />
    case 'secret': return <Lock className="w-4 h-4 text-red-400" />
    case 'serviceaccount': return <User className="w-4 h-4 text-purple-400" />
    case 'node': return <Cpu className="w-4 h-4 text-orange-400" />
    case 'gpu-node': return <Cpu className="w-4 h-4 text-purple-400" />
    case 'logs': return <FileText className="w-4 h-4 text-yellow-400" />
    case 'events': return <Zap className="w-4 h-4 text-amber-400" />
    // Phase 2 view types
    case 'alert': return <Bell className="w-4 h-4 text-red-400" />
    case 'helm': return <Ship className="w-4 h-4 text-blue-400" />
    case 'argoapp': return <GitBranch className="w-4 h-4 text-orange-400" />
    case 'operator': return <Settings className="w-4 h-4 text-purple-400" />
    case 'policy': return <Shield className="w-4 h-4 text-blue-400" />
    case 'kustomization': return <Layers className="w-4 h-4 text-indigo-400" />
    case 'crd': return <Package className="w-4 h-4 text-purple-400" />
    case 'drift': return <GitBranch className="w-4 h-4 text-orange-400" />
    // Multi-cluster summary views
    case 'all-clusters': return <Server className="w-4 h-4 text-blue-400" />
    case 'all-namespaces': return <Layers className="w-4 h-4 text-purple-400" />
    case 'all-deployments': return <Rocket className="w-4 h-4 text-green-400" />
    case 'all-pods': return <Box className="w-4 h-4 text-cyan-400" />
    case 'all-services': return <Layers className="w-4 h-4 text-indigo-400" />
    case 'all-nodes': return <Server className="w-4 h-4 text-orange-400" />
    case 'all-events': return <Zap className="w-4 h-4 text-amber-400" />
    case 'all-alerts': return <Bell className="w-4 h-4 text-red-400" />
    case 'all-helm': return <Ship className="w-4 h-4 text-blue-400" />
    case 'all-operators': return <Settings className="w-4 h-4 text-purple-400" />
    case 'all-security': return <Shield className="w-4 h-4 text-red-400" />
    case 'all-gpu': return <Cpu className="w-4 h-4 text-purple-400" />
    case 'all-storage': return <Package className="w-4 h-4 text-emerald-400" />
    case 'all-jobs': return <Rocket className="w-4 h-4 text-yellow-400" />
    default: return null
  }
}

export function DrillDownModal() {
  const { state, pop, goTo, close } = useDrillDown()
  const { isMobile } = useMobile()

  // Disable body scroll when modal is open
  useEffect(() => {
    if (state.isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [state.isOpen])

  // Keyboard shortcuts
  useEffect(() => {
    if (!state.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          close()
          break
        case 'Backspace':
        case ' ': // Space
          e.preventDefault()
          if (state.stack.length > 1) {
            pop()
          } else {
            close()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.isOpen, state.stack.length, close, pop])

  if (!state.isOpen || !state.currentView) return null

  // Get current view - we've already checked it's not null above
  const currentView = state.currentView
  const { type, data } = currentView

  const renderView = () => {
    switch (type) {
      case 'cluster':
        return <ClusterDrillDown data={data} />
      case 'namespace':
        return <NamespaceDrillDown data={data} />
      case 'deployment':
        return <DeploymentDrillDown data={data} />
      case 'replicaset':
        return <ReplicaSetDrillDown data={data} />
      case 'pod':
        return <PodDrillDown data={data} />
      case 'logs':
        return <LogsDrillDown data={data} />
      case 'events':
        return <EventsDrillDown data={data} />
      case 'node':
        return <NodeDrillDown data={data} />
      case 'gpu-node':
        return <GPUNodeDrillDown data={data} />
      case 'yaml':
        return <YAMLDrillDown data={data} />
      case 'resources':
        return <ResourcesDrillDown data={data} />
      case 'configmap':
        return <ConfigMapDrillDown data={data} />
      case 'secret':
        return <SecretDrillDown data={data} />
      case 'serviceaccount':
        return <ServiceAccountDrillDown data={data} />
      // Phase 2 views
      case 'alert':
        return <AlertDrillDown data={data} />
      case 'helm':
        return <HelmReleaseDrillDown data={data} />
      case 'argoapp':
        return <ArgoAppDrillDown data={data} />
      case 'operator':
        return <OperatorDrillDown data={data} />
      case 'policy':
        return <PolicyDrillDown data={data} />
      case 'kustomization':
        return <KustomizationDrillDown data={data} />
      case 'crd':
        return <CRDDrillDown data={data} />
      case 'drift':
        return <DriftDrillDown data={data} />
      // Multi-cluster summary views
      case 'all-clusters':
      case 'all-namespaces':
      case 'all-deployments':
      case 'all-pods':
      case 'all-services':
      case 'all-nodes':
      case 'all-events':
      case 'all-alerts':
      case 'all-helm':
      case 'all-operators':
      case 'all-security':
      case 'all-gpu':
      case 'all-storage':
      case 'all-jobs':
        return <MultiClusterSummaryDrillDown data={data} viewType={type} />
      case 'custom':
        return state.currentView?.customComponent || <div>Custom view</div>
      default:
        return <div>Unknown view type</div>
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4" onClick={close}>
      <div
        className="glass w-full md:w-[90vw] max-w-[1200px] h-[95vh] md:h-[80vh] rounded-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with breadcrumbs */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Back button */}
            {state.stack.length > 1 && (
              <button
                onClick={pop}
                className="p-2 rounded-lg hover:bg-card/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Go back"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1 min-w-0 overflow-x-auto">
              {state.stack.map((view, index) => {
                const isLast = index === state.stack.length - 1
                const isPod = view.type === 'pod'
                const podStatus = isPod && view.data?.status ? String(view.data.status) : null

                return (
                  <div key={index} className="flex items-center gap-1 shrink-0">
                    {index > 0 && (
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                    <button
                      onClick={() => goTo(index)}
                      className={`px-2 py-1 rounded text-sm transition-colors flex items-center gap-1.5 ${
                        isLast
                          ? 'text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {getViewIcon(view.type)}
                      {view.title}
                    </button>
                    {/* Pod status badge - small, inline */}
                    {isLast && podStatus && (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPodStatusColor(podStatus)}`}>
                        {podStatus}
                      </span>
                    )}
                  </div>
                )
              })}
            </nav>
          </div>

          {/* Close button */}
          <button
            onClick={close}
            className="p-2 rounded-lg hover:bg-card/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <Suspense fallback={<DrillDownLoading />}>
            {renderView()}
          </Suspense>
        </div>

        {/* Footer with keyboard hints - hidden on mobile */}
        {!isMobile && (
          <div className="px-4 py-2 border-t border-border flex items-center justify-end text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-0.5 rounded bg-card border border-border">Esc</kbd>
              <span>close</span>
              {state.stack.length > 1 && (
                <>
                  <span className="mx-1">•</span>
                  <kbd className="px-2 py-0.5 rounded bg-card border border-border">Space</kbd>
                  <span>back</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
