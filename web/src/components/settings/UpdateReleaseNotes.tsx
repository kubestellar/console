import { useTranslation } from 'react-i18next'
import { ChevronUp, ChevronDown, ExternalLink } from 'lucide-react'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'

interface LatestRelease {
  tag: string
  url: string
  releaseNotes?: string
}

interface ReleaseNotesToggle {
  isOpen: boolean
  toggle: () => void
}

interface UpdateReleaseNotesProps {
  latestRelease: LatestRelease
  releaseNotes: ReleaseNotesToggle
}

export function UpdateReleaseNotes({ latestRelease, releaseNotes }: UpdateReleaseNotesProps) {
  const { t } = useTranslation()

  if (!latestRelease.releaseNotes) return null

  return (
    <div className="mb-4">
      <button
        onClick={releaseNotes.toggle}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        {releaseNotes.isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {t('settings.updates.releaseNotes')}
      </button>
      {releaseNotes.isOpen && (
        <div className="mt-2 p-4 rounded-lg bg-secondary/30 border border-border">
          <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">{latestRelease.releaseNotes}</pre>
          <a
            href={sanitizeUrl(latestRelease.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-3 text-sm text-primary hover:underline"
          >
            {t('settings.updates.viewOnGithub')}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  )
}
