import { Loader2 } from 'lucide-react'
import { LazyMarkdown as ReactMarkdown } from '../../ui/LazyMarkdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
import { formatTimeAgo } from '../../../lib/formatters'
import { useTranslation } from 'react-i18next'
import type { Components } from 'react-markdown'
import type { RecentPR } from './useRecentPRs'

interface ReleaseNotesContentProps {
  hasReleaseNotes: boolean
  releaseNotes: string | undefined
  recentPRs: RecentPR[]
  prsLoading: boolean
  prsError: string | null
  markdownComponents: Components
}

export function ReleaseNotesContent({
  hasReleaseNotes,
  releaseNotes,
  recentPRs,
  prsLoading,
  prsError,
  markdownComponents,
}: ReleaseNotesContentProps) {
  const { t } = useTranslation()

  if (hasReleaseNotes) {
    return (
      <div className="prose dark:prose-invert max-w-none text-sm overflow-x-auto wrap-break-word [word-break:break-word] prose-pre:my-5 prose-pre:bg-transparent prose-pre:p-0 prose-code:text-purple-700 dark:prose-code:text-purple-300 prose-code:bg-black/5 dark:prose-code:bg-black/20 prose-code:px-1 prose-code:rounded">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[rehypeSanitize]}
          components={markdownComponents}
        >
          {releaseNotes ?? ''}
        </ReactMarkdown>
      </div>
    )
  }

  if (prsLoading) {
    // Auto-QA #9036 — loading state for the PR fallback fetch
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t('updates.loadingRecentPullRequests')}</span>
      </div>
    )
  }

  if (prsError) {
    // Auto-QA #9036 — error state replaces the old silent failure
    return (
      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
        Couldn&apos;t load recent pull requests: {prsError}
      </div>
    )
  }

  if (recentPRs.length > 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground mb-2">
          Recently merged pull requests:
        </p>
        {recentPRs.map((pr) => (
          <a
            key={pr.number}
            href={`https://github.com/kubestellar/console/pull/${pr.number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 transition-colors group"
          >
            <span className="text-xs text-muted-foreground font-mono shrink-0">#{pr.number}</span>
            <span className="text-sm text-foreground group-hover:text-primary transition-colors">{pr.title}</span>
            <span className="text-xs text-muted-foreground ml-auto shrink-0">
              {formatTimeAgo(new Date(pr.merged_at))}
            </span>
          </a>
        ))}
      </div>
    )
  }

  return (
    <div className="prose dark:prose-invert max-w-none text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
        {'*No release notes available. Pull the latest commits to update.*'}
      </ReactMarkdown>
    </div>
  )
}
