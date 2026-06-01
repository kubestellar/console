import { Component, type ErrorInfo, type ReactNode } from 'react'
import { emitError, markErrorReported } from '../lib/analytics'

interface CompactErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  context: string
}

interface CompactErrorBoundaryState {
  hasError: boolean
}

export class CompactErrorBoundary extends Component<
  CompactErrorBoundaryProps,
  CompactErrorBoundaryState
> {
  constructor(props: CompactErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): CompactErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[CompactErrorBoundary:${this.props.context}] Render error:`, error, errorInfo)
    markErrorReported(error.message)
    emitError('component_render', error.message, undefined, {
      error,
      componentStack: errorInfo.componentStack ?? undefined,
    })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }

    return this.props.children
  }
}
