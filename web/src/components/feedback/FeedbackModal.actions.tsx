import { Lightbulb } from 'lucide-react'
import { Linkedin } from '@/lib/icons'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { emitLinkedInShare } from '../../lib/analytics'
import { useBranding } from '../../hooks/useBranding'
import { REWARD_ACTIONS } from '../../hooks/useRewards'

export function FeedbackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 flex items-center gap-2 px-4 py-2.5 rounded-full bg-purple-500 hover:bg-purple-600 text-white shadow-lg transition-all hover:scale-105 z-sticky"
      title="Submit feedback"
    >
      <Lightbulb className="w-4 h-4" />
      <span className="text-sm font-medium">Feedback</span>
    </button>
  )
}

export function LinkedInShareButton({ onShare, compact = false }: { onShare?: () => void; compact?: boolean }) {
  const { t } = useTranslation()
  const { websiteUrl } = useBranding()
  const handleShare = () => {
    const shareTarget = websiteUrl || 'https://kubestellar.io'
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareTarget)}`
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer,width=600,height=600')
    emitLinkedInShare('feedback_modal')
    onShare?.()
  }

  if (compact) {
    return (
      <button
        onClick={handleShare}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-linkedin/20 hover:bg-linkedin/30 text-linkedin transition-colors"
        title="Share on LinkedIn"
      >
        <Linkedin className="w-4 h-4" />
        <span>{t('feedback.share')}</span>
        <StatusBadge color="yellow">+{REWARD_ACTIONS.linkedin_share.coins}</StatusBadge>
      </button>
    )
  }

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-linkedin hover:bg-linkedin-dark text-white font-medium transition-colors"
    >
      <Linkedin className="w-4 h-4" />
      <span>{t('feedback.shareOnLinkedIn')}</span>
      <span className="text-xs px-1.5 py-0.5 rounded bg-foreground/20 text-foreground">
        +{REWARD_ACTIONS.linkedin_share.coins}
      </span>
    </button>
  )
}
