import { Shield, AlertTriangle } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import type { AgentInfo } from '../../types/agent'
import { AgentIcon } from './AgentIcon'

const APPROVED_KEY = 'kc_agents_approved'

/** In-memory fallback when localStorage is unavailable or full */
let sessionApproved = false

/** Check whether the user has already approved agent access. */
export function hasApprovedAgents(): boolean {
  try {
    return localStorage.getItem(APPROVED_KEY) === 'true' || sessionApproved
  } catch {
    return sessionApproved
  }
}

/** Record that the user has approved agent access. */
export function setAgentsApproved(): void {
  sessionApproved = true
  try {
    localStorage.setItem(APPROVED_KEY, 'true')
  } catch {
    // storage full — sessionApproved already set above as fallback
  }
}

/** Clear approval (e.g. for testing or reset). */
export function clearAgentsApproval(): void {
  try {
    localStorage.removeItem(APPROVED_KEY)
  } catch {
    // ignore
  }
}

interface AgentApprovalDialogProps {
  isOpen: boolean
  agents: AgentInfo[]
  onApprove: () => void
  onCancel: () => void
}

export function AgentApprovalDialog({ isOpen, agents, onApprove, onCancel }: AgentApprovalDialogProps) {
  const available = agents.filter(a => a.available)

  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} size="md">
      <BaseModal.Header
        title="Authorize CLI Agents"
        description="Review and approve the agents that will run on your machine"
        icon={Shield}
        onClose={onCancel}
      />

      <BaseModal.Content>
        <div className="space-y-5">
          {/* Warning banner */}
          <div className="flex gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200/90">
              <p className="font-medium mb-1">These agents can execute commands on your system</p>
              <p className="text-amber-200/70">
                When enabled, AI agents run CLI tools (<code className="px-1 py-0.5 rounded bg-amber-500/20 text-xs">kubectl</code>,{' '}
                <code className="px-1 py-0.5 rounded bg-amber-500/20 text-xs">helm</code>, etc.) to diagnose and repair your Kubernetes
                clusters. Only approve if you trust this machine&apos;s kubeconfig access.
              </p>
            </div>
          </div>

          {/* Detected agents list */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Detected CLI agents ({available.length})
            </h3>
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
                <p className="text-sm text-muted-foreground italic">No CLI agents detected on this machine.</p>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            You can disable AI agents at any time from the <strong>AI Agent</strong> toggle in the top navbar.
          </p>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setAgentsApproved()
              onApprove()
            }}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            Approve &amp; Enable
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
