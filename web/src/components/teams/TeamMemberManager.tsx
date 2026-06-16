import { useState } from 'react'
import { Plus, X, Shield, User } from 'lucide-react'
import { Button } from '../ui/Button'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import type { TeamMemberInfo, TeamRole } from '../../types/teams'

interface TeamMemberManagerProps {
  members: TeamMemberInfo[]
  currentUserId: string
  onAddMember: (userId: string, role: TeamRole) => Promise<boolean>
  onRemoveMember: (userId: string) => Promise<boolean>
  onChangeRole: (userId: string, role: TeamRole) => void
}

export function TeamMemberManager({ members, currentUserId, onAddMember, onRemoveMember, onChangeRole }: TeamMemberManagerProps) {
  const { t } = useTranslation()
  const [showAdd, setShowAdd] = useState(false)
  const [newUserId, setNewUserId] = useState('')
  const [newRole, setNewRole] = useState<TeamRole>('member')
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!newUserId.trim()) return
    const ok = await onAddMember(newUserId.trim(), newRole)
    if (ok) {
      setNewUserId('')
      setNewRole('member')
      setShowAdd(false)
    }
  }

  const handleRemove = async () => {
    if (!removingUserId) return
    await onRemoveMember(removingUserId)
    setRemovingUserId(null)
  }

  const admins = members.filter(m => m.role === 'admin')
  const regulars = members.filter(m => m.role === 'member')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">
          {members.length} {t('teams.members')}
        </h3>
        <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setShowAdd(true)}>
          {t('teams.addMember')}
        </Button>
      </div>

      {admins.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{t('teams.teamAdmins')}</p>
          {admins.map(m => (
            <div key={m.userId} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-secondary/30 group">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-foreground">{m.githubLogin}</span>
                {m.email && <span className="text-xs text-muted-foreground hidden sm:inline">{m.email}</span>}
              </div>
              {m.userId !== currentUserId && (
                <button onClick={() => setRemovingUserId(m.userId)} className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{t('teams.teamMembers')}</p>
        {regulars.map(m => (
          <div key={m.userId} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-secondary/30 group">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-foreground">{m.githubLogin}</span>
              {m.email && <span className="text-xs text-muted-foreground hidden sm:inline">{m.email}</span>}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={m.role}
                onChange={e => onChangeRole(m.userId, e.target.value as TeamRole)}
                className="text-xs bg-secondary border border-border rounded px-1.5 py-0.5 text-muted-foreground"
              >
                <option value="member">{t('teams.member')}</option>
                <option value="admin">{t('teams.admin')}</option>
              </select>
              {m.userId !== currentUserId && (
                <button onClick={() => setRemovingUserId(m.userId)} className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <BaseModal isOpen={true} onClose={() => setShowAdd(false)} size="sm">
          <BaseModal.Header title={t('teams.addMember')} onClose={() => setShowAdd(false)} />
          <BaseModal.Content>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('teams.userId')}</label>
                <input
                  type="text"
                  value={newUserId}
                  onChange={e => setNewUserId(e.target.value)}
                  placeholder="GitHub login or user ID"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('teams.role')}</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as TeamRole)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white"
                >
                  <option value="member">{t('teams.member')}</option>
                  <option value="admin">{t('teams.admin')}</option>
                </select>
              </div>
            </div>
          </BaseModal.Content>
          <BaseModal.Footer>
            <div className="flex-1" />
            <div className="flex gap-3">
              <Button variant="ghost" size="lg" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" size="lg" onClick={handleAdd} disabled={!newUserId.trim()}>{t('teams.addMember')}</Button>
            </div>
          </BaseModal.Footer>
        </BaseModal>
      )}

      <ConfirmDialog
        isOpen={!!removingUserId}
        onClose={() => setRemovingUserId(null)}
        onConfirm={handleRemove}
        title={t('teams.removeMemberTitle')}
        message={t('teams.removeMemberMessage')}
        confirmLabel={t('teams.removeMember')}
        cancelLabel={t('common.cancel')}
        variant="danger"
      />
    </div>
  )
}
