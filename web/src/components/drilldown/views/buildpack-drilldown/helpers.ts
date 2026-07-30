import { Box, FileText, History, Package, Stethoscope } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import type { BuildpackStatus, KpackBuild, KpackCondition, StatusStyle, TabType } from './types'

export function getStatusStyle(status: BuildpackStatus): StatusStyle {
  switch (status) {
    case 'succeeded':
      return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }
    case 'building':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' }
    case 'failed':
      return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
    case 'unknown':
    default:
      return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' }
  }
}

export function mapConditionToBuildpackStatus(condition?: KpackCondition): BuildpackStatus {
  if (!condition) return 'unknown'

  switch (condition.status) {
    case 'True':
      return 'succeeded'
    case 'False':
      return 'failed'
    case 'Unknown':
    default:
      return 'building'
  }
}

export function sortBuildsByNewest(builds: KpackBuild[]): KpackBuild[] {
  return [...builds].sort((a, b) => {
    const timeA = new Date(a.metadata.creationTimestamp).getTime()
    const timeB = new Date(b.metadata.creationTimestamp).getTime()
    return timeB - timeA
  })
}

export function getBuildStatusLabel(status: BuildpackStatus): string {
  if (status === 'succeeded') return 'Success'
  if (status === 'failed') return 'Failed'
  return 'Building'
}

export const TABS: { id: TabType; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: 'overview', label: 'Overview', icon: Package },
  { id: 'yaml', label: 'YAML', icon: FileText },
  { id: 'builds', label: 'Build History', icon: History },
  { id: 'logs', label: 'Logs', icon: Box },
  { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
]
