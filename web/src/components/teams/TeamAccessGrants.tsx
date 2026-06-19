import { useState } from 'react'
import { Shield, Loader2, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { BaseModal } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import { useClusters } from '../../hooks/useMCP'
import { useCachedNamespaces } from '../../hooks/useCachedData'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { authFetch } from '../../lib/api'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'

interface AccessGrant {
  cluster: string
  namespace?: string
  role: string
  isClusterScoped: boolean
}

interface TeamAccessGrantsProps {
  teamName: string
  grants: AccessGrant[]
  onGrantChanged: () => void
}

const ROLE_OPTIONS = [
  { value: 'cluster-admin', labelKey: 'namespaces.roleClusterAdmin' as const },
  { value: 'admin', labelKey: 'namespaces.roleAdmin' as const },
  { value: 'edit', labelKey: 'namespaces.roleEdit' as const },
  { value: 'view', labelKey: 'namespaces.roleView' as const },
]

export function TeamAccessGrants({ teamName, grants, onGrantChanged }: TeamAccessGrantsProps) {
  const { t } = useTranslation()
  const [showGrant, setShowGrant] = useState(false)
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { deduplicatedClusters: clusters } = useClusters()
  const safeClusters = clusters || []
  useGlobalFilters()

  const [selectedCluster, setSelectedCluster] = useState('')
  const [scope, setScope] = useState<'namespace' | 'cluster'>('namespace')
  const [selectedNamespace, setSelectedNamespace] = useState('')
  const [role, setRole] = useState('admin')
  const [applyToAll, setApplyToAll] = useState(false)

  const { namespaces } = useCachedNamespaces(selectedCluster || undefined)
  const safeNamespaces = namespaces || []

  const handleGrant = async () => {
    if (!selectedCluster && !applyToAll) return
    if (scope === 'namespace' && !selectedNamespace) return
    if (applyToAll && !selectedCluster) return

    setGranting(true)
    setError(null)

    try {
      const targets = applyToAll && !selectedCluster
        ? safeClusters.map(c => ({ cluster: c.name, ns: selectedNamespace }))
        : [{ cluster: selectedCluster, ns: selectedNamespace }]

      if (applyToAll && !selectedCluster) {
        for (const target of targets) {
          const payload: Record<string, string> = {
            cluster: target.cluster,
            subjectKind: 'Group',
            subjectName: teamName,
            role,
          }
          if (scope === 'namespace') {
            payload.namespace = target.ns
          }
          const res = await authFetch(`${LOCAL_AGENT_HTTP_URL}/rolebindings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            const errData = await res.json().catch(() => ({ error: 'Failed to grant access' }))
            throw new Error(errData.error || `Failed on ${target.cluster}`)
          }
        }
      } else {
        const payload: Record<string, string> = {
          cluster: selectedCluster,
          subjectKind: 'Group',
          subjectName: teamName,
          role,
        }
        if (scope === 'namespace') {
          payload.namespace = selectedNamespace
        }
        const res = await authFetch(`${LOCAL_AGENT_HTTP_URL}/rolebindings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Failed to grant access' }))
          throw new Error(errData.error || 'Failed to grant access')
        }
      }

      onGrantChanged()
      setShowGrant(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to grant access')
    } finally {
      setGranting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">
          {t('teams.accessGrants')}
        </h3>
        <Button variant="ghost" size="sm" icon={<Plus className="w-3 h-3" />} onClick={() => setShowGrant(true)}>
          {t('teams.grantAccess')}
        </Button>
      </div>

      {grants.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{t('teams.noAccessGrants')}</p>
      ) : (
        <div className="space-y-2">
          {grants.map((g, i) => (
            <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/20">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs text-foreground">
                  {g.cluster}{g.namespace ? `/ ${g.namespace}` : ''}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">{g.role}</span>
                {g.isClusterScoped && <span className="text-xs text-muted-foreground">(cluster-wide)</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showGrant && (
        <BaseModal isOpen={true} onClose={() => setShowGrant(false)} size="md">
          <BaseModal.Header
            title={t('teams.grantAccessTo', { teamName })}
            icon={Shield}
            onClose={() => setShowGrant(false)}
          />
          <BaseModal.Content>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">{error}</div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('teams.scope')}</label>
                <select
                  value={scope}
                  onChange={e => setScope(e.target.value as 'namespace' | 'cluster')}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white"
                >
                  <option value="namespace">{t('teams.namespaceScoped')}</option>
                  <option value="cluster">{t('teams.clusterScoped')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('teams.cluster')}</label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedCluster}
                    onChange={e => setSelectedCluster(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-white"
                    disabled={applyToAll}
                  >
                    <option value="">{t('teams.selectCluster')}</option>
                    {safeClusters.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={e => setApplyToAll(e.target.checked)}
                    className="rounded"
                  />
                  {t('teams.applyToAllClusters')}
                </label>
              </div>

              {scope === 'namespace' && !applyToAll && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t('teams.namespace')}</label>
                  <select
                    value={selectedNamespace}
                    onChange={e => setSelectedNamespace(e.target.value)}
                    disabled={!selectedCluster}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white disabled:opacity-50"
                  >
                    <option value="">{t('teams.selectNamespace')}</option>
                    {safeNamespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common.role')}</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white"
                >
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{t(r.labelKey)}</option>)}
                </select>
              </div>
            </div>
          </BaseModal.Content>
          <BaseModal.Footer>
            <div className="flex-1" />
            <div className="flex gap-3">
              <Button variant="ghost" size="lg" onClick={() => setShowGrant(false)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                size="lg"
                onClick={handleGrant}
                disabled={granting}
                icon={granting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
              >
                {granting ? t('teams.granting') : t('teams.grantAccess')}
              </Button>
            </div>
          </BaseModal.Footer>
        </BaseModal>
      )}
    </div>
  )
}
