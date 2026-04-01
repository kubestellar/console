import { useState } from 'react'
import { Shield } from 'lucide-react'
import { Button } from '../ui/Button'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { api } from '../../lib/api'
import { useTranslation } from 'react-i18next'
import type { NamespaceDetails, NamespaceAccessEntry } from './types'

const COMMON_SUBJECTS = {
  User: [
    'admin@example.com',
    'developer@example.com',
    'operator@example.com',
    'viewer@example.com',
    'ci-bot@example.com',
  ],
  Group: [
    'system:authenticated',
    'system:cluster-admins',
    'developers',
    'operators',
    'viewers',
    'platform-team',
    'sre-team',
  ],
  ServiceAccount: [
    'default',
    'deployer',
    'argocd-application-controller',
    'flux-reconciler',
    'prometheus',
  ],
}

interface GrantAccessModalProps {
  namespace: NamespaceDetails
  existingAccess: NamespaceAccessEntry[]
  onClose: () => void
  onGranted: () => void
}

export function GrantAccessModal({ namespace, existingAccess, onClose, onGranted }: GrantAccessModalProps) {
  const { t } = useTranslation()
  const [subjectKind, setSubjectKind] = useState<'User' | 'Group' | 'ServiceAccount'>('User')
  const [subjectName, setSubjectName] = useState('')
  const [subjectNS, setSubjectNS] = useState('')
  const [role, setRole] = useState('admin')
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // Filter out subjects that already have access
  const existingSubjectNames = new Set(
    existingAccess
      .filter(e => e.subjectKind === subjectKind)
      .map(e => e.subjectName)
  )

  const availableSubjects = COMMON_SUBJECTS[subjectKind].filter(
    name => !existingSubjectNames.has(name)
  )

  const handleGrant = async () => {
    if (!subjectName) return

    setGranting(true)
    setError(null)

    try {
      await api.post(`/api/namespaces/${namespace.name}/access`, {
        cluster: namespace.cluster,
        subjectKind,
        subjectName,
        subjectNamespace: subjectKind === 'ServiceAccount' ? subjectNS : undefined,
        role,
      })
      onGranted()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to grant access'
      setError(errorMessage)
    } finally {
      setGranting(false)
    }
  }

  const selectSubject = (name: string) => {
    setSubjectName(name)
    setShowDropdown(false)
  }

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const forceClose = () => {
    setShowDiscardConfirm(false)
    onClose()
  }

  const handleClose = () => {
    if (subjectName.trim() !== '') {
      setShowDiscardConfirm(true)
      return
    }
    onClose()
  }

  return (
    <BaseModal isOpen={true} onClose={handleClose} size="md" closeOnBackdrop={false} closeOnEscape={true}>
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
        title="Grant Access"
        description={`Namespace: ${namespace.name}`}
        icon={Shield}
        onClose={handleClose}
        showBack={false}
      />

      <BaseModal.Content>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Subject Type</label>
            <select
              value={subjectKind}
              onChange={(e) => {
                setSubjectKind(e.target.value as 'User' | 'Group' | 'ServiceAccount')
                setSubjectName('') // Clear selection when type changes
              }}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="User">{t('namespaces.subjectUser')}</option>
              <option value="Group">{t('namespaces.subjectGroup')}</option>
              <option value="ServiceAccount">{t('namespaces.subjectServiceAccount')}</option>
            </select>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {subjectKind === 'User' ? 'Username / Email' : subjectKind === 'Group' ? 'Group Name' : 'Service Account Name'}
            </label>
            <div className="relative">
              <input
                type="text"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                placeholder={subjectKind === 'User' ? 'Select or type a user...' : subjectKind === 'Group' ? 'Select or type a group...' : 'Select or type a service account...'}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              {showDropdown && availableSubjects.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {availableSubjects
                    .filter(name => !subjectName || name.toLowerCase().includes(subjectName.toLowerCase()))
                    .map(name => (
                      <button
                        key={name}
                        onClick={() => selectSubject(name)}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-secondary/50 transition-colors"
                      >
                        {name}
                      </button>
                    ))}
                  {subjectName && !availableSubjects.some(n => n.toLowerCase() === subjectName.toLowerCase()) && (
                    <button
                      onClick={() => selectSubject(subjectName)}
                      className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-secondary/50 transition-colors border-t border-border"
                    >
                      Use &quot;{subjectName}&quot;
                    </button>
                  )}
                </div>
              )}
            </div>
            {showDropdown && (
              <button
                onClick={() => setShowDropdown(false)}
                className="fixed inset-0 z-0"
                aria-label="Close dropdown"
              />
            )}
          </div>

          {subjectKind === 'ServiceAccount' && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Service Account Namespace</label>
              <input
                type="text"
                value={subjectNS}
                onChange={(e) => setSubjectNS(e.target.value)}
                placeholder="default"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common.role')}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="cluster-admin">{t('namespaces.roleClusterAdmin')}</option>
              <option value="admin">{t('namespaces.roleAdmin')}</option>
              <option value="edit">{t('namespaces.roleEdit')}</option>
              <option value="view">{t('namespaces.roleView')}</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {t('namespaces.rolesNamespaceScoped')}
            </p>
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
            onClick={handleGrant}
            disabled={!subjectName || granting}
          >
            {granting ? 'Granting...' : 'Grant Access'}
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
