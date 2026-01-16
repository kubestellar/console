import { Server } from 'lucide-react'
import { cn } from '../../lib/cn'

interface ClusterBadgeProps {
  cluster: string
  size?: 'sm' | 'md'
  className?: string
  showIcon?: boolean
}

// Consistent color mapping for cluster names
const clusterColors: Record<string, { bg: string; text: string; border: string }> = {
  'vllm-d': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  'prod-east': { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  'prod-west': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  'staging': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  'ops': { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  'prow': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
}

interface ClusterInfo {
  colors: { bg: string; text: string; border: string }
  environment: string
  region?: string
}

function getClusterInfo(cluster: string): ClusterInfo {
  const lowerCluster = cluster.toLowerCase()

  // Detect region from common patterns
  const regionPatterns = [
    /(?:us|eu|ap|sa|af|me|ca)-(?:east|west|north|south|central)(?:-\d+)?/i,
    /(?:east|west|north|south|central)(?:us|eu|asia)?(?:-\d+)?/i,
    /region[_-]?(\w+)/i,
  ]
  let region: string | undefined
  for (const pattern of regionPatterns) {
    const match = cluster.match(pattern)
    if (match) {
      region = match[0]
      break
    }
  }

  // Check for exact match first
  if (clusterColors[cluster]) {
    return {
      colors: clusterColors[cluster],
      environment: cluster,
      region,
    }
  }

  // Check for partial matches to detect environment
  if (lowerCluster.includes('prod')) {
    return {
      colors: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
      environment: 'Production',
      region,
    }
  }
  if (lowerCluster.includes('staging') || lowerCluster.includes('stage')) {
    return {
      colors: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
      environment: 'Staging',
      region,
    }
  }
  if (lowerCluster.includes('dev')) {
    return {
      colors: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
      environment: 'Development',
      region,
    }
  }
  if (lowerCluster.includes('test')) {
    return {
      colors: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
      environment: 'Test',
      region,
    }
  }
  if (lowerCluster.includes('edge')) {
    return {
      colors: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
      environment: 'Edge',
      region,
    }
  }

  // Default
  return {
    colors: { bg: 'bg-secondary', text: 'text-muted-foreground', border: 'border-border/50' },
    environment: 'Cluster',
    region,
  }
}

function buildTooltip(cluster: string, info: ClusterInfo): string {
  const lines = [`Cluster: ${cluster}`]
  if (info.environment && info.environment !== cluster) {
    lines.push(`Environment: ${info.environment}`)
  }
  if (info.region) {
    lines.push(`Region: ${info.region}`)
  }
  return lines.join('\n')
}

export function ClusterBadge({ cluster, size = 'sm', className, showIcon = true }: ClusterBadgeProps) {
  const info = getClusterInfo(cluster)
  const tooltip = buildTooltip(cluster, info)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border font-medium cursor-default',
        info.colors.bg,
        info.colors.text,
        info.colors.border,
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
        className
      )}
      title={tooltip}
    >
      {showIcon && <Server className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />}
      {cluster}
    </span>
  )
}
