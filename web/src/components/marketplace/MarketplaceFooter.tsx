import { ExternalLink, HandHelping, Heart } from 'lucide-react'
import {
  CONTRIBUTE_URL,
  ISSUES_URL,
} from './MarketplaceConstants'

export function MarketplaceFooter({ helpWantedCount }: { helpWantedCount: number }) {
  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-lg px-5 py-4">
      <div className="flex items-center gap-3">
        <Heart className="w-5 h-5 text-purple-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {helpWantedCount > 0 ? 'Help build CNCF ecosystem coverage' : 'Share with the community'}
          </p>
          <p className="text-xs text-muted-foreground">
            {helpWantedCount > 0
              ? `${helpWantedCount} projects need card implementations. Pick one, follow the tutorial, open a PR.`
              : 'Contribute dashboards, card presets, or themes — just open a PR with your JSON file.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {helpWantedCount > 0 && (
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-md transition-colors"
          >
            <HandHelping className="w-3 h-3" />
            Browse Issues
          </a>
        )}
        <a
          href={CONTRIBUTE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Contribute
        </a>
      </div>
    </div>
  )
}
