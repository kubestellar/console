import { CheckCircle2, ExternalLink } from 'lucide-react'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { LinkedInShareButton } from './FeedbackModal.RatingSelector'

interface FeedbackSuccessPanelProps {
  type: 'bug' | 'feature'
  coins: number
  success: { issueUrl?: string; screenshotsUploaded?: number; screenshotsFailed?: number }
  screenshotCount: number
  appShortName: string
  onShare: () => void
}

export function FeedbackSuccessPanel({ type, coins, success, screenshotCount, appShortName, onShare }: FeedbackSuccessPanelProps) {
  return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-400" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">Thank you!</h3>
      <p className="text-sm text-muted-foreground mb-2">
        Your {type === 'bug' ? 'bug report' : 'feature suggestion'} has been created as a GitHub issue.
      </p>
      <p className="text-sm text-yellow-400 mb-4">+{coins} coins earned!</p>

      {success.issueUrl && (
        <a
          href={sanitizeUrl(success.issueUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-sm font-medium transition-colors mb-4"
        >
          <ExternalLink className="w-4 h-4" />
          View issue on GitHub
        </a>
      )}

      {screenshotCount > 0 && (success.screenshotsUploaded ?? 0) > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-xs text-green-400 font-medium">
            {(success.screenshotsUploaded ?? 0) === 1
              ? 'Screenshot attached to the issue. It will render as an image shortly.'
              : `${success.screenshotsUploaded} screenshots attached to the issue. They will render as images shortly.`}
          </p>
        </div>
      )}
      {screenshotCount > 0 && (success.screenshotsFailed ?? 0) > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400 font-medium">
            {success.screenshotsFailed === 1
              ? 'Screenshot could not be attached — invalid image format.'
              : `${success.screenshotsFailed} screenshots could not be attached — invalid image format.`}
          </p>
        </div>
      )}

      <div className="pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground mb-3">Love {appShortName}? Share it with your network!</p>
        <LinkedInShareButton onShare={onShare} />
      </div>
    </div>
  )
}
