import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { emitError } from '../../lib/analytics'

// Maximum number of retry attempts before disabling the retry button
const MAX_RETRY_ATTEMPTS = 3

interface Props {
  cardId: string
  children: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  retryCount: number
  pendingRetry: boolean
}

/**
 * Error boundary for dynamic cards.
 * Catches render crashes and shows a recovery UI instead
 * of crashing neighboring cards.
 * Retry attempts are capped at MAX_RETRY_ATTEMPTS to prevent
 * flooding the console with errors from deterministic render bugs.
 * retryCount only increments when an error occurs after a retry attempt,
 * so successful retries do not consume the limit.
 */
export class DynamicCardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, retryCount: 0, pendingRetry: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[DynamicCard:${this.props.cardId}] Render error:`, error, errorInfo)
    emitError('card_render', `[${this.props.cardId}] ${error.message}`)
    this.props.onError?.(error, errorInfo)
    // Only increment retryCount when the error happens during a retry attempt,
    // so successful retries do not consume the retry budget.
    this.setState((prev) => ({
      retryCount: prev.pendingRetry ? prev.retryCount + 1 : prev.retryCount,
      pendingRetry: false,
    }))
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, pendingRetry: true })
  }

  render() {
    if (this.state.hasError) {
      const retriesExhausted = this.state.retryCount >= MAX_RETRY_ATTEMPTS
      const retriesLeft = MAX_RETRY_ATTEMPTS - this.state.retryCount
      return (
        <div className="h-full flex flex-col items-center justify-center p-4 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
          <p className="text-sm font-medium text-red-400 mb-1">Card Render Error</p>
          <p className="text-xs text-muted-foreground mb-3 max-w-xs">
            {this.state.error?.message || 'An unexpected error occurred while rendering this card.'}
          </p>
          {retriesExhausted ? (
            <p className="text-xs text-muted-foreground">Reload the page to try again.</p>
          ) : (
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry ({retriesLeft} left)
            </button>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
