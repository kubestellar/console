import { ExternalLink, Eye, Loader2 } from 'lucide-react'
import type { FeatureRequest } from '../../hooks/useFeatureRequests'
import { PREVIEW_WARMUP_SECONDS, type PreviewResult } from './FeatureRequestTypes'
import { isValidPreviewUrl } from '../../lib/utils/isValidPreviewUrl'
import { MS_PER_SECOND } from '../../lib/constants/time'

export function PreviewSection({
  request,
  previewChecking,
  previewResults,
  onCheckPreview,
}: {
  request: FeatureRequest
  previewChecking: number | null
  previewResults: Record<number, PreviewResult>
  onCheckPreview: (prNumber: number) => Promise<void>
}) {
  const checkedPreview = request.pr_number ? previewResults[request.pr_number] : null
  const previewUrl = request.netlify_preview_url || (checkedPreview?.status === 'ready' ? checkedPreview.preview_url : null)
  const safePreviewUrl = isValidPreviewUrl(previewUrl) ? previewUrl : null
  const isCheckingThis = previewChecking === request.pr_number
  const readyAt = checkedPreview?.ready_at ? new Date(checkedPreview.ready_at) : null
  const secondsSinceReady = readyAt ? (Date.now() - readyAt.getTime()) / MS_PER_SECOND : Infinity
  const isWarmingUp = secondsSinceReady < PREVIEW_WARMUP_SECONDS

  if (safePreviewUrl && request.status === 'fix_ready') {
    if (isWarmingUp) {
      const secondsLeft = Math.ceil(PREVIEW_WARMUP_SECONDS - secondsSinceReady)
      return (
        <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
            <span className="text-xs text-yellow-400 font-medium">Preview warming up... ({secondsLeft}s)</span>
          </div>
        </div>
      )
    }

    return (
      <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400 font-medium">Preview Available</span>
          </div>
          <button
            onClick={(event) => {
              event.stopPropagation()
              if (isValidPreviewUrl(safePreviewUrl)) {
                window.open(safePreviewUrl, '_blank', 'noopener,noreferrer')
              }
            }}
            className="px-2 py-1 text-xs rounded bg-green-500 hover:bg-green-600 text-white transition-colors flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Try It
          </button>
        </div>
      </div>
    )
  }

  if (safePreviewUrl) {
    return (
      <button
        onClick={(event) => {
          event.stopPropagation()
          if (isValidPreviewUrl(safePreviewUrl)) {
            window.open(safePreviewUrl, '_blank', 'noopener,noreferrer')
          }
        }}
        className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mt-1 bg-transparent border-0 p-0 cursor-pointer"
      >
        <Eye className="w-3 h-3" />
        Preview
      </button>
    )
  }

  if (request.pr_number && request.status === 'fix_ready') {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={(event) => {
            event.stopPropagation()
            void onCheckPreview(request.pr_number!)
          }}
          disabled={isCheckingThis}
          className="text-xs text-muted-foreground hover:text-green-400 flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          {isCheckingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
          Check Preview
        </button>
        {checkedPreview && checkedPreview.status !== 'ready' && (
          <span className="text-2xs text-muted-foreground">
            {checkedPreview.status === 'pending' ? 'Building...' : checkedPreview.message || checkedPreview.status}
          </span>
        )}
      </div>
    )
  }

  return null
}
