import { useEffect, useState, useCallback } from 'react'
import { Shield, Trash2, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, authFetch } from '../../lib/api'
import { useToast } from '../ui/Toast'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { ClusterBadge } from '../ui/ClusterBadge'
import type { NamespaceDetails, NamespaceAccessEntry } from './types'

interface NamespaceAccessPanelProps {
  namespace: NamespaceDetails | null
  isAdmin: boolean
  onGrantAccess: () => void
}

export function NamespaceAccessPanel({
  namespace,
  isAdmin,
  onGrantAccess
}: NamespaceAccessPanelProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [accessEntries, setAccessEntries] = useState<NamespaceAccessEntry[]>([])
  const [accessLoading, setAccessLoading] = useState(false)

  const fetchAccess = useCallback(async (ns: NamespaceDetails) => {
    setAccessLoading(true)
    try {
      const response = await api.get<{ bindings: typeof accessEntries }>(`/api/namespaces/${encodeURIComponent(ns.name)}/access?cluster=${encodeURIComponent(ns.cluster)}`)
      setAccessEntries(response.data?.bindings || [])
    } catch (err: unknown) {
      console.error('Failed to fetch access:', err)
      setAccessEntries([])
      const message = err instanceof Error && err.message?.includes('403')
        ? t('namespaces.adminAccessRequired', 'Admin access required to view namespace details')
        : t('namespaces.fetchAccessFailed', 'Failed to fetch namespace access')
      showToast(message, 'error')
    } finally {
      setAccessLoading(false)
    }
  }, [showToast, t])

  const handleRevokeAccess = async (binding: NamespaceAccessEntry) => {
    if (!isAdmin) return
    if (!namespace) return

    if (!window.confirm(`Revoke access for ${binding.subjectName}?`)) {
      return
    }

    try {
      const params = new URLSearchParams({
        cluster: namespace.cluster,
        namespace: namespace.name,
        name: binding.bindingName,
      })
      const res = await authFetch(`${LOCAL_AGENT_HTTP_URL}/rolebindings?${params}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'unknown error' }))
        throw new Error(errorData.error || 'Failed to revoke access')
      }
      fetchAccess(namespace)
    } catch (err: unknown) {
      console.error('Failed to revoke access:', err)
      showToast('Failed to revoke access', 'error')
    }
  }

  useEffect(() => {
    if (namespace && isAdmin) {
      fetchAccess(namespace)
    }
  }, [namespace, fetchAccess, isAdmin])

  if (!namespace) return null

  return (
    <div className="w-96 glass rounded-xl p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium text-white">{namespace.name}</h3>
          <p className="text-sm text-muted-foreground">{t('namespaces.accessManagement', 'Access Management')}</p>
        </div>
        {isAdmin && (
          <button
            onClick={onGrantAccess}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-sm"
          >
            <UserPlus className="w-4 h-4" />
            {t('namespaces.grantAccess', 'Grant Access')}
          </button>
        )}
      </div>

      <ClusterBadge cluster={namespace.cluster} size="sm" className="mb-4" />

      {!isAdmin ? (
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('namespaces.adminRequiredForAccess', 'Admin access required to view role bindings')}</p>
        </div>
      ) : accessLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="spinner w-6 h-6" />
        </div>
      ) : accessEntries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('namespaces.noRoleBindings', 'No role bindings found')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accessEntries.map((entry, idx) => (
            <div
              key={`${entry.bindingName}-${idx}`}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{entry.subjectName}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                    {entry.subjectKind}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Role: {entry.roleName}
                </p>
              </div>
              <button
                onClick={() => handleRevokeAccess(entry)}
                className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title={t('namespaces.revokeAccess', 'Revoke access')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
