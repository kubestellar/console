/* eslint-disable react-refresh/only-export-components */
import { Component, type ReactNode, type ErrorInfo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Box, Server, Layers, Rocket, FileText, Zap, Cpu, Lock, User, Bell, Ship, GitBranch, Settings, Shield, Package, DollarSign, AlertTriangle, RefreshCw, HardDrive } from 'lucide-react'
import { Button } from '../ui/Button'
import { moveFocusByKey } from '../../lib/a11y/rovingFocus'
import type { DrillDownView } from '../../hooks/useDrillDown.types'

// Loading fallback for lazy-loaded drilldown views
export function DrillDownLoading() {
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
export class DrillDownErrorBoundary extends Component<
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
          <div className="text-sm text-muted-foreground mb-4 max-w-md">
            An error occurred while rendering this drilldown view.
          </div>
          {this.state.error && (
            <div className="text-xs text-muted-foreground/70 font-mono mb-4 break-all max-w-md">
              {this.state.error.message}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => this.setState({ hasError: false, error: null })}
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Retry
            </Button>
            <Button
              onClick={this.props.onClose}
              variant="secondary"
              size="sm"
            >
              Close
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Helper to get status badge color for pods
export const getPodStatusColor = (status: string) => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'running') return 'bg-green-500/20 text-green-400'
  if (lower === 'succeeded' || lower === 'completed') return 'bg-blue-500/20 text-blue-400'
  if (lower === 'pending') return 'bg-yellow-500/20 text-yellow-400'
  if (lower === 'failed' || lower === 'error' || lower === 'crashloopbackoff' || lower === 'evicted') return 'bg-red-500/20 text-red-400'
  return 'bg-orange-500/20 text-orange-400'
}

// Helper to get icon for view type
export const getViewIcon = (type: string) => {
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

interface DrillDownBreadcrumbsProps {
  stack: DrillDownView[]
  goTo: (index: number) => void
  navigationHistoryLabel: string
  navigateToLabel: (title: string) => string
}

/** Renders the breadcrumb trail (with roving tab-list keyboard nav) in the modal header. */
export function DrillDownBreadcrumbs({ stack, goTo, navigationHistoryLabel, navigateToLabel }: DrillDownBreadcrumbsProps) {
  const handleBreadcrumbKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const nextTab = moveFocusByKey(event, { selector: '[role="tab"]', orientation: 'horizontal' })
    const nextIndex = Number(nextTab?.dataset.index)
    if (!Number.isNaN(nextIndex)) {
      goTo(nextIndex)
    }
  }

  return (
    <nav data-testid="drilldown-tabs" className="flex items-center gap-1 min-w-0 overflow-x-auto" role="tablist" aria-label={navigationHistoryLabel} onKeyDown={handleBreadcrumbKeyDown}>
      {stack.map((view, index) => {
        const isLast = index === stack.length - 1
        const isPod = view.type === 'pod'
        const podStatus = isPod && view.data?.status ? String(view.data.status) : null

        return (
          <div key={index} className="flex items-center gap-1 shrink-0">
            {index > 0 && (
              <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goTo(index)}
              id={`drilldown-tab-${index}`}
              data-index={index}
              role="tab"
              tabIndex={isLast ? 0 : -1}
              aria-selected={isLast}
              aria-controls={`drilldown-panel-${index}`}
              aria-label={navigateToLabel(view.title)}
              className={isLast ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}
            >
              {getViewIcon(view.type)}
              {view.title}
            </Button>
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
  )
}

interface DrillDownFooterHintsProps {
  showBackHint: boolean
}

/** Keyboard-shortcut hints shown at the bottom of the modal on non-mobile viewports. */
export function DrillDownFooterHints({ showBackHint }: DrillDownFooterHintsProps) {
  return (
    <div className="px-4 py-2 border-t border-border flex items-center justify-end text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <kbd className="px-2 py-0.5 rounded bg-card border border-border">Esc</kbd>
        <span>close</span>
        {showBackHint && (
          <>
            <span className="mx-1">•</span>
            <kbd className="px-2 py-0.5 rounded bg-card border border-border">Space</kbd>
            <span>back</span>
          </>
        )}
      </div>
    </div>
  )
}
