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
