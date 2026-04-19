import React, { useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CardWrapper } from '../components/cards/CardWrapper'
import { DEMO_DATA_CARDS, getCardComponent, getRegisteredCardTypes } from '../components/cards/cardRegistry'
import { formatCardTitle } from '../lib/formatCardTitle'
// Some card types (ACMM Level, ACMM Recommendations, ACMM Feedback Loops)
// call useACMM() and will throw "useACMM must be used within an ACMMProvider"
// if rendered outside the normal /acmm route. The compliance test harness
// renders EVERY registered card type, so we wrap the whole page in
// ACMMProvider to avoid spurious render crashes (issues #8984, #8985).
import { ACMMProvider } from '../components/acmm/ACMMProvider'

const DEFAULT_BATCH_SIZE = 24

interface ComplianceCardManifestItem {
  cardType: string
  cardId: string
}

declare global {
  interface Window {
    __COMPLIANCE_MANIFEST__?: {
      allCardTypes: string[]
      totalCards: number
      batch: number
      batchSize: number
      selected: ComplianceCardManifestItem[]
    }
    __COMPLIANCE_SET_BATCH__?: (batch: number, size?: number) => void
  }
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return parsed
}

type CardErrorBoundaryProps = {
  cardType: string
  children: React.ReactNode
}

type CardErrorBoundaryState = {
  hasError: boolean
  message: string
}

class CardErrorBoundary extends React.Component<CardErrorBoundaryProps, CardErrorBoundaryState> {
  constructor(props: CardErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: unknown): CardErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown card render error' }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div data-testid={`compliance-card-error-${this.props.cardType}`} className="text-xs text-red-400">
          Card error: {this.state.message}
        </div>
      )
    }
    return this.props.children
  }
}

export function CompliancePerfTest() {
  const [searchParams, setSearchParams] = useSearchParams()
  const batch = Math.max(0, parsePositiveInt(searchParams.get('batch'), 1) - 1)
  const batchSize = parsePositiveInt(searchParams.get('size'), DEFAULT_BATCH_SIZE)

  // Expose setter for e2e tests to trigger client-side batch switching
  useEffect(() => {
    window.__COMPLIANCE_SET_BATCH__ = (b: number, s?: number) => {
      const p = new URLSearchParams(searchParams)
      p.set('batch', String(b + 1)) // URL is 1-indexed
      if (s) p.set('size', String(s))
      setSearchParams(p)
    }
    return () => { delete window.__COMPLIANCE_SET_BATCH__ }
  }, [searchParams, setSearchParams])

  const allCardTypes = useMemo(
    () =>
      getRegisteredCardTypes()
        .filter((type) => type !== 'dynamic_card')
        .sort(),
    []
  )

  const selected = (() => {
    const start = batch * batchSize
    const items = allCardTypes.slice(start, start + batchSize)
    return items.map((cardType, idx) => ({
      cardType,
      cardId: `compliance-${batch}-${idx}-${cardType}` }))
  })()

  window.__COMPLIANCE_MANIFEST__ = {
    allCardTypes,
    totalCards: allCardTypes.length,
    batch,
    batchSize,
    selected }

  return (
    <ACMMProvider>
      <div className="p-4">
        <div
          data-testid="compliance-manifest"
          data-compliance-total-cards={allCardTypes.length}
          data-compliance-batch={batch}
          data-compliance-batch-size={batchSize}
          data-compliance-selected={selected.length}
          className="mb-4 text-xs text-muted-foreground"
        >
          compliance batch {batch + 1} / {Math.max(1, Math.ceil(allCardTypes.length / batchSize))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[minmax(180px,auto)]">
          {selected.map((item) => {
            const CardComponent = getCardComponent(item.cardType)
            const title = formatCardTitle(item.cardType)

            return (
              <div key={item.cardId} className="md:col-span-4">
                <CardWrapper
                  cardId={item.cardId}
                  cardType={item.cardType}
                  title={title}
                  isDemoData={DEMO_DATA_CARDS.has(item.cardType)}
                  isRefreshing={false}
                  skeletonType="status"
                  skeletonRows={4}
                >
                  <CardErrorBoundary cardType={item.cardType}>
                    {CardComponent ? (
                      <CardComponent config={{ perfMode: true }} />
                    ) : (
                      <div data-testid={`compliance-missing-${item.cardType}`} className="text-xs text-yellow-300">
                        Missing card component: {item.cardType}
                      </div>
                    )}
                  </CardErrorBoundary>
                </CardWrapper>
              </div>
            )
          })}
        </div>
      </div>
    </ACMMProvider>
  )
}
