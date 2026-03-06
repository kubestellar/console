import { CheckCircle, ExternalLink, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../lib/modals'
import type { Policy, Violation } from './types'

export function PolicyDetailModal({
  isOpen,
  onClose,
  policy,
  violations,
  onAddPolicy
}: {
  isOpen: boolean
  onClose: () => void
  policy: Policy
  violations: Violation[]
  onAddPolicy: () => void
}) {
  const { t } = useTranslation(['cards', 'common'])
  // Get violations for this policy
  const policyViolations = violations.filter(v => v.policy === policy.name)

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'enforce':
      case 'deny':
        return 'text-red-400 bg-red-500/20'
      case 'warn': return 'text-yellow-400 bg-yellow-500/20'
      default: return 'text-blue-400 bg-blue-500/20'
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title={policy.name}
        description={policy.kind}
        icon={Shield}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[50vh]">
        {/* Policy Info */}
        <div className="mb-4 pb-4 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Enforcement Mode</p>
              <span className={`px-2 py-1 rounded text-sm font-medium ${getModeColor(policy.mode)}`}>
                {policy.mode}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Violations</p>
              <p className={`text-2xl font-bold ${policy.violations > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                {policy.violations}
              </p>
            </div>
          </div>
        </div>

        {/* Violations List */}
        {policyViolations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p>{t('messages.noViolations')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {policyViolations.map((violation, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{violation.name}</span>
                  <span className="text-xs text-muted-foreground">{violation.kind}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{violation.message}</p>
                <span className="text-xs text-muted-foreground">Namespace: <span className="text-foreground">{violation.namespace}</span></span>
              </div>
            ))}
          </div>
        )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <a
          href={`https://open-policy-agent.github.io/gatekeeper-library/website/${policy.kind.toLowerCase()}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
        >
          Policy Documentation
          <ExternalLink className="w-3 h-3" />
        </a>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onClose()
              onAddPolicy()
            }}
            className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
          >
            Create Similar Policy
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
