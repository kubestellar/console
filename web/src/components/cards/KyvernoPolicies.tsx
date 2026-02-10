import { useState, useMemo } from 'react'
import { AlertTriangle, CheckCircle, ExternalLink, AlertCircle, FileCheck } from 'lucide-react'
import { CardSearchInput } from '../../lib/cards'
import { useReportCardDataState } from './CardDataContext'

interface KyvernoPoliciesProps {
  config?: Record<string, unknown>
}

// Demo data for Kyverno policies
const DEMO_POLICIES = [
  {
    name: 'disallow-privileged',
    kind: 'ClusterPolicy',
    category: 'Pod Security',
    status: 'enforcing',
    violations: 2,
    description: 'Disallow privileged containers',
  },
  {
    name: 'require-labels',
    kind: 'ClusterPolicy',
    category: 'Best Practices',
    status: 'enforcing',
    violations: 8,
    description: 'Require app and team labels',
  },
  {
    name: 'restrict-image-registries',
    kind: 'ClusterPolicy',
    category: 'Supply Chain',
    status: 'audit',
    violations: 5,
    description: 'Only allow images from approved registries',
  },
  {
    name: 'add-network-policy',
    kind: 'ClusterPolicy',
    category: 'Network',
    status: 'enforcing',
    violations: 0,
    description: 'Automatically add default network policy',
  },
  {
    name: 'validate-resources',
    kind: 'Policy',
    category: 'Resources',
    status: 'audit',
    violations: 12,
    description: 'Validate resource requests and limits',
  },
]

const DEMO_STATS = {
  totalPolicies: 15,
  clusterPolicies: 12,
  namespacedPolicies: 3,
  totalViolations: 27,
  enforcingCount: 10,
  auditCount: 5,
}

export function KyvernoPolicies({ config: _config }: KyvernoPoliciesProps) {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0 })
  const [localSearch, setLocalSearch] = useState('')

  // Filter policies by local search
  const filteredPolicies = useMemo(() => {
    if (!localSearch.trim()) return DEMO_POLICIES
    const query = localSearch.toLowerCase()
    return DEMO_POLICIES.filter(policy =>
      policy.name.toLowerCase().includes(query) ||
      policy.category.toLowerCase().includes(query) ||
      policy.description.toLowerCase().includes(query) ||
      policy.status.toLowerCase().includes(query) ||
      policy.kind.toLowerCase().includes(query)
    )
  }, [localSearch])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enforcing': return 'bg-green-500/20 text-green-400'
      case 'audit': return 'bg-amber-500/20 text-amber-400'
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

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-cyan-400 font-medium">Kyverno Integration</p>
          <p className="text-muted-foreground">
            Install Kyverno for Kubernetes-native policy management.{' '}
            <a
              href="https://kyverno.io/docs/installation/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              Install guide →
            </a>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-center">
          <p className="text-[10px] text-cyan-400">Policies</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.totalPolicies}</p>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-[10px] text-green-400">Enforcing</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.enforcingCount}</p>
        </div>
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
          <p className="text-[10px] text-amber-400">Violations</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.totalViolations}</p>
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search policies..."
      />

      {/* Policies list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mb-2">
          <FileCheck className="w-3 h-3" />
          Sample Policies
        </p>
        {filteredPolicies.map(policy => (
          <div
            key={policy.name}
            className="p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">{policy.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${getStatusColor(policy.status)}`}>
                  {policy.status}
                </span>
              </div>
              {policy.violations > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <AlertTriangle className="w-3 h-3" />
                  {policy.violations}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className={getCategoryColor(policy.category)}>{policy.category}</span>
              <span className="text-muted-foreground">{policy.kind}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Features highlight */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground font-medium mb-2">Kyverno Features</p>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
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
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-[10px]">
        <a
          href="https://kyverno.io/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Documentation
        </a>
        <span className="text-muted-foreground/30">•</span>
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
