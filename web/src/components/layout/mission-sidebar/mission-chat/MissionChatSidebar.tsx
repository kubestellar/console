import { CheckCircle, MessageSquare, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Mission } from '../../../../hooks/useMissions'
import { cn } from '../../../../lib/cn'
import { STATUS_CONFIG } from '../types'
import type { ConversationSummary } from './missionChatUtils'

interface MissionChatSidebarProps {
  conversationSummary: ConversationSummary
  mission: Mission
  originalAsk: string
}

export function MissionChatSidebar({ conversationSummary, mission, originalAsk }: MissionChatSidebarProps) {
  const { t } = useTranslation('common')
  const statusConfig = STATUS_CONFIG[mission.status] || STATUS_CONFIG.pending

  return (
    <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto scroll-enhanced">
      <div className="bg-card border border-border rounded-lg p-4">
        <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Original Request
        </h4>
        <p className="text-sm text-muted-foreground leading-relaxed">{originalAsk}</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          Summary
        </h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('common.status')}</span>
            <span className={cn('font-medium', statusConfig.color)}>{statusConfig.label}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Exchanges</span>
            <span className="text-foreground">{conversationSummary.exchanges}</span>
          </div>

          {conversationSummary.hasToolExecution && (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{t('layout.missionSidebar.commandsExecuted')}</span>
            </div>
          )}

          {conversationSummary.keyPoints.length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Key Points</span>
              <ul className="mt-2 space-y-1">
                {conversationSummary.keyPoints.map((point, index) => (
                  <li key={index} className="text-xs text-foreground flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">&bull;</span>
                    <span className="line-clamp-2">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-2xs text-muted-foreground/70 pt-2 border-t border-border/50">
            Last updated: {conversationSummary.lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h4 className="text-sm font-semibold text-foreground mb-3">Mission Details</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('common.type')}</span>
            <span className="text-foreground capitalize">{mission.type}</span>
          </div>
          {mission.cluster && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('common.cluster')}</span>
              <span className="text-purple-400">{mission.cluster}</span>
            </div>
          )}
          {mission.agent && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Agent</span>
              <span className="text-foreground">{mission.agent}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Started</span>
            <span className="text-foreground text-xs">{mission.createdAt.toLocaleString()}</span>
          </div>
          {mission.tokenUsage && mission.tokenUsage.total > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tokens</span>
              <span className="text-foreground font-mono text-xs">{mission.tokenUsage.total.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
