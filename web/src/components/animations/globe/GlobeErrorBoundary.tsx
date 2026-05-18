import { Component, type ReactNode, type ErrorInfo } from 'react'
import { emitError, markErrorReported } from '../../../lib/analytics'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Error boundary for globe animations (GlobeAnimation, NetworkGlobe).
 * These are non-critical 3D rendering components on the login page.
 * If WebGL/Three.js crashes, fail gracefully by rendering nothing
 * instead of blocking the entire login flow.
 */
export class GlobeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[GlobeErrorBoundary] 3D globe rendering failed:', error, errorInfo)
    markErrorReported(error.message)
    emitError('globe_render', error.message, undefined, {
      error,
      componentStack: errorInfo.componentStack ?? undefined,
    })
  }

  render() {
    if (this.state.hasError) {
      // Fail silently — login page remains functional without the 3D globe
      return null
    }
    return this.props.children
  }
}
