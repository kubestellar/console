import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TeamList } from '../components/teams/TeamList'
import { TeamDetail } from '../components/teams/TeamDetail'
import { useTeams, useTeamDetail } from '../hooks/useTeams'
import { useToast } from '../components/ui/Toast'
import type { TeamRole } from '../types/teams'

export function TeamManagementPage() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const { teams, isLoading, createTeam, deleteTeam } = useTeams()
  const { team, addMember, removeMember } = useTeamDetail(selectedTeamId)

  const handleCreate = async (name: string, description: string) => {
    await createTeam({ name, description })
  }

  const handleDelete = async () => {
    if (selectedTeamId) {
      const success = await deleteTeam(selectedTeamId)
      if (success) {
        showToast(t('teams.teamDeleted'), 'success')
      } else {
        showToast(t('teams.teamDeleteError'), 'error')
      }
      setSelectedTeamId(null)
    }
  }

  const handleChangeRole = async (_userId: string, _role: TeamRole) => {
  }

  if (selectedTeamId && team) {
    return (
      <div className="min-h-full p-6">
        <div className="min-h-full rounded-xl border border-border/50 bg-card/50 p-4">
          <TeamDetail
            team={team}
            onBack={() => setSelectedTeamId(null)}
            onUpdateTeam={() => {}}
            onDeleteTeam={handleDelete}
            onAddMember={addMember}
            onRemoveMember={removeMember}
            onChangeRole={handleChangeRole}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full p-6">
      <div className="min-h-full rounded-xl border border-border/50 bg-card/50 p-4">
        <TeamList
          teams={teams}
          isLoading={isLoading}
          onCreateTeam={handleCreate}
          onSelectTeam={setSelectedTeamId}
        />
      </div>
    </div>
  )
}
