/**
 * Modal showing detailed information about a policy violation.
 *
 * Opens when clicking a violation row in PolicyViolations card.
 * Shows violation details with "Fix with AI Mission" action.
 */

import { useRef, useEffect } from 'react'
import { Shield, Rocket } from 'lucide-react'
import { BaseModal } from '../../../lib/modals/BaseModal'
import { StatusBadge } from '../../ui/StatusBadge'
import { useMissions } from '../../../hooks/useMissions'
import { emitModalOpened, emitModalClosed, emitActionClicked } from '../../../lib/analytics'

interface PolicyViolationDetailModalProps {
  isOpen: boolean
  onClose: () => void
  violation: {
    policy: string
    count: number
    tool: string
    clusters: string[]
  } | null
}

const MODAL_TYPE = 'policy_violation'

export function PolicyViolationDetailModal({ isOpen, onClose, violation }: PolicyViolationDetailModalProps) {
  const openTimeRef = useRef<number>(0)
  const { startMission, openSidebar } = useMissions()

  useEffect(() => {
    if (isOpen && violation) {
      openTimeRef.current = Date.now()
      emitModalOpened(MODAL_TYPE, 'policy_violations')
    }
  }, [isOpen, violation])

  const handleClose = () => {
    if (openTimeRef.current > 0) {
      emitModalClosed(MODAL_TYPE, Date.now() - openTimeRef.current)
      openTimeRef.current = 0
    }
    onClose()
  }

  const handleFixWithAI = () => {
    if (!violation) return
    emitActionClicked('fix_with_ai', 'policy_violations', 'compliance')
    handleClose() // Close modal so mission sidebar is visible
    startMission({
      title: `Fix: ${violation.policy} violations`,
      description: `${violation.count} violations from ${violation.tool} on ${(violation.clusters || []).join(', ')}`,
      type: 'repair',
      cluster: (violation.clusters || [])[0],
      initialPrompt: `Policy '${violation.policy}' from ${violation.tool} flagged ${violation.count} violation(s) on cluster(s): ${(violation.clusters || []).join(', ')}.

Help me fix these violations:
1. List the specific resources that are violating this policy
2. Explain what the policy requires
3. Show me the changes needed to bring resources into compliance
4. Apply the fixes

Please proceed step by step.`,
      context: {
        policy: violation.policy,
        tool: violation.tool,
        clusters: violation.clusters,
        violationCount: violation.count } })
    openSidebar()
  }

  if (!violation) return null

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="md">
      <BaseModal.Header
        title={violation.policy}
        icon={Shield}
        onClose={handleClose}
        extra={
          <StatusBadge color="orange" size="md">
            {violation.count} violation{violation.count !== 1 ? 's' : ''}
          </StatusBadge>
        }
      />
      <BaseModal.Content>
        <div className="space-y-4">
          {/* Tool info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Tool</span>
              <StatusBadge color="blue" size="sm">{violation.tool}</StatusBadge>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Violations</span>
              <span className="text-lg font-bold text-orange-400">{violation.count}</span>
            </div>
          </div>

          {/* Clusters */}
          <div>
            <span className="text-xs font-medium text-muted-foreground mb-2 block">Affected Clusters</span>
            <div className="flex flex-wrap gap-1.5">
              {(violation.clusters || []).map(cluster => (
                <StatusBadge key={cluster} color="purple" size="sm">{cluster}</StatusBadge>
              ))}
            </div>
          </div>

          {/* Context */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              This policy has {violation.count} resource{violation.count !== 1 ? 's' : ''} in violation
              across {(violation.clusters || []).length} cluster{(violation.clusters || []).length !== 1 ? 's' : ''}.
              Use an AI Mission to investigate and remediate.
            </p>
          </div>

          {/* Fix with AI Mission */}
          <button
            onClick={handleFixWithAI}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm"
          >
            <Rocket className="w-4 h-4" />
            Fix with AI Mission
          </button>
        </div>
      </BaseModal.Content>
      <BaseModal.Footer showKeyboardHints />
    </BaseModal>
  )
}
