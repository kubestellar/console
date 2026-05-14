import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { emitError, markErrorReported } from '../../lib/analytics'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary for resolution apply flow in MissionSidebar.
 * Contains errors from resolution.resolution.steps.map() and other
 * resolution-related operations to prevent full sidebar unmount.
 * Shows inline error state instead of propagating to app-level boundary.
 */
export class ResolutionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ResolutionErrorBoundary] Resolution panel error:', error, errorInfo)
    markErrorReported(error.message)
    emitError('resolution_panel', error.message, undefined, {
      error,
      componentStack: errorInfo.componentStack ?? undefined,
    })
  }

  handleRecover = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center bg-destructive/5 rounded-lg border border-destructive/20">
          <AlertTriangle className="w-8 h-8 text-destructive mb-3" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Failed to apply resolution
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            An error occurred while processing the resolution. Please try again or select a different resolution.
          </p>
          {this.state.error && (
            <div className="text-xs text-muted-foreground/70 font-mono mb-4 wrap-break-word whitespace-pre-wrap max-w-sm">
              {this.state.error.message}
            </div>
          )}
          <button
            onClick={this.handleRecover}
            className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-xs font-medium transition-colors"
            aria-label="Try again"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
