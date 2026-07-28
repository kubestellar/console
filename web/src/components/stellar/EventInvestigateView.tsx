import { Section, ListBlock, formatAbsoluteUtc } from './EventDetailPanel'
import { RawPayloadViewer } from './RawPayloadViewer'
import type { StellarNotification, StellarSolve } from '../../types/stellar'
import { statusLabel } from './EventModal.utils'

const RELATED_EVENT_LIMIT = 6
const INVESTIGATION_TEXTAREA_ROWS = 3

interface EventInvestigateViewProps {
  liveNotification: StellarNotification
  investigationSummary: string
  setInvestigationSummary: (v: string) => void
  errorMessage: string
  relatedEvents: StellarNotification[]
  relatedActivity: Array<{ id: string; ts: string; title: string; detail?: string }>
  matchingSolves: StellarSolve[]
  solveAttemptCount: number
}

export function EventInvestigateView({
  liveNotification,
  investigationSummary,
  setInvestigationSummary,
  errorMessage,
  relatedEvents,
  relatedActivity,
  matchingSolves,
  solveAttemptCount,
}: EventInvestigateViewProps) {
  return (
    <div className="space-y-4">
      <Section title="Investigation summary">
        <textarea
          value={investigationSummary}
          onChange={(event) => setInvestigationSummary(event.target.value)}
          rows={INVESTIGATION_TEXTAREA_ROWS}
          className="w-full rounded border border-[var(--s-border)] bg-[var(--s-surface)] px-3 py-2 text-sm text-[var(--s-text)]"
          placeholder="Optional note for the team"
        />
      </Section>
      <Section title="Full event logs">
        <RawPayloadViewer>{liveNotification.body || errorMessage}</RawPayloadViewer>
      </Section>
      <Section title={`Related events (${relatedEvents.length})`}>
        <ListBlock
          items={(relatedEvents || []).slice(0, RELATED_EVENT_LIMIT).map(item => ({
            id: item.id,
            title: item.title,
            subtitle: `${formatAbsoluteUtc(item.createdAt)} · ${statusLabel(item.status)}`,
          }))}
          emptyText="No related events found in the current feed."
        />
      </Section>
      <Section title={`Retry history (${solveAttemptCount})`}>
        <ListBlock
          items={(matchingSolves || []).map(item => ({
            id: item.id,
            title: `${statusLabel(item.status)} · ${item.actionsTaken} action(s)`,
            subtitle: `${formatAbsoluteUtc(item.startedAt)} · ${item.summary || item.error || 'No summary available'}`,
          }))}
          emptyText="No automatic retries recorded."
        />
      </Section>
      <Section title={`Related activity (${relatedActivity.length})`}>
        <ListBlock
          items={(relatedActivity || []).map(item => ({
            id: item.id,
            title: item.title,
            subtitle: `${formatAbsoluteUtc(item.ts)} · ${item.detail || 'No additional detail'}`,
          }))}
          emptyText="No related activity recorded yet."
        />
      </Section>
    </div>
  )
}
