import { useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useDrillDownActions } from './useDrillDown'
import { scrollToCard } from '../lib/scrollToCard'
import { ROUTES } from '../config/routes'

/**
 * Deep linking support for notifications and external links.
 *
 * URL params supported:
 * - ?card=cluster_health - Scrolls to and highlights a card by type
 * - ?drilldown=node&cluster=xyz&node=abc - Opens node drilldown
 * - ?drilldown=pod&cluster=xyz&namespace=abc&pod=def - Opens pod drilldown
 * - ?drilldown=cluster&cluster=xyz - Opens cluster drilldown
 * - ?drilldown=deployment&cluster=xyz&namespace=abc&deployment=def - Opens deployment drilldown
 * - ?action=offline-detection - Navigates to dashboard with offline detection focus
 * - ?action=hardware-health - Navigates to dashboard with hardware health focus
 */

export type DeepLinkAction =
  | 'offline-detection'
  | 'hardware-health'
  | 'security'
  | 'alerts'

export type DeepLinkDrilldown =
  | 'node'
  | 'pod'
  | 'cluster'
  | 'deployment'
  | 'namespace'

interface DeepLinkParams {
  drilldown?: DeepLinkDrilldown
  action?: DeepLinkAction
  card?: string
  cluster?: string
  namespace?: string
  node?: string
  pod?: string
  deployment?: string
  // Additional context
  issue?: string
}

/**
 * Build a deep link URL for notifications
 */
export function buildDeepLinkURL(params: DeepLinkParams): string {
  const base = window.location.origin + window.location.pathname
  const searchParams = new URLSearchParams()

  if (params.drilldown) searchParams.set('drilldown', params.drilldown)
  if (params.action) searchParams.set('action', params.action)
  if (params.card) searchParams.set('card', params.card)
  if (params.cluster) searchParams.set('cluster', params.cluster)
  if (params.namespace) searchParams.set('namespace', params.namespace)
  if (params.node) searchParams.set('node', params.node)
  if (params.pod) searchParams.set('pod', params.pod)
  if (params.deployment) searchParams.set('deployment', params.deployment)
  if (params.issue) searchParams.set('issue', params.issue)

  return `${base}?${searchParams.toString()}`
}

/**
 * Send a browser notification with deep link support
 */
export function sendNotificationWithDeepLink(
  title: string,
  body: string,
  params: DeepLinkParams,
  options?: NotificationOptions
): Notification | null {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return null
  }

  const notification = new Notification(title, {
    body,
    icon: '/kubestellar-logo.svg',
    requireInteraction: true,
    ...options,
  })

  notification.onclick = () => {
    // Focus existing window or open new one
    window.focus()

    // Navigate to deep link
    const url = buildDeepLinkURL(params)
    window.location.href = url

    notification.close()
  }

  return notification
}

/**
 * Hook to handle incoming deep links
 */
export function useDeepLink() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { drillToNode, drillToPod, drillToCluster, drillToDeployment, drillToNamespace } = useDrillDownActions()

  // Process deep link params on mount
  useEffect(() => {
    const drilldown = searchParams.get('drilldown') as DeepLinkDrilldown | null
    const action = searchParams.get('action') as DeepLinkAction | null
    const cluster = searchParams.get('cluster')
    const namespace = searchParams.get('namespace')
    const node = searchParams.get('node')
    const pod = searchParams.get('pod')
    const deployment = searchParams.get('deployment')
    const issue = searchParams.get('issue')

    // Clear params after processing to avoid re-triggering
    const clearParams = () => {
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('drilldown')
      newParams.delete('action')
      newParams.delete('card')
      newParams.delete('cluster')
      newParams.delete('namespace')
      newParams.delete('node')
      newParams.delete('pod')
      newParams.delete('deployment')
      newParams.delete('issue')
      setSearchParams(newParams, { replace: true })
    }

    // Handle action-based navigation
    if (action) {
      switch (action) {
        case 'offline-detection':
          // Navigate to dashboard - the card will be visible
          navigate(ROUTES.HOME)
          break
        case 'hardware-health':
          navigate(ROUTES.HOME)
          break
        case 'security':
          navigate(ROUTES.SECURITY)
          break
        case 'alerts':
          navigate(ROUTES.ALERTS)
          break
      }
      clearParams()
      return
    }

    // Handle drilldown navigation
    if (drilldown && cluster) {
      // Small delay to ensure the app is ready
      const timer = setTimeout(() => {
        const issueData = issue ? { issue } : undefined

        switch (drilldown) {
          case 'node':
            if (node) {
              drillToNode(cluster, node, issueData)
            }
            break
          case 'pod':
            if (namespace && pod) {
              drillToPod(cluster, namespace, pod, issueData)
            }
            break
          case 'cluster':
            drillToCluster(cluster, issueData)
            break
          case 'deployment':
            if (namespace && deployment) {
              drillToDeployment(cluster, namespace, deployment, issueData)
            }
            break
          case 'namespace':
            if (namespace) {
              drillToNamespace(cluster, namespace)
            }
            break
        }

        clearParams()
      }, 500) // Wait for app to initialize

      return () => clearTimeout(timer)
    }

    // Handle card anchor - scroll to and highlight a specific card
    const card = searchParams.get('card')
    if (card) {
      clearParams()
      scrollToCard(card)
    }
  }, [searchParams, setSearchParams, navigate, drillToNode, drillToPod, drillToCluster, drillToDeployment, drillToNamespace])

  // Build deep link URL helper
  const buildURL = useCallback((params: DeepLinkParams) => {
    return buildDeepLinkURL(params)
  }, [])

  // Send notification helper
  const sendNotification = useCallback((
    title: string,
    body: string,
    params: DeepLinkParams,
    options?: NotificationOptions
  ) => {
    return sendNotificationWithDeepLink(title, body, params, options)
  }, [])

  return {
    buildURL,
    sendNotification,
  }
}

export default useDeepLink
