import { useState } from 'react'
import { Plus, Users, ChevronRight } from 'lucide-react'
import { Button } from '../ui/Button'
import { BaseModal } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import type { Team } from '../../types/teams'

interface TeamListProps {
  teams: Team[]
  isLoading: boolean
  onCreateTeam: (name: string, description: string) => void
  onSelectTeam: (id: string) => void
}

export function TeamList({ teams, isLoading, onCreateTeam, onSelectTeam }: TeamListProps) {
  const { t } = useTranslation()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleCreate = () => {
    if (!name.trim()) return
    onCreateTeam(name.trim(), description.trim())
    setName('')
    setDescription('')
    setShowCreate(false)
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-lg bg-secondary/30 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          {teams.length} {t('teams.teams')}
        </h2>
        <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setShowCreate(true)}>
          {t('teams.createTeam')}
        </Button>
      </div>

      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">{t('teams.noTeams')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => onSelectTeam(team.id)}
              className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors text-left group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground font-medium">{team.name}</p>
                  {team.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                      {team.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <BaseModal isOpen={true} onClose={() => setShowCreate(false)} size="sm">
          <BaseModal.Header
            title={t('teams.createTeam')}
            onClose={() => setShowCreate(false)}
          />
          <BaseModal.Content>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  {t('teams.teamName')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('teams.teamNamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  {t('teams.description')}
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={t('teams.descriptionPlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 resize-none"
                />
              </div>
            </div>
          </BaseModal.Content>
          <BaseModal.Footer>
            <div className="flex-1" />
            <div className="flex gap-3">
              <Button variant="ghost" size="lg" onClick={() => setShowCreate(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" size="lg" onClick={handleCreate} disabled={!name.trim()}>
                {t('teams.createTeam')}
              </Button>
            </div>
          </BaseModal.Footer>
        </BaseModal>
      )}
    </div>
  )
}
