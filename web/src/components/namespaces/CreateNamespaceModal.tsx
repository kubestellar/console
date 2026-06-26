import { useState } from 'react'
import { Folder, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { agentFetch } from '../../hooks/mcp/shared'

interface CreateNamespaceModalProps {
  clusters: string[]
  onClose: () => void
  onCreated: (cluster: string) => void
}

export function CreateNamespaceModal({ clusters, onClose, onCreated }: CreateNamespaceModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState(clusters[0] || '')
  const [teamLabel, setTeamLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const handleCreate = async () => {
    if (!name || !cluster) return

    setCreating(true)
    setError(null)

    try {
      const labels: Record<string, string> = {}
      if (teamLabel) {
        labels['team'] = teamLabel
      }

      // #7993 Phase 2: POST to kc-agent so the operation runs under the
      // user's kubeconfig. kc-agent does not accept an initialAccess field —
      // grants flow through GrantAccessModal's POST /rolebindings call once
      // the namespace exists. #10699: switched from authFetch (backend JWT)
      // to agentFetch (kc-agent token) so the request authenticates correctly
      // against kc-agent and carries the right CORS headers.
      const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/namespaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster,
          name,
          labels: Object.keys(labels).length > 0 ? labels : undefined,
        }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create namespace (HTTP ${res.status})`)
      }
      onCreated(cluster)
    } catch (err: unknown) {
      let errorMessage: string
      if (err instanceof TypeError) {
        errorMessage = t('namespaces.errors.agentNotReachable')
      } else if (err instanceof Error) {
        errorMessage = err.message
      } else {
        errorMessage = t('namespaces.errors.createFailed')
      }
      setError(errorMessage)
    } finally {
      setCreating(false)
    }
  }

  const forceClose = () => {
    setShowDiscardConfirm(false)
    onClose()
  }

  const handleClose = () => {
    if (name.trim() !== '' || teamLabel.trim() !== '') {
      setShowDiscardConfirm(true)
      return
    }
    onClose()
  }

  return (
    <BaseModal isOpen={true} onClose={handleClose} size="lg" closeOnBackdrop={false} closeOnEscape={true}>
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={forceClose}
        title={t('common:common.discardUnsavedChanges', 'Discard unsaved changes?')}
        message={t('common:common.discardUnsavedChangesMessage', 'You have unsaved changes that will be lost.')}
        confirmLabel={t('common:common.discard', 'Discard')}
        cancelLabel={t('common:common.keepEditing', 'Keep editing')}
        variant="warning"
      />
      <BaseModal.Header
        title="Create Namespace"
        icon={Folder}
        onClose={handleClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[60vh]">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common.cluster')}</label>
            <select
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/50"
            >
              {clusters.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Namespace Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="my-namespace"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500/50"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Team Label (optional)</label>
            <input
              type="text"
              value={teamLabel}
              onChange={(e) => setTeamLabel(e.target.value)}
              placeholder="platform-team"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* #8034 Copilot followup: the initial-access UI was removed in the
            * namespace refactor (#8028) because kc-agent's POST /namespaces
            * handler does not accept an initialAccess field. Grants now flow
            * through GrantAccessModal after the namespace is created. */}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          <Button
            variant="ghost"
            size="lg"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handleCreate}
            disabled={!name || !cluster || creating}
            icon={creating ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
          >
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
