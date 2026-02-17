import React, { useMemo } from 'react'
import { CardWrapper } from '../components/cards/CardWrapper'
import { DEMO_DATA_CARDS, getCardComponent, getRegisteredCardTypes } from '../components/cards/cardRegistry'
import { formatCardTitle } from '../lib/formatCardTitle'

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
      message: error instanceof Error ? error.message : 'Unknown card render error',
    }
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
  const params = new URLSearchParams(window.location.search)
  const batch = Math.max(0, parsePositiveInt(params.get('batch'), 1) - 1)
  const batchSize = parsePositiveInt(params.get('size'), DEFAULT_BATCH_SIZE)

  const allCardTypes = useMemo(
    () =>
      getRegisteredCardTypes()
        .filter((type) => type !== 'dynamic_card')
        .sort(),
    []
  )

  const selected = useMemo(() => {
    const start = batch * batchSize
    const items = allCardTypes.slice(start, start + batchSize)
    return items.map((cardType, idx) => ({
      cardType,
      cardId: `compliance-${batch}-${idx}-${cardType}`,
    }))
  }, [allCardTypes, batch, batchSize])

  window.__COMPLIANCE_MANIFEST__ = {
    allCardTypes,
    totalCards: allCardTypes.length,
    batch,
    batchSize,
    selected,
  }

  return (
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
                    <div data-testid={`compliance-missing-${item.cardType}`} className="text-xs text-amber-300">
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
  )
}
