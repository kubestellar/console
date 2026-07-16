import { useState } from 'react'
import { Download, Clock, SkipForward, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MS_PER_HOUR, MS_PER_DAY } from '../../../lib/constants/time'

const SNOOZE_DURATION_1H_MS = MS_PER_HOUR
const SNOOZE_DURATION_1D_MS = MS_PER_DAY
const SNOOZE_DURATION_1W_MS = 7 * MS_PER_DAY

interface WhatsNewFooterProps {
  updating: boolean
  onSnooze: (durationMs: number, label: string) => void
  onSkip: () => void
  onUpdate: () => void
  onClose: () => void
}

export function WhatsNewFooter({ updating, onSnooze, onSkip, onUpdate, onClose }: WhatsNewFooterProps) {
  const { t } = useTranslation()
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)

  const handleSnooze = (durationMs: number, label: string) => {
    setShowSnoozeMenu(false)
    onSnooze(durationMs, label)
  }

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Skip this version
        </button>

        {/* Remind me later dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Clock className="w-3.5 h-3.5" />
            Remind me later
            <ChevronDown className="w-3 h-3" />
          </button>
          {showSnoozeMenu && (
            <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-lg shadow-xl z-50 py-1 min-w-[160px]">
              <button
                type="button"
                onClick={() => handleSnooze(SNOOZE_DURATION_1H_MS, '1h')}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary transition-colors"
              >
                In 1 hour
              </button>
              <button
                type="button"
                onClick={() => handleSnooze(SNOOZE_DURATION_1D_MS, '1d')}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary transition-colors"
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => handleSnooze(SNOOZE_DURATION_1W_MS, '1w')}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary transition-colors"
              >
                Next week
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Later
        </button>
        <button
          type="button"
          onClick={onUpdate}
          disabled={updating}
          className="px-4 py-1.5 text-sm font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {updating ? (
            <>{t('status.updatingEllipsis')}</>
          ) : (
            <>
              <Download className="w-4 h-4" />
              {t('updates.updateNow')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
