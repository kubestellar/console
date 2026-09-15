/**
 * ErrorToastListener
 * 
 * Listens for custom error events dispatched by contexts and utilities,
 * then displays user-facing toast notifications.
 * 
 * Resolves #20306 — surfaces errors that previously only logged to console.
 */
import { useEffect } from 'react'
import { useToast } from './Toast'

interface ErrorEventDetail {
  error: string
  operation?: string
  key?: string
  context?: string
  severity?: string
}

export function ErrorToastListener() {
  const { showToast } = useToast()

  useEffect(() => {
    const handleAlertNotificationError = (e: CustomEvent<ErrorEventDetail>) => {
      showToast(
        `Alert notification failed: ${e.detail.error}`,
        'error'
      )
    }

    const handleStorageError = (e: CustomEvent<ErrorEventDetail>) => {
      // Only show toast for critical storage errors (e.g., localStorage full after pruning)
      // Regular storage errors are expected in private browsing mode and should fail silently
      if (e.detail.severity === 'critical') {
        showToast(
          `Storage operation failed: ${e.detail.error}`,
          'error'
        )
      }
    }

    const handleThemeError = (e: CustomEvent<ErrorEventDetail>) => {
      showToast(
        `Theme error: ${e.detail.error}`,
        'error'
      )
    }

    const handleKubectlProxyError = (e: CustomEvent<ErrorEventDetail>) => {
      showToast(
        `Connection error: ${e.detail.error}`,
        'error'
      )
    }

    // #23188 — stellar.ts dispatches this event on non-auth API failures but
    // nothing displayed it to the user, leaving those errors silent.
    const handleStellarError = (e: CustomEvent<ErrorEventDetail>) => {
      showToast(
        `Stellar ${e.detail.operation ?? 'operation'} failed: ${e.detail.error}`,
        'error'
      )
    }

    window.addEventListener('alert-notification-error', handleAlertNotificationError as EventListener)
    window.addEventListener('storage-error', handleStorageError as EventListener)
    window.addEventListener('theme-error', handleThemeError as EventListener)
    window.addEventListener('kubectl-proxy-error', handleKubectlProxyError as EventListener)
    window.addEventListener('stellar-error', handleStellarError as EventListener)

    return () => {
      window.removeEventListener('alert-notification-error', handleAlertNotificationError as EventListener)
      window.removeEventListener('storage-error', handleStorageError as EventListener)
      window.removeEventListener('theme-error', handleThemeError as EventListener)
      window.removeEventListener('kubectl-proxy-error', handleKubectlProxyError as EventListener)
      window.removeEventListener('stellar-error', handleStellarError as EventListener)
    }
  }, [showToast])

  return null
}
