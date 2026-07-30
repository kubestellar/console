import { useTranslation } from 'react-i18next'
import { Save } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { Input } from '../../ui/Input'

interface SaveFilterSectionProps {
  showSaveForm: boolean
  saveNameInputId: string
  newName: string
  setNewName: (name: string) => void
  newColor: string
  setNewColor: (color: string) => void
  handleSave: () => void
  closeSaveForm: () => void
  openSaveForm: () => void
  isFiltered: boolean
  colors: string[]
}

export function SaveFilterSection({
  showSaveForm,
  saveNameInputId,
  newName,
  setNewName,
  newColor,
  setNewColor,
  handleSave,
  closeSaveForm,
  openSaveForm,
  isFiltered,
  colors,
}: SaveFilterSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="p-3">
      {showSaveForm ? (
        <div className="space-y-2 p-2 bg-secondary/20 rounded">
          <Input
            id={saveNameInputId}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('common:filters.filterSetName', 'Filter set name...')}
            className="bg-secondary/50"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t('common:filters.color', 'Color:')}
            </span>
            {colors.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                aria-label={t('common:filters.colorOption', { defaultValue: `Select color ${c}`, color: c })}
                aria-pressed={newColor === c}
                className={cn(
                  'w-5 h-5 rounded-full border-2 transition-all',
                  newColor === c ? 'border-foreground scale-110' : 'border-transparent',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={!newName.trim()}
              className="flex-1 px-2 py-1 text-xs font-medium bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common:filters.save', 'Save')}
            </button>
            <button
              onClick={() => { closeSaveForm(); setNewName('') }}
              className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('common:filters.cancel', 'Cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => openSaveForm()}
          disabled={!isFiltered}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={t('common:filters.saveCurrentFilters', 'Save Current Filters')}
        >
          <Save className="w-3 h-3" />
          {t('common:filters.saveCurrentFilters', 'Save Current Filters')}
        </button>
      )}
    </div>
  )
}
