import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ROUTES } from '../../config/routes'
import { STORAGE_KEY_STELLAR_ATTENTION_DISMISSED } from '../../lib/constants/storage'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'

// Fixed "Try Stellar AI!" entry point in the dashboard header controls row.
// Replaces the floating attention bubble that hovered over the dashboard
// controls (unthemed and animated indefinitely). Hidden once the user has
// interacted with Stellar — shares the dismissal flag with the Stellar rail,
// so either entry point dismisses the nudge everywhere.
export function TryStellarButton() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(
    () => !!safeGetItem(STORAGE_KEY_STELLAR_ATTENTION_DISMISSED)
  )

  if (dismissed) return null

  const handleClick = () => {
    safeSetItem(STORAGE_KEY_STELLAR_ATTENTION_DISMISSED, 'true')
    setDismissed(true)
    navigate(ROUTES.STELLAR)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="try-stellar-button"
      className="animate-stellar-nudge flex shrink-0 items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/15 px-3 py-1.5 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-500/25 hover:text-purple-200"
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      {t('stellar.attentionBubble')}
    </button>
  )
}
