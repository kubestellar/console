import { Bell, ExternalLink, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import type { ScreenshotItem, SuccessState } from './FeatureRequestTypes'

export interface SuccessViewProps {
  success: SuccessState
  screenshots: ScreenshotItem[]
  onViewUpdates: () => void
}

export function SuccessView({ success, screenshots, onViewUpdates }: SuccessViewProps) {
  const { t } = useTranslation()
  return (
    <div className="p-6 text-center flex-1 overflow-y-auto min-h-0">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-green-400" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        {t('feedback.requestSubmitted')}
      </h3>
      <p className="text-sm text-muted-foreground mb-2">
        Your request has been submitted for review.
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Once a maintainer accepts triage, check the Activity tab for updates — our AI will start working on a fix.
      </p>
      <div className="flex items-center justify-center gap-3">
        {success.issueUrl && (
          <a
            href={sanitizeUrl(success.issueUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
          >
            View on GitHub
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <button
          onClick={onViewUpdates}
          className="inline-flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
        >
          <Bell className="w-3 h-3" />
          View Updates
        </button>
      </div>

      {/* Attachment status */}
      {screenshots.length > 0 && (success.screenshotsUploaded ?? 0) > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-xs text-green-400 font-medium">
            {(success.screenshotsUploaded ?? 0) === 1
              ? 'Attachment uploaded to the issue successfully.'
              : `${success.screenshotsUploaded} attachments uploaded to the issue successfully.`}
          </p>
        </div>
      )}
      {screenshots.length > 0 && (success.screenshotsFailed ?? 0) > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400 font-medium">
            {success.screenshotsFailed === 1
              ? 'Attachment could not be uploaded — unsupported format or too large.'
              : `${success.screenshotsFailed} attachments could not be uploaded — unsupported format or too large.`}
          </p>
        </div>
      )}
      {success.warning && (
        <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400 font-medium">{success.warning}</p>
        </div>
      )}
    </div>
  )
}
