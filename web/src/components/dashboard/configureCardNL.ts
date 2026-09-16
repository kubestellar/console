import type { ClusterInfo } from '../../hooks/mcp/types'
import { CARD_TYPE_PATTERNS } from './cardConfigData'

export interface ExtractedCardConfig {
  config: Record<string, unknown>
  behaviors: Record<string, boolean>
  title?: string
}

export function detectCardType(prompt: string): string | null {
  const lowerPrompt = prompt.toLowerCase()

  for (const { patterns, cardType } of CARD_TYPE_PATTERNS) {
    for (const pattern of patterns) {
      if (lowerPrompt.includes(pattern)) {
        return cardType
      }
    }
  }

  return null
}

export function extractConfigFromPrompt(prompt: string, clusters: ClusterInfo[]): ExtractedCardConfig {
  const lowerPrompt = prompt.toLowerCase()
  const config: Record<string, unknown> = {}
  const behaviors: Record<string, boolean> = {}
  let title: string | undefined

  const clusterMatch = prompt.match(/(?:from|in|for|on|cluster[:\s]+)([a-z0-9-_]+)(?:\s+cluster)?/i)
  if (clusterMatch?.[1]) {
    const clusterName = clusterMatch[1]
    const matchedCluster = clusters.find((cluster) =>
      cluster.name.toLowerCase().includes(clusterName.toLowerCase()) ||
      clusterName.toLowerCase().includes(cluster.name.toLowerCase()),
    )

    config.cluster = matchedCluster?.name ?? clusterName
  }

  const namespaceMatch = prompt.match(/(?:namespace[:\s]+|ns[:\s]+|in\s+)([a-z0-9-_]+)/i)
  if (namespaceMatch?.[1] && !['the', 'a', 'an', 'from', 'cluster'].includes(namespaceMatch[1].toLowerCase())) {
    config.namespace = namespaceMatch[1]
  }

  const limitMatch = prompt.match(/(?:show|display|limit|max|top)\s*(\d+)/i)
  if (limitMatch?.[1]) {
    config.limit = parseInt(limitMatch[1], 10)
  }

  if (lowerPrompt.includes('warning') || lowerPrompt.includes('error')) {
    behaviors.warningsOnly = true
  }
  if (lowerPrompt.includes('alert') || lowerPrompt.includes('notify')) {
    behaviors.alertOnNew = true
    behaviors.alertOnCritical = true
  }
  if (lowerPrompt.includes('sound') && !lowerPrompt.includes('no sound')) {
    behaviors.soundOnWarning = true
  }
  if (lowerPrompt.includes('group') && lowerPrompt.includes('cluster')) {
    behaviors.groupByCluster = true
  }
  if (lowerPrompt.includes('unhealthy') && (lowerPrompt.includes('first') || lowerPrompt.includes('priority'))) {
    behaviors.showUnhealthyFirst = true
  }

  const titleMatch = prompt.match(/(?:title|name|call it|called)[:\s]+["']?([^"']+)["']?$/i)
  if (titleMatch?.[1]) {
    title = titleMatch[1].trim()
  }

  return { config, behaviors, title }
}

export function generateCardTitle(cardType: string, config: Record<string, unknown>): string {
  const parts: string[] = []

  switch (cardType) {
    case 'event_stream':
      parts.push('Events')
      break
    case 'pod_issues':
      parts.push('Pod Issues')
      break
    case 'deployment_status':
      parts.push('Deployments')
      break
    case 'deployment_issues':
      parts.push('Deployment Issues')
      break
    case 'cluster_health':
      parts.push('Cluster Health')
      break
    case 'resource_usage':
      parts.push('Resource Usage')
      break
    case 'gpu_status':
      parts.push('GPU Status')
      break
    default:
      parts.push(cardType.replace(/_/g, ' '))
  }

  if (config.cluster) {
    const clusterName = String(config.cluster).split('/').pop()
    parts.push(`(${clusterName})`)
  }
  if (config.namespace) {
    parts.push(`- ${config.namespace}`)
  }

  return parts.join(' ')
}
