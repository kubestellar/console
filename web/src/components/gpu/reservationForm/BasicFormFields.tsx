import { useTranslation } from 'react-i18next'

interface BasicFormFieldsProps {
  title: string
  onTitleChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  notes: string
  onNotesChange: (value: string) => void
  user: { github_login: string; email?: string } | null
}

export function BasicFormFields({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  notes,
  onNotesChange,
  user,
}: BasicFormFieldsProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <>
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          {t('gpuReservations.form.fields.titleLabel')}
        </label>
        <input
          type="text"
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder={t('gpuReservations.form.fields.titlePlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* User info (read-only from auth) */}
      {user && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t('gpuReservations.form.fields.userName')}
            </label>
            <input
              type="text"
              value={user.email || user.github_login}
              readOnly
              className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t('gpuReservations.form.fields.githubHandle')}
            </label>
            <input
              type="text"
              value={user.github_login}
              readOnly
              className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground"
            />
          </div>
        </div>
      )}

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          {t('common:common.description')}
        </label>
        <textarea
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          rows={2}
          placeholder={t('gpuReservations.form.fields.descriptionPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          {t('gpuReservations.form.fields.notesLabel')}
        </label>
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          rows={2}
          placeholder={t('gpuReservations.form.fields.notesPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>
    </>
  )
}
