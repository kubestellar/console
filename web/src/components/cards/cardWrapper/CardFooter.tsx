import { InstallCTAFlow } from '../card-wrapper/InstallCTAFlow'
import { PendingSwapNotification } from '../card-wrapper/PendingSwapNotification'

interface PendingSwap {
  newType: string
  newTitle?: string
  reason: string
  swapAt: Date
}

interface CardFooterProps {
  isCollapsed: boolean
  showInstallCta: boolean
  cardType: string
  title: string
  pendingSwap?: PendingSwap
  newTitle: string
  onSnooze: (durationMs?: number) => void
  onSwapNow: () => void
  onSwapCancel?: () => void
  defaultSnoozeDurationMs: number
  showSummary: boolean
  lastSummary?: string
  sinceFocusLabel: string
}

export function CardFooter({
  isCollapsed,
  showInstallCta,
  cardType,
  title,
  pendingSwap,
  newTitle,
  onSnooze,
  onSwapNow,
  onSwapCancel,
  defaultSnoozeDurationMs,
  showSummary,
  lastSummary,
  sinceFocusLabel,
}: CardFooterProps) {
  return (
    <>
      {!isCollapsed && showInstallCta && (
        <div className="shrink-0 px-4 pb-2">
          <InstallCTAFlow cardType={cardType} title={title} />
        </div>
      )}

      {!isCollapsed && pendingSwap && (
        <PendingSwapNotification
          pendingSwap={pendingSwap}
          newTitle={newTitle}
          onSnooze={onSnooze}
          onSwapNow={onSwapNow}
          onCancel={() => onSwapCancel?.()}
          defaultSnoozeDurationMs={defaultSnoozeDurationMs}
        />
      )}

      {showSummary && lastSummary && (
        <div className="absolute bottom-full left-0 right-0 mb-2 mx-4 p-3 glass rounded-lg text-sm animate-fade-in-up">
          <p className="text-xs text-muted-foreground mb-1">{sinceFocusLabel}</p>
          <p className="text-foreground">{lastSummary}</p>
        </div>
      )}
    </>
  )
}
