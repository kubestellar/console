import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCommitHorizontal, ChevronUp, ChevronDown } from 'lucide-react'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../lib/constants/time'

const DAYS_PER_WEEK = 7
const MS_PER_WEEK = MS_PER_DAY * DAYS_PER_WEEK

function formatCommitDate(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m ago`
  if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)}h ago`
  if (diff < MS_PER_WEEK) return `${Math.floor(diff / MS_PER_DAY)}d ago`
  return date.toLocaleDateString()
}

interface Commit {
  sha: string
  message: string
  author: string
  date: string
}

export function UpdateCommitList({ commits }: { commits: Commit[] }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mb-4 rounded-lg bg-secondary/30 border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <GitCommitHorizontal className="w-4 h-4 text-orange-400" />
          <span className="font-medium text-foreground">
            {t('settings.updates.recentCommits', { count: commits.length })}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t border-border max-h-64 overflow-y-auto">
          {commits.map((commit) => {
            const prMatch = commit.message.match(/\(#(\d+)\)/)
            const url = prMatch
              ? `https://github.com/kubestellar/console/pull/${prMatch[1]}`
              : `https://github.com/kubestellar/console/commit/${commit.sha}`
            return (
              <a
                key={commit.sha}
                href={sanitizeUrl(url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-2 border-b border-border/50 last:border-b-0 hover:bg-secondary/30 cursor-pointer no-underline"
              >
                <code className="text-xs font-mono text-orange-400 shrink-0 pt-0.5">{commit.sha.slice(0, 7)}</code>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{commit.message}</p>
                  <p className="text-xs text-muted-foreground">{commit.author} &middot; {formatCommitDate(commit.date)}</p>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
