import type { ReactNode } from 'react'
import type { PendingAction } from './EventCard'
import type { StellarNotification } from '../../types/stellar'
import { TextArea } from '../ui/TextArea'

const CONFIRMATION_TEXTAREA_ROWS = 4

interface ActionButtonsProps {
  view: 'overview' | 'investigate'
  confirmAction: 'resolve' | 'dismiss' | null
  isSubmitting: boolean
  dismissalReason: string
  setDismissalReason: (value: string) => void
  solveStatus?: { color: string; label: string } | null
  liveNotification: StellarNotification
  resourceName: string
  buildInvestigatePrompt: (notification: StellarNotification) => string
  onAction?: (prompt: string, action?: PendingAction) => void
  onSetView: (value: 'overview' | 'investigate') => void
  onSetConfirmAction: (value: 'resolve' | 'dismiss' | null) => void
  onResolve: () => void
  onDismiss: () => void
  onCopyDetails: () => void
  onMarkInvestigating: () => void
}

export function ActionButtons({
  view,
  confirmAction,
  isSubmitting,
  dismissalReason,
  setDismissalReason,
  solveStatus,
  liveNotification,
  resourceName,
  buildInvestigatePrompt,
  onAction,
  onSetView,
  onSetConfirmAction,
  onResolve,
  onDismiss,
  onCopyDetails,
  onMarkInvestigating,
}: ActionButtonsProps) {
  return (
    <>
      {confirmAction === 'resolve' && (
        <ConfirmationPanel
          title="Start AI mission"
          description="This will trigger an AI mission to autonomously fix this event."
          value=""
          onChange={() => {}}
          placeholder=""
          onCancel={() => onSetConfirmAction(null)}
          onConfirm={onResolve}
          confirmLabel="Start Mission"
          isSubmitting={isSubmitting}
        />
      )}
      {confirmAction === 'dismiss' && (
        <ConfirmationPanel
          title="Confirm removal"
          description="This event will be removed from the escalated list."
          value={dismissalReason}
          onChange={setDismissalReason}
          placeholder="Dismissal reason (optional)"
          onCancel={() => onSetConfirmAction(null)}
          onConfirm={onDismiss}
          confirmLabel="Remove"
          isSubmitting={isSubmitting}
        />
      )}

      {confirmAction === null && view === 'overview' && (
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => onSetView('investigate')} color="var(--s-info)">Investigate</ActionButton>
          <ActionButton onClick={() => onSetConfirmAction('resolve')} color="var(--s-success)">Solve</ActionButton>
          <ActionButton onClick={() => onSetConfirmAction('dismiss')} color="var(--s-critical)">Remove</ActionButton>
        </div>
      )}

      {confirmAction === null && view === 'investigate' && (
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => onSetView('overview')} color="var(--s-text-muted)">Back</ActionButton>
          <ActionButton onClick={onCopyDetails} color="var(--s-text-muted)">Copy Details</ActionButton>
          {onAction && (
            <ActionButton
              onClick={() => onAction(buildInvestigatePrompt(liveNotification), {
                prompt: buildInvestigatePrompt(liveNotification),
                actionType: 'investigate',
                cluster: liveNotification.cluster || '',
                namespace: liveNotification.namespace || '',
                name: resourceName,
              })}
              color="var(--s-warning)"
            >
              Open in Chat
            </ActionButton>
          )}
          <ActionButton onClick={onMarkInvestigating} color="var(--s-info)" disabled={isSubmitting}>
            Mark as Investigating
          </ActionButton>
        </div>
      )}

      {solveStatus && view === 'overview' && confirmAction === null && (
        <div className="mt-3 text-xs text-[var(--s-text-muted)]">
          Stellar status: <span style={{ color: solveStatus.color }}>{solveStatus.label}</span>
        </div>
      )}
    </>
  )
}

function ActionButton({ children, color, disabled = false, onClick }: { children: ReactNode; color: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${color}`,
        color,
        background: 'var(--s-surface-2)',
        borderRadius: 8,
        opacity: disabled ? 0.5 : 1,
      }}
      className="px-3 py-1.5 text-sm font-medium"
    >
      {children}
    </button>
  )
}

function ConfirmationPanel({
  title,
  description,
  value,
  onChange,
  placeholder,
  onCancel,
  onConfirm,
  confirmLabel,
  isSubmitting,
}: {
  title: string
  description: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  isSubmitting: boolean
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm text-[var(--s-text-muted)]">{description}</div>
      </div>
      <TextArea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={CONFIRMATION_TEXTAREA_ROWS}
        className="rounded border-[var(--s-border)] bg-[var(--s-surface)] text-[var(--s-text)]"
        placeholder={placeholder}
      />
      <div className="flex flex-wrap gap-2">
        <ActionButton onClick={onCancel} color="var(--s-text-muted)">Cancel</ActionButton>
        <ActionButton onClick={onConfirm} color="var(--s-warning)" disabled={isSubmitting}>{isSubmitting ? 'Working…' : confirmLabel}</ActionButton>
      </div>
    </div>
  )
}
