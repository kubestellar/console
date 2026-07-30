import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { LazyMarkdown as ReactMarkdown } from '../../ui/LazyMarkdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
import { formatTimeAgo } from '../../../lib/formatters'
import { cn } from '../../../lib/cn'
import type { Components } from 'react-markdown'

interface Release {
  tag: string
  publishedAt: Date
  releaseNotes?: string
}

interface PreviousReleasesProps {
  releases: Release[]
  markdownComponents: Components
}

export function PreviousReleases({ releases, markdownComponents }: PreviousReleasesProps) {
  const [showPreviousReleases, setShowPreviousReleases] = useState(false)
  const [expandedRelease, setExpandedRelease] = useState<string | null>(null)

  if (releases.length === 0) return null

  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setShowPreviousReleases(!showPreviousReleases)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        <ChevronDown className={cn('w-4 h-4 transition-transform', showPreviousReleases && 'rotate-180')} />
        Previous releases ({releases.length} versions)
      </button>
      {showPreviousReleases && (
        <div className="mt-3 space-y-2">
          {releases.map(release => (
            <div key={release.tag} className="border border-border rounded-lg">
              <button
                type="button"
                onClick={() => setExpandedRelease(expandedRelease === release.tag ? null : release.tag)}
                className="flex items-center justify-between w-full px-3 py-2 text-left text-sm hover:bg-secondary/50 transition-colors rounded-lg"
              >
                <span className="font-medium text-foreground">{release.tag}</span>
                <span className="text-xs text-muted-foreground">{formatTimeAgo(release.publishedAt)}</span>
              </button>
              {expandedRelease === release.tag && release.releaseNotes && (
                <div className="px-3 pb-3 prose dark:prose-invert max-w-none text-xs overflow-x-auto wrap-break-word [word-break:break-word]">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
                    {release.releaseNotes}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
