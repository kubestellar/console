import { useState } from 'react'
import { Folder, UserPlus, Shield, X, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'

// #7993 Phase 2: namespace create is a user-initiated write that must run
// under the user's kubeconfig via kc-agent, not the backend pod ServiceAccount.
function agentAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

const AVAILABLE_USERS = [
  'admin@example.com',
  'developer@example.com',
  'operator@example.com',
  'viewer@example.com',
  'ci-bot@example.com',
]

const AVAILABLE_GROUPS = [
  'developers',
  'operators',
  'viewers',
  'platform-team',
  'sre-team',
]

interface CreateNamespaceModalProps {
  clusters: string[]
  onClose: () => void
  onCreated: (cluster: string) => void
}

interface InitialAccessEntry {
  type: 'User' | 'Group'
  name: string
  role: 'cluster-admin' | 'admin' | 'edit' | 'view'
}

export function CreateNamespaceModal({ clusters, onClose, onCreated }: CreateNamespaceModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState(clusters[0] || '')
  const [teamLabel, setTeamLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialAccess, setInitialAccess] = useState<InitialAccessEntry[]>([])
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showGroupDropdown, setShowGroupDropdown] = useState(false)

  const addUserAccess = (user: string) => {
    if (!initialAccess.some(a => a.type === 'User' && a.name === user)) {
      setInitialAccess([...initialAccess, { type: 'User', name: user, role: 'edit' }])
    }
    setShowUserDropdown(false)
  }

  const addGroupAccess = (group: string) => {
    if (!initialAccess.some(a => a.type === 'Group' && a.name === group)) {
      setInitialAccess([...initialAccess, { type: 'Group', name: group, role: 'edit' }])
    }
    setShowGroupDropdown(false)
  }

  const removeAccess = (index: number) => {
    setInitialAccess(initialAccess.filter((_, i) => i !== index))
  }

  const updateAccessRole = (index: number, role: 'cluster-admin' | 'admin' | 'edit' | 'view') => {
    setInitialAccess(initialAccess.map((a, i) => i === index ? { ...a, role } : a))
  }

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
      // user's kubeconfig. kc-agent does not accept the `initialAccess` field;
      // the legacy backend silently ignored it too, so no behavior is lost.
      // Grants still flow through GrantAccessModal's POST /rolebindings call.
      const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/namespaces`, {
        method: 'POST',
        headers: agentAuthHeaders(),
        body: JSON.stringify({
          cluster,
          name,
          labels: Object.keys(labels).length > 0 ? labels : undefined,
        }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create namespace (HTTP ${res.status})`)
      }
      onCreated(cluster)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create namespace'
      setError(errorMessage)
    } finally {
      setCreating(false)
    }
  }

  const availableUsers = AVAILABLE_USERS.filter(
    u => !initialAccess.some(a => a.type === 'User' && a.name === u)
  )

  const availableGroups = AVAILABLE_GROUPS.filter(
    g => !initialAccess.some(a => a.type === 'Group' && a.name === g)
  )

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const forceClose = () => {
    setShowDiscardConfirm(false)
    onClose()
  }

  const handleClose = () => {
    if (name.trim() !== '' || teamLabel.trim() !== '' || initialAccess.length > 0) {
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
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* Initial Access Section */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Grant Initial Access (optional)
            </label>

            {/* Add User/Group buttons */}
            <div className="flex gap-2 mb-3">
              <div className="relative">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  Add User
                </button>
                {showUserDropdown && availableUsers.length > 0 && (
                  <div
                    role="listbox"
                    aria-label="Select user"
                    className="absolute z-10 top-full left-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto"
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                      e.preventDefault()
                      const items = e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')
                      const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
                      if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
                      else items[Math.max(idx - 1, 0)]?.focus()
                    }}
                  >
                    {availableUsers.map(user => (
                      <button
                        key={user}
                        role="option"
                        aria-selected={false}
                        onClick={() => addUserAccess(user)}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-secondary/50 transition-colors"
                      >
                        {user}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <Button
                  variant="accent"
                  onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                  icon={<Shield className="w-4 h-4" />}
                >
                  Add Group
                </Button>
                {showGroupDropdown && availableGroups.length > 0 && (
                  <div
                    role="listbox"
                    aria-label="Select group"
                    className="absolute z-10 top-full left-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto"
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                      e.preventDefault()
                      const items = e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')
                      const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
                      if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
                      else items[Math.max(idx - 1, 0)]?.focus()
                    }}
                  >
                    {availableGroups.map(group => (
                      <button
                        key={group}
                        role="option"
                        aria-selected={false}
                        onClick={() => addGroupAccess(group)}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-secondary/50 transition-colors"
                      >
                        {group}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Close dropdowns overlay */}
            {(showUserDropdown || showGroupDropdown) && (
              <button
                onClick={() => {
                  setShowUserDropdown(false)
                  setShowGroupDropdown(false)
                }}
                className="fixed inset-0 z-0"
                aria-label="Close dropdown"
              />
            )}

            {/* Selected access list */}
            {initialAccess.length > 0 && (
              <div className="space-y-2">
                {initialAccess.map((entry, index) => (
                  <div
                    key={`${entry.type}-${entry.name}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-secondary/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        entry.type === 'User' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {entry.type}
                      </span>
                      <span className="text-sm text-white">{entry.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={entry.role}
                        onChange={(e) => updateAccessRole(index, e.target.value as 'cluster-admin' | 'admin' | 'edit' | 'view')}
                        className="px-2 py-1 text-xs rounded bg-secondary border border-border text-white"
                      >
                        <option value="cluster-admin">{t('namespaces.roleFullAdmin')}</option>
                        <option value="admin">{t('namespaces.roleAdminShort')}</option>
                        <option value="edit">{t('common.edit')}</option>
                        <option value="view">{t('common.view')}</option>
                      </select>
                      <button
                        onClick={() => removeAccess(index)}
                        className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {initialAccess.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No initial access configured. You can add users/groups after creation.
              </p>
            )}
          </div>
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
