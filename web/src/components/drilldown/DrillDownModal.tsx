import { Component, useEffect, Suspense, type ReactNode, type ErrorInfo } from 'react'
import { createPortal } from 'react-dom'
import { safeLazy } from '../../lib/safeLazy'
import { useTranslation } from 'react-i18next'
import { Box, Server, Layers, Rocket, FileText, Zap, Cpu, Lock, User, Bell, Ship, GitBranch, Settings, Shield, Package, DollarSign, AlertTriangle, RefreshCw, HardDrive } from 'lucide-react'
import { useDrillDown } from '../../hooks/useDrillDown'
import { useMobile } from '../../hooks/useMobile'
import { useEscapeLayer } from '../../lib/modals'
// Lazy load large components (>300 lines) for better performance
const ClusterDrillDown = safeLazy(() => import('./views/ClusterDrillDown'), 'ClusterDrillDown')
const OperatorDrillDown = safeLazy(() => import('./views/OperatorDrillDown'), 'OperatorDrillDown')
const PolicyDrillDown = safeLazy(() => import('./views/PolicyDrillDown'), 'PolicyDrillDown')
const PodDrillDown = safeLazy(() => import('./views/PodDrillDown'), 'PodDrillDown')
const DeploymentDrillDown = safeLazy(() => import('./views/DeploymentDrillDown'), 'DeploymentDrillDown')
const MultiClusterSummaryDrillDown = safeLazy(() => import('./views/MultiClusterSummaryDrillDown'), 'MultiClusterSummaryDrillDown')
const ReplicaSetDrillDown = safeLazy(() => import('./views/ReplicaSetDrillDown'), 'ReplicaSetDrillDown')
const SecretDrillDown = safeLazy(() => import('./views/SecretDrillDown'), 'SecretDrillDown')
const KustomizationDrillDown = safeLazy(() => import('./views/KustomizationDrillDown'), 'KustomizationDrillDown')
const AlertDrillDown = safeLazy(() => import('./views/AlertDrillDown'), 'AlertDrillDown')
const DriftDrillDown = safeLazy(() => import('./views/DriftDrillDown'), 'DriftDrillDown')
const CRDDrillDown = safeLazy(() => import('./views/CRDDrillDown'), 'CRDDrillDown')
const ResourcesDrillDown = safeLazy(() => import('./views/ResourcesDrillDown'), 'ResourcesDrillDown')
const ServiceAccountDrillDown = safeLazy(() => import('./views/ServiceAccountDrillDown'), 'ServiceAccountDrillDown')
const ArgoAppDrillDown = safeLazy(() => import('./views/ArgoAppDrillDown'), 'ArgoAppDrillDown')
const HelmReleaseDrillDown = safeLazy(() => import('./views/HelmReleaseDrillDown'), 'HelmReleaseDrillDown')
const ConfigMapDrillDown = safeLazy(() => import('./views/ConfigMapDrillDown'), 'ConfigMapDrillDown')
const BuildpackDrillDown = safeLazy(() => import('./views/BuildpackDrillDown'), 'BuildpackDrillDown')
const ServiceDrillDown = safeLazy(() => import('./views/ServiceDrillDown'), 'default')
const RBACDrillDown = safeLazy(() => import('./views/RBACDrillDown'), 'RBACDrillDown')
const CostDrillDown = safeLazy(() => import('./views/CostDrillDown'), 'CostDrillDown')
const ComplianceDrillDown = safeLazy(() => import('./views/ComplianceDrillDown'), 'ComplianceDrillDown')
const PVCDrillDown = safeLazy(() => import('./views/PVCDrillDown'), 'PVCDrillDown')
const QuantumCredentialsDrillDown = safeLazy(() => import('./views/quantum/QuantumCredentialsDrillDown'), 'QuantumCredentialsDrillDown')

const EventsDrillDown = safeLazy(() => import('./views/EventsDrillDown'), 'EventsDrillDown')

