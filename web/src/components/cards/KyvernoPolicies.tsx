/**
 * Kyverno Policies card — live data from useKyverno hook.
 *
 * Detects Kyverno installation per cluster via CRD check, then fetches
 * policies and policy reports. Falls back to demo data when not installed.
 * Offers AI mission install link in demo/uninstalled state.
 */

import { useState, useMemo } from 'react'
import { AlertTriangle, CheckCircle, ExternalLink, AlertCircle, FileCheck } from 'lucide-react'
import { CardSearchInput } from '../../lib/cards'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useKyverno } from '../../hooks/useKyverno'
import { useMissions } from '../../hooks/useMissions'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { StatusBadge } from '../ui/StatusBadge'
import type { KyvernoPolicy } from '../../hooks/useKyverno'

interface KyvernoPoliciesProps {
  config?: Record<string, unknown>
}

function KyvernoPoliciesInternal({ config: _config }: KyvernoPoliciesProps) {
  const { t } = useTranslation()
  const { statuses, isLoading, installed, isDemoData } = useKyverno()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [localSearch, setLocalSearch] = useState('')

  // Aggregate all policies across clusters, filtered by global cluster filter
  const allPolicies = useMemo(() => {
    const policies: KyvernoPolicy[] = []
    for (const [clusterName, status] of Object.entries(statuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      policies.push(...(status.policies || []))
    }
    return policies
  }, [statuses, selectedClusters])

  // Stats
  const stats = useMemo(() => {
    let totalPolicies = 0
    let enforcingCount = 0
    let totalViolations = 0
    for (const [clusterName, status] of Object.entries(statuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      totalPolicies += status.totalPolicies
      enforcingCount += status.enforcingCount
      totalViolations += status.totalViolations
    }
    return { totalPolicies, enforcingCount, totalViolations }
  }, [statuses, selectedClusters])

  // Filter policies by local search
  const filteredPolicies = useMemo(() => {
    if (!localSearch.trim()) return allPolicies
    const query = localSearch.toLowerCase()
    return allPolicies.filter(policy =>
      policy.name.toLowerCase().includes(query) ||
      policy.category.toLowerCase().includes(query) ||
      policy.description.toLowerCase().includes(query) ||
      policy.status.toLowerCase().includes(query) ||
      policy.kind.toLowerCase().includes(query) ||
      policy.cluster.toLowerCase().includes(query)
    )
  }, [localSearch, allPolicies])

  useCardLoadingState({
    isLoading,
    hasAnyData: installed || isDemoData,
    isDemoData,
  })

  const handleInstall = () => {
    startMission({
      title: 'Install Kyverno',
      description: 'Install Kyverno for Kubernetes-native policy management',
      type: 'deploy',
      initialPrompt: `I want to install Kyverno for policy management on my clusters.

Please help me:
1. Install Kyverno via Helm (audit mode only — do NOT enforce)
2. Verify the installation is running
3. Set up a basic audit policy (like requiring labels)

Use: helm install kyverno kyverno/kyverno --namespace kyverno --create-namespace --version v1.17.1 --set admissionController.replicas=1

Important: Set validationFailureAction to Audit (not Enforce) for all policies to avoid breaking workloads.

Please proceed step by step.`,
      context: {},
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enforcing': return 'bg-green-500/20 text-green-400'
      case 'audit': return 'bg-yellow-500/20 text-yellow-400'
      default: return 'bg-blue-500/20 text-blue-400'
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Pod Security': return 'text-red-400'
      case 'Best Practices': return 'text-blue-400'
      case 'Supply Chain': return 'text-purple-400'
      case 'Network': return 'text-cyan-400'
      case 'Resources': return 'text-orange-400'
      default: return 'text-muted-foreground'
    }
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Controls */}
      <div className="flex items-center justify-end gap-1 mb-3">
        <a
          href="https://kyverno.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
          title="Kyverno Documentation"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Install prompt when not detected */}
      {!installed && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">Kyverno Integration</p>
            <p className="text-muted-foreground">
              Install Kyverno for Kubernetes-native policy management.{' '}
              <button onClick={handleInstall} className="text-purple-400 hover:underline">
                Install with AI →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Per-cluster badges */}
      {installed && Object.values(statuses).filter(s => s.installed).length > 1 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {Object.values(statuses).filter(s => s.installed).map(s => (
            <StatusBadge
              key={s.cluster}
              color={s.totalViolations > 0 ? 'yellow' : 'green'}
              size="xs"
            >
              {s.cluster}: {s.totalPolicies}p/{s.totalViolations}v
            </StatusBadge>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-center">
          <p className="text-2xs text-cyan-400">Policies</p>
          <p className="text-lg font-bold text-foreground">{stats.totalPolicies}</p>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-2xs text-green-400">Enforcing</p>
          <p className="text-lg font-bold text-foreground">{stats.enforcingCount}</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-2xs text-yellow-400">Violations</p>
          <p className="text-lg font-bold text-foreground">{stats.totalViolations}</p>
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('common.searchPolicies')}
      />

      {/* Policies list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mb-2">
          <FileCheck className="w-3 h-3" />
          {isDemoData ? 'Sample Policies' : `${filteredPolicies.length} Policies`}
        </p>
        {(filteredPolicies || []).map((policy, i) => (
          <div
            key={`${policy.cluster}-${policy.name}-${i}`}
            className="p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">{policy.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-2xs ${getStatusColor(policy.status)}`}>
                  {policy.status}
                </span>
              </div>
              {policy.violations > 0 && (
                <span className="flex items-center gap-1 text-xs text-yellow-400">
                  <AlertTriangle className="w-3 h-3" />
                  {policy.violations}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className={getCategoryColor(policy.category)}>{policy.category}</span>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{policy.kind}</span>
                {Object.values(statuses).filter(s => s.installed).length > 1 && (
                  <span className="text-2xs">{policy.cluster}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Features highlight */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-2xs text-muted-foreground font-medium mb-2">Kyverno Features</p>
        <div className="grid grid-cols-2 gap-1.5 text-2xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Validate Resources
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Mutate Resources
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Generate Resources
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Image Verification
          </div>
        </div>
      </div>

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-2xs">
        <a
          href="https://kyverno.io/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Documentation
        </a>
        <span className="text-muted-foreground/30">·</span>
        <a
          href="https://kyverno.io/policies/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Policy Library
        </a>
      </div>
    </div>
  )
}

export function KyvernoPolicies({ config: _config }: KyvernoPoliciesProps) {
  return (
    <DynamicCardErrorBoundary cardId="KyvernoPolicies">
      <KyvernoPoliciesInternal config={_config} />
    </DynamicCardErrorBoundary>
  )
}
