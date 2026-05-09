import type { KubescapeClusterStatus } from '../hooks/useKubescape'
import type { KyvernoClusterStatus } from '../hooks/useKyverno'

export interface ComplianceScoreBreakdownItem {
  name: string
  value: number
}

export interface ComplianceScoreSummary {
  score: number
  breakdown: ComplianceScoreBreakdownItem[]
  usingFallback: boolean
}

interface ComplianceScoreInput {
  kubescapeStatuses: Record<string, KubescapeClusterStatus>
  kyvernoStatuses: Record<string, KyvernoClusterStatus>
  selectedClusters?: string[]
}

export const DEMO_COMPLIANCE_SCORE = 85
export const DEMO_COMPLIANCE_BREAKDOWN: ComplianceScoreBreakdownItem[] = [
  { name: 'CIS', value: 82 },
  { name: 'NSA', value: 79 },
  { name: 'PCI', value: 71 },
]

function isIncludedCluster(clusterName: string, selectedClusters: string[]): boolean {
  return selectedClusters.length === 0 || selectedClusters.includes(clusterName)
}

export function buildComplianceScoreSummary({
  kubescapeStatuses,
  kyvernoStatuses,
  selectedClusters = [],
}: ComplianceScoreInput): ComplianceScoreSummary {
  const scores: ComplianceScoreBreakdownItem[] = []

  const kubescapeClusters = Object.entries(kubescapeStatuses)
    .filter(([clusterName, status]) => (
      status.installed &&
      status.totalControls > 0 &&
      isIncludedCluster(clusterName, selectedClusters)
    ))

  if (kubescapeClusters.length > 0) {
    const totalScore = kubescapeClusters.reduce((sum, [, status]) => sum + status.overallScore, 0)
    scores.push({ name: 'Kubescape', value: Math.round(totalScore / kubescapeClusters.length) })
  }

  let totalPolicies = 0
  let totalViolations = 0
  for (const [clusterName, status] of Object.entries(kyvernoStatuses)) {
    if (!status.installed || !isIncludedCluster(clusterName, selectedClusters)) {
      continue
    }
    totalPolicies += status.totalPolicies
    totalViolations += status.totalViolations
  }

  if (totalPolicies > 0) {
    const rate = totalViolations === 0
      ? 100
      : Math.max(0, Math.round(100 - (totalViolations / totalPolicies) * 100))
    scores.push({ name: 'Kyverno', value: rate })
  }

  if (scores.length === 0) {
    return {
      score: DEMO_COMPLIANCE_SCORE,
      breakdown: DEMO_COMPLIANCE_BREAKDOWN,
      usingFallback: true,
    }
  }

  return {
    score: Math.round(scores.reduce((sum, item) => sum + item.value, 0) / scores.length),
    breakdown: scores,
    usingFallback: false,
  }
}
