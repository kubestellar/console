import { Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface MissionSidebarNewMissionProps {
  isMobile: boolean
  newMissionPrompt: string
  newMissionInputRef: React.RefObject<HTMLTextAreaElement>
  onPromptChange: (value: string) => void
  onStartMission: () => void
  onCancel: () => void
}

export function MissionSidebarNewMission({
  isMobile,
  newMissionPrompt,
  newMissionInputRef,
  onPromptChange,
  onStartMission,
  onCancel,
}: MissionSidebarNewMissionProps) {
  const { t } = useTranslation(['common'])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newMissionPrompt.trim()) {
      onStartMission()
    }
  }

  return (
    <div className="p-3 border-b border-border bg-secondary/30">
      <div className="flex flex-col gap-2">
        <textarea
          ref={newMissionInputRef}
          value={newMissionPrompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={t('missionSidebar.newMissionPlaceholder')}
          className="w-full min-h-[80px] p-2 text-sm bg-background border border-border rounded-lg resize-none focus:outline-hidden focus:ring-2 focus:ring-primary/50"
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center justify-between">
          <span className="text-2xs text-muted-foreground">
            {isMobile ? t('missionSidebar.tapSend') : t('missionSidebar.cmdEnterSubmit')}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('missionSidebar.cancel')}
            </button>
            <button
              onClick={onStartMission}
              disabled={!newMissionPrompt.trim()}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-3 h-3" />
              {t('missionSidebar.start')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
