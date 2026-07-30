import { useTranslation } from 'react-i18next'

interface PendingChangesPanelProps {
  pendingChanges: string[]
  onApply: () => void
  onReject: () => void
}

export function PendingChangesPanel({ pendingChanges, onApply, onReject }: PendingChangesPanelProps) {
  const { t } = useTranslation(['common', 'cards'])

  return (
    <div className="mb-4 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
      <p className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2">
        {t('sidebar.customizer.proposedChanges')}
      </p>
      <ul className="space-y-1 mb-3">
        {pendingChanges.map((change, index) => (
          <li key={index} className="text-xs text-foreground">{change}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          onClick={onApply}
          className="px-3 py-1.5 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg text-xs font-medium transition-colors"
        >
          {t('sidebar.customizer.applyChanges')}
        </button>
        <button
          onClick={onReject}
          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          {t('sidebar.customizer.cancel')}
        </button>
      </div>
    </div>
  )
}
