import { Shield, AlertTriangle } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { BaseModal } from '../../lib/modals'
import type { AgentInfo } from '../../types/agent'
import { AgentIcon } from './AgentIcon'
import { safeGet, safeSet, safeRemove } from '../../lib/safeLocalStorage'
import { Button } from '../ui/Button'

const APPROVED_KEY = 'kc_agents_approved'

/** In-memory fallback when localStorage is unavailable or full */
let sessionApproved = false

/** Check whether the user has already approved agent access. */
export function hasApprovedAgents(): boolean {
  return safeGet(APPROVED_KEY) === 'true' || sessionApproved
}

/** Record that the user has approved agent access. */
export function setAgentsApproved(): void {
  sessionApproved = true
  safeSet(APPROVED_KEY, 'true')
}

/** Clear approval (e.g. for testing or reset). */
export function clearAgentsApproval(): void {
  safeRemove(APPROVED_KEY)
}

interface AgentApprovalDialogProps {
  isOpen: boolean
  agents: AgentInfo[]
  onApprove: () => void
  onCancel: () => void
}

export function AgentApprovalDialog({ isOpen, agents, onApprove, onCancel }: AgentApprovalDialogProps) {
  const { t } = useTranslation()
  const available = (agents || []).filter(agent => agent.available)

  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} size="md">
      <BaseModal.Header
        title={t('agent.approval.title')}
        description={t('agent.approval.description')}
        icon={Shield}
        onClose={onCancel}
      />

      <BaseModal.Content>
        <div className="space-y-5">
          {/* Warning banner */}
          <div className="flex gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200/90">
              <p className="font-medium mb-1">{t('agent.approval.executeWarning')}</p>
              <p className="text-amber-200/70">
                <Trans
                  i18nKey="agent.approval.enabledDescription"
                  components={{
                    kubectl: <code className="px-1 py-0.5 rounded bg-amber-500/20 text-xs" />,
                    helm: <code className="px-1 py-0.5 rounded bg-amber-500/20 text-xs" />,
                  }}
                />
              </p>
            </div>
          </div>

          {/* Detected agents list */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('agent.approval.detectedAgents', { count: available.length })}</h3>
            <div className="space-y-2">
              {available.map(agent => (
                <div
                  key={agent.name}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border"
                >
                  <AgentIcon provider={agent.provider} className="w-5 h-5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">{agent.displayName}</span>
                    <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
                  </div>
                </div>
              ))}
              {available.length === 0 && (
                <p className="text-sm text-muted-foreground italic">{t('agent.approval.noAgentsDetected')}</p>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            <Trans
              i18nKey="agent.approval.disableHint"
              components={{ strong: <strong /> }}
            />
          </p>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <div className="flex items-center justify-end gap-3 w-full">
          <Button
            onClick={onCancel}
            variant="ghost"
            size="md"
          >
            {t('agent.approval.cancel')}
          </Button>
          <Button
            onClick={() => {
              setAgentsApproved()
              onApprove()
            }}
            variant="primary"
            size="md"
          >
            {t('agent.approval.approveEnable')}
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
