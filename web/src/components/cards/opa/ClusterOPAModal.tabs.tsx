// Policies and Violations tab panels for the OPA Gatekeeper cluster modal.
// Extracted from ClusterOPAModal.tsx (issue #24058) — markup unchanged.
import { Shield, AlertTriangle, CheckCircle, Edit3, Trash2, Sparkles, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Policy, Violation } from './types'
import { ALERT_SEVERITY_ORDER } from '../../../types/alerts'

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'text-red-400 bg-red-500/20'
    case 'warning': return 'text-yellow-400 bg-yellow-500/20'
    default: return 'text-blue-400 bg-blue-500/20'
  }
}

function getModeColor(mode: string) {
  switch (mode) {
    case 'enforce':
    case 'deny':
      return 'text-red-400 bg-red-500/20'
    case 'warn': return 'text-yellow-400 bg-yellow-500/20'
    default: return 'text-blue-400 bg-blue-500/20'
  }
}

interface OPAPoliciesTabProps {
  policies: Policy[]
  togglingPolicyId: string | null
  onEditYaml: (policy: Policy) => void
  onEditWithAI: (policy: Policy) => void
  onToggleMode: (policy: Policy) => void
  onRequestDelete: (policy: Policy) => void
}

export function OPAPoliciesTab({
  policies,
  togglingPolicyId,
  onEditYaml,
  onEditWithAI,
  onToggleMode,
  onRequestDelete,
}: OPAPoliciesTabProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="space-y-2">
      {policies.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>{t('messages.noPoliciesConfigured')}</p>
          <p className="text-xs mt-1">{t('messages.createPolicyPrompt')}</p>
        </div>
      ) : (
        policies.map(policy => (
          <div
            key={policy.name}
            onClick={() => onEditYaml(policy)}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
          >
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">{policy.name}</span>
                <span className="text-xs text-muted-foreground">({policy.kind})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleMode(policy) }}
                  disabled={!!togglingPolicyId}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${getModeColor(policy.mode)}`}
                  title="Click to cycle: enforce → warn → dryrun"
                >
                  {togglingPolicyId === policy.name ? (
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                  ) : null}
                  {policy.mode}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-y-2">
              <div className="flex items-center gap-3 text-xs">
                {policy.violations > 0 ? (
                  <span className="flex items-center gap-1 text-yellow-400">
                    <AlertTriangle className="w-3 h-3" />
                    {policy.violations} violations
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle className="w-3 h-3" />
                    No violations
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onEditWithAI(policy) }}
                  className="p-1.5 rounded hover:bg-secondary text-purple-400 transition-colors"
                  title="Edit with AI"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onEditYaml(policy) }}
                  className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit YAML"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRequestDelete(policy) }}
                  className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Delete policy"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

interface OPAViolationsTabProps {
  violations: Violation[]
}

export function OPAViolationsTab({ violations }: OPAViolationsTabProps) {
  const { t } = useTranslation(['cards', 'common'])
  const severityCounts = {
    critical: violations.filter(v => v.severity === 'critical').length,
    warning: violations.filter(v => v.severity === 'warning').length,
    info: violations.filter(v => v.severity === 'info').length,
  }

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 pb-4 border-b border-border">
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-2xl font-bold text-red-400">{severityCounts.critical}</p>
          <p className="text-xs text-muted-foreground">{t('common:common.critical')}</p>
        </div>
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-2xl font-bold text-yellow-400">{severityCounts.warning}</p>
          <p className="text-xs text-muted-foreground">{t('common:common.warning')}</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
          <p className="text-2xl font-bold text-blue-400">{severityCounts.info}</p>
          <p className="text-xs text-muted-foreground">Info</p>
        </div>
      </div>

      {/* Violations List */}
      <div className="space-y-2">
        {violations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-green-400">No violations</p>
            <p className="text-xs mt-1">All resources comply with policies</p>
          </div>
        ) : (
          [...violations]
            .sort((a, b) => {
              return (ALERT_SEVERITY_ORDER as Record<string, number>)[a.severity] - (ALERT_SEVERITY_ORDER as Record<string, number>)[b.severity]
            })
            .map((violation, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(violation.severity)}`}>
                    {violation.severity}
                  </span>
                  <span className="text-sm font-medium text-foreground">{violation.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{violation.kind}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{violation.message}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Namespace: <span className="text-foreground">{violation.namespace}</span></span>
                <span>Policy: <span className="text-orange-400">{violation.policy}</span></span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
