import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatchUpState } from '../../hooks/useStellar'

interface Props {
  catchUp: CatchUpState
  onDismiss: () => void
}

const BANNER_MARGIN = '8px 10px 0'
const BANNER_PADDING = '10px 12px'
const BANNER_GAP_PX = 8
const TITLE_MARGIN_BOTTOM_PX = 4
const TITLE_LETTER_SPACING_EM = '0.08em'
const SUMMARY_LINE_HEIGHT = 1.55
const HIGHLIGHT_MARGIN_TOP_PX = 8
const HIGHLIGHT_PADDING_LEFT_PX = 18
const HIGHLIGHT_GAP_PX = 6
const SUMMARY_SPLIT_LIMIT = 4

function splitSummaryIntoLines(summary: string): string[] {
  return summary
    .split(/\n+/)
    .flatMap(section => section.match(/[^.!?]+[.!?]?/g) || [section])
    .map(item => item.trim())
    .filter(Boolean)
}

function deriveHighlights(catchUp: CatchUpState): string[] {
  const providedHighlights = (catchUp.highlights || []).filter(Boolean)
  if (providedHighlights.length > 0) {
    return providedHighlights
  }

  return splitSummaryIntoLines(catchUp.summary).slice(0, SUMMARY_SPLIT_LIMIT)
}

export function CatchUpBanner({ catchUp, onDismiss }: Props) {
  const { t: tTyped } = useTranslation()
  const isClean = catchUp.kind === 'clean'
  const highlights = useMemo(() => deriveHighlights(catchUp), [catchUp])
  const [lead, ...details] = highlights

  return (
    <div style={{
      margin: BANNER_MARGIN,
      padding: BANNER_PADDING,
      background: isClean ? 'rgba(63,185,80,0.07)' : 'rgba(56,139,253,0.07)',
      border: `1px solid ${isClean ? 'rgba(63,185,80,0.25)' : 'rgba(56,139,253,0.25)'}`,
      borderRadius: 'var(--s-r)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: BANNER_GAP_PX }}>
        <span className="text-sm" style={{ flexShrink: 0 }}>{isClean ? '✦' : '◉'}</span>
        <div style={{ flex: 1 }}>
          <div
            className="font-mono text-xs"
            style={{
              fontWeight: 600,
              letterSpacing: TITLE_LETTER_SPACING_EM,
              textTransform: 'uppercase',
              color: isClean ? 'var(--s-success)' : 'var(--s-info)',
              marginBottom: TITLE_MARGIN_BOTTOM_PX,
            }}
          >
            {tTyped('stellar.catchUp.title')}
          </div>
          {lead && (
            <div className="text-xs" style={{ color: 'var(--s-text)', lineHeight: SUMMARY_LINE_HEIGHT }}>
              {lead}
            </div>
          )}
          {details.length > 0 && (
            <ul
              className="text-xs"
              style={{
                color: 'var(--s-text-muted)',
                lineHeight: SUMMARY_LINE_HEIGHT,
                marginTop: HIGHLIGHT_MARGIN_TOP_PX,
                paddingLeft: HIGHLIGHT_PADDING_LEFT_PX,
                display: 'grid',
                gap: HIGHLIGHT_GAP_PX,
              }}
            >
              {details.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label={tTyped('stellar.catchUp.dismissAriaLabel')}
          className="text-xs"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--s-text-dim)',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
