import type { ReactNode } from 'react'
import type { StellarNotification, StellarSolve } from '../../types/stellar'
import { RawPayloadViewer } from './RawPayloadViewer'

interface TimelineEntry {
  ts: string
  label: string
  detail: string
}

interface EventDetailPanelProps {
  view: 'overview' | 'investigate'
  rootCause: string
  affectedResource: string
  errorMessage: string
  timelineEntries: TimelineEntry[]
  autoResolutionSummary: { status: string; detail: string }
  batchWindow: string
  investigationSummary: string
  setInvestigationSummary: (value: string) => void
  relatedEvents: StellarNotification[]
  matchingSolves: StellarSolve[]
  relatedActivity: { id: string; title: string; detail?: string; ts: string }[]
  formatAbsoluteUtc: (value?: string) => string
  formatRelative: (value?: string) => string
  statusLabel: (status?: string) => string
  rawPayload: string
}

const RELATED_EVENT_LIMIT = 6
const INVESTIGATION_TEXTAREA_ROWS = 3

export function EventDetailPanel({
  view,
  rootCause,
  affectedResource,
  errorMessage,
  timelineEntries,
  autoResolutionSummary,
  batchWindow,
  investigationSummary,
  setInvestigationSummary,
  relatedEvents,
  matchingSolves,
  relatedActivity,
  formatAbsoluteUtc,
  formatRelative,
  statusLabel,
  rawPayload,
}: EventDetailPanelProps) {
  if (view === 'overview') {
    return (
      <div className="space-y-4">
        <Section title="Root cause">{rootCause}</Section>
        <Section title="Affected resource">{affectedResource}</Section>
        <Section title="Error message">{errorMessage}</Section>
        <Section title="Event history">
          <Timeline entries={timelineEntries} formatAbsoluteUtc={formatAbsoluteUtc} formatRelative={formatRelative} />
        </Section>
        <Section title="Auto-resolution attempt">
          <div className="text-sm">
            <div className="mb-1 font-medium">Status: {autoResolutionSummary.status}</div>
            <div className="text-[var(--s-text-muted)]">{autoResolutionSummary.detail}</div>
          </div>
        </Section>
        <Section title="Batch metadata">Batch window: {batchWindow}</Section>
      </div>
    )
  }

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
        <RawPayloadViewer payload={rawPayload} />
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
      <Section title={`Retry history (${matchingSolves.length})`}>
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--s-text-muted)]">{title}</div>
      <div className="rounded border border-[var(--s-border)] bg-[var(--s-surface)] p-3 text-sm leading-6 text-[var(--s-text)]">
        {children}
      </div>
    </section>
  )
}

function Timeline({
  entries,
  formatAbsoluteUtc,
  formatRelative,
}: {
  entries: TimelineEntry[]
  formatAbsoluteUtc: (value?: string) => string
  formatRelative: (value?: string) => string
}) {
  if (entries.length === 0) {
    return <div className="text-[var(--s-text-muted)]">No timeline entries recorded yet.</div>
  }
  return (
    <div className="space-y-2">
      {entries.map(entry => (
        <div key={`${entry.label}-${entry.ts}`} className="border-l-2 border-[var(--s-border)] pl-3">
          <div className="text-xs font-mono text-[var(--s-text-muted)]">{formatAbsoluteUtc(entry.ts)} · {formatRelative(entry.ts)}</div>
          <div className="text-sm font-medium">{entry.label}</div>
          <div className="text-sm text-[var(--s-text-muted)]">{entry.detail}</div>
        </div>
      ))}
    </div>
  )
}

function ListBlock({ items, emptyText }: { items: { id: string; title: string; subtitle: string }[]; emptyText: string }) {
  if (items.length === 0) {
    return <div className="text-[var(--s-text-muted)]">{emptyText}</div>
  }
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="rounded border border-[var(--s-border)] bg-[var(--s-surface-2)] px-3 py-2">
          <div className="text-sm font-medium">{item.title}</div>
          <div className="text-xs text-[var(--s-text-muted)]">{item.subtitle}</div>
        </div>
      ))}
    </div>
  )
}