const NamespaceDrillDown = safeLazy(() => import('./views/NamespaceDrillDown'), 'NamespaceDrillDown')
const NodeDrillDown = safeLazy(() => import('./views/NodeDrillDown'), 'NodeDrillDown')
const GPUNamespaceDrillDown = safeLazy(() => import('./views/GPUNamespaceDrillDown'), 'GPUNamespaceDrillDown')
const LogsDrillDown = safeLazy(() => import('./views/LogsDrillDown'), 'LogsDrillDown')
const GPUNodeDrillDown = safeLazy(() => import('./views/GPUNodeDrillDown'), 'GPUNodeDrillDown')
const YAMLDrillDown = safeLazy(() => import('./views/YAMLDrillDown'), 'YAMLDrillDown')

// Loading fallback for lazy-loaded drilldown views
function DrillDownLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
    </div>
  )
}

/**
 * Error boundary for drilldown view content. Catches render errors within
 * individual drilldown views and displays a recovery UI inside the modal
 * instead of crashing the entire application with a blank screen.
 */
class DrillDownErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; onClose: () => void }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[DrillDownErrorBoundary] Render error in drilldown view:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-center p-6">
          <AlertTriangle className="w-10 h-10 text-yellow-400 mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">
            Failed to load view
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            An error occurred while rendering this drilldown view.
          </p>
          {this.state.error && (
            <p className="text-xs text-muted-foreground/70 font-mono mb-4 break-all max-w-md">
              {this.state.error.message}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
            <button
              onClick={this.props.onClose}
              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
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
    case 'service': return <Layers className="w-4 h-4 text-cyan-400" />
    case 'pvc': return <HardDrive className="w-4 h-4 text-green-400" />
    case 'node': return <Cpu className="w-4 h-4 text-orange-400" />
    case 'gpu-node': return <Cpu className="w-4 h-4 text-purple-400" />
    case 'gpu-namespace': return <Box className="w-4 h-4 text-purple-400" />
    case 'logs': return <FileText className="w-4 h-4 text-yellow-400" />
    case 'events': return <Zap className="w-4 h-4 text-yellow-400" />
    // Phase 2 view types
    case 'alert': return <Bell className="w-4 h-4 text-red-400" />
    case 'helm': return <Ship className="w-4 h-4 text-blue-400" />
    case 'argoapp': return <GitBranch className="w-4 h-4 text-orange-400" />
    case 'operator': return <Settings className="w-4 h-4 text-purple-400" />
    case 'policy': return <Shield className="w-4 h-4 text-blue-400" />
    case 'compliance': return <Shield className="w-4 h-4 text-teal-400" />
    case 'kustomization': return <Layers className="w-4 h-4 text-blue-400" />
    case 'buildpack': return <Package className="w-4 h-4 text-blue-400" />
    case 'crd': return <Package className="w-4 h-4 text-purple-400" />
    case 'drift': return <GitBranch className="w-4 h-4 text-orange-400" />
    case 'cost': return <DollarSign className="w-4 h-4 text-green-400" />
    // Multi-cluster summary views
    case 'all-clusters': return <Server className="w-4 h-4 text-blue-400" />
    case 'all-namespaces': return <Layers className="w-4 h-4 text-purple-400" />
    case 'all-deployments': return <Rocket className="w-4 h-4 text-green-400" />
    case 'all-pods': return <Box className="w-4 h-4 text-cyan-400" />
    case 'all-services': return <Layers className="w-4 h-4 text-blue-400" />
    case 'all-nodes': return <Server className="w-4 h-4 text-orange-400" />
    case 'all-events': return <Zap className="w-4 h-4 text-yellow-400" />
    case 'all-alerts': return <Bell className="w-4 h-4 text-red-400" />
    case 'all-helm': return <Ship className="w-4 h-4 text-blue-400" />
    case 'all-operators': return <Settings className="w-4 h-4 text-purple-400" />
    case 'all-security': return <Shield className="w-4 h-4 text-red-400" />
    case 'all-gpu': return <Cpu className="w-4 h-4 text-purple-400" />
    case 'all-storage': return <Package className="w-4 h-4 text-green-400" />
    case 'all-jobs': return <Rocket className="w-4 h-4 text-yellow-400" />
    case 'quantum-credentials': return <Lock className="w-4 h-4 text-blue-400" />
    default: return null
  }
}

