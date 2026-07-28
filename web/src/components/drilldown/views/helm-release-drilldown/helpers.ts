import type { HelmAIContext, HelmResourceContextInput, ParsedResource, StatusStyle } from './types'

export const ACTION_FEEDBACK_CLEAR_MS = 5_000

export const getStatusStyle = (status: string): StatusStyle => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'deployed' || lower === 'superseded') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }
  }
  if (lower === 'pending-install' || lower === 'pending-upgrade' || lower === 'pending-rollback') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' }
  }
  if (lower === 'failed' || lower === 'uninstalling') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
  }
  return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' }
}

export const parseHelmResources = (manifest: string, namespace: string): ParsedResource[] => {
  const resources: ParsedResource[] = []
  try {
    const docs = manifest.split('---').filter(d => d.trim())
    for (const doc of docs) {
      const kindMatch = doc.match(/kind:\s*(\w+)/)
      const nameMatch = doc.match(/name:\s*([^\s]+)/)
      const nsMatch = doc.match(/namespace:\s*([^\s]+)/)
      if (kindMatch && nameMatch) {
        resources.push({
          kind: kindMatch[1],
          name: nameMatch[1],
          namespace: nsMatch?.[1] || namespace,
        })
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return resources
}

export const buildHelmAIContext = ({
  releaseName,
  cluster,
  namespace,
  releaseStatus,
}: HelmResourceContextInput): HelmAIContext => {
  const resourceContext = {
    kind: 'HelmRelease',
    name: releaseName,
    cluster,
    namespace,
    status: releaseStatus,
  } as const

  const hasIssues = releaseStatus.toLowerCase() === 'failed' || releaseStatus.toLowerCase().includes('pending')
  const issues = hasIssues ? [{ name: releaseName, message: `Release status: ${releaseStatus}`, severity: 'warning' as const }] : []

  return { resourceContext, issues }
}
