import { useState } from 'react'
import { ArrowLeft, Pencil, Trash2, Shield } from 'lucide-react'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../../lib/modals'
import { TeamMemberManager } from './TeamMemberManager'
import { TeamAccessGrants } from './TeamAccessGrants'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../lib/auth'
import type { TeamWithMembers, TeamRole } from '../../types/teams'

interface TeamDetailProps {
  team: TeamWithMembers
  onBack: () => void
  onUpdateTeam: (name: string, description: string) => void
  onDeleteTeam: () => void
  onAddMember: (userId: string, role: TeamRole) => Promise<boolean>
  onRemoveMember: (userId: string) => Promise<boolean>
  onChangeRole: (userId: string, role: TeamRole) => void
}

export function TeamDetail({ team, onBack, onUpdateTeam, onDeleteTeam, onAddMember, onRemoveMember, onChangeRole }: TeamDetailProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const currentUserId = user?.id || ''
  const isAdmin = team.members.some(m => m.userId === currentUserId && m.role === 'admin')

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400" />
            <h2 className="text-lg font-semibold text-foreground">{team.name}</h2>
          </div>
          {team.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{team.description}</p>
          )}
        </div>
        {isAdmin && (
          <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={() => setShowDeleteConfirm(true)}>
            {t('teams.deleteTeam')}
          </Button>
        )}
      </div>

      <div className="space-y-6">
        <div className="rounded-lg bg-secondary/20 p-4">
          <TeamMemberManager
            members={team.members}
            currentUserId={currentUserId}
            onAddMember={onAddMember}
            onRemoveMember={onRemoveMember}
            onChangeRole={onChangeRole}
          />
        </div>

        <div className="rounded-lg bg-secondary/20 p-4">
          <TeamAccessGrants
            teamName={team.name}
            teamId={team.id}
            grants={[
              { cluster: 'prod-east', namespace: 'default', role: 'admin', isClusterScoped: false },
              { cluster: 'staging', role: 'view', isClusterScoped: true },
            ]}
            onGrantChanged={() => {}}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => { setShowDeleteConfirm(false); onDeleteTeam() }}
        title={t('teams.deleteTeamTitle')}
        message={t('teams.deleteTeamMessage')}
        confirmLabel={t('teams.deleteTeam')}
        cancelLabel={t('common.cancel')}
        variant="danger"
      />
    </div>
  )
}
