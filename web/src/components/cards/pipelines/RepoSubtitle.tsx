/**
 * RepoSubtitle — consistent org/repo display used by all GitHub-powered cards.
 * Shows a small fork icon + truncated repo name as a subtitle line.
 */
import { GitFork } from 'lucide-react'

export function RepoSubtitle({ repo }: { repo: string | null }) {
  if (!repo) return null
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <GitFork size={10} className="shrink-0" />
      <span className="truncate">{repo}</span>
    </div>
  )
}