export function DrillDownModal() {
  const { t } = useTranslation()
  const { state, pop, goTo, close } = useDrillDown()
  const { isMobile } = useMobile()
  const isTopEscapeLayer = useEscapeLayer(state.isOpen)

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
      const isNavigationKey = e.key === 'Escape' || e.key === 'Backspace' || e.key === ' '
      if (isNavigationKey && !isTopEscapeLayer()) return

      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
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
  }, [state.isOpen, state.stack.length, close, pop, isTopEscapeLayer])

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
      case 'gpu-namespace':
        return <GPUNamespaceDrillDown data={data} />
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
      case 'pvc':
        return <PVCDrillDown data={data} />
      case 'service':
        return <ServiceDrillDown data={data} />
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
      case 'compliance':
        return <ComplianceDrillDown data={data} />
      case 'kustomization':
        return <KustomizationDrillDown data={data} />
      case 'buildpack':
        return <BuildpackDrillDown data={data} />

      case 'crd':
        return <CRDDrillDown data={data} />
      case 'drift':
        return <DriftDrillDown data={data} />
      case 'rbac':
        return <RBACDrillDown data={data} />
      case 'cost':
        return <CostDrillDown data={data} />
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
        return state.currentView?.customComponent || <div>{t('drilldown.customView')}</div>
      case 'quantum-credentials':
        return <QuantumCredentialsDrillDown data={data} />
      default:
        return <div>{t('drilldown.unknownViewType')}</div>
    }
  }

  // Render the modal at document.body so it sits after the Layout sidebar
  // in DOM order. Both the sidebar and drill-down use z-modal; with equal
  // z-index the later sibling paints on top. Without the portal, the
  // sidebar (rendered inside Layout, which mounts after DrillDownModal in
  // the React tree) visually overlaps the drill-down's left edge — e.g.
  // hiding the back button and the start of the breadcrumb on a narrow
  // window. The portal guarantees drill-downs always render after the
  // chrome regardless of where the component is mounted in the tree.
  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-modal p-2 md:p-4"
      onClick={close}
    >
      <div
        data-testid="drilldown-modal"
        className="glass w-full md:w-[90vw] max-w-[1200px] h-[95vh] md:h-[80vh] rounded-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with breadcrumbs */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Back button - always visible; closes modal at root level */}
            <button
              data-testid="drilldown-back"
              onClick={state.stack.length > 1 ? pop : close}
              className="p-2 rounded-lg hover:bg-card/50 text-muted-foreground hover:text-foreground transition-colors"
              title={state.stack.length > 1 ? t('drilldown.goBack') : t('drilldown.close')}
              aria-label={state.stack.length > 1 ? t('drilldown.goBack') : t('drilldown.close')}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Breadcrumbs */}
            <nav data-testid="drilldown-tabs" className="flex items-center gap-1 min-w-0 overflow-x-auto">
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
                      aria-label={t('drilldown.navigateTo', 'Navigate to {{title}}', { title: view.title })}
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
            data-testid="drilldown-close"
            onClick={close}
            className="p-2 rounded-lg hover:bg-card/50 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('drilldown.close')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <DrillDownErrorBoundary onClose={close}>
            <Suspense fallback={<DrillDownLoading />}>
              {renderView()}
            </Suspense>
          </DrillDownErrorBoundary>
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
    </div>,
    document.body
  )
}
