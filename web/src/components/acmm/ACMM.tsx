/**
 * ACMM Dashboard
 *
 * Route component for /acmm. Wraps the 4 cards in an ACMMProvider so all
 * cards share a single scan, and renders the sticky RepoPicker header
 * above the card grid.
 */

import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { ACMMProvider } from './ACMMProvider'
import { RepoPicker } from './RepoPicker'
import { ACMMIntroModal, useACMMIntroModal } from './ACMMIntroModal'

const ACMM_CARDS_KEY = 'kubestellar-acmm-cards'
const DEFAULT_ACMM_CARDS = getDefaultCards('acmm')

export function ACMM() {
  const intro = useACMMIntroModal()
  return (
    <ACMMProvider>
      <DashboardPage
        title="AI Codebase Maturity"
        subtitle="Assess any GitHub repo against the AI Codebase Maturity Model"
        icon="BarChart3"
        storageKey={ACMM_CARDS_KEY}
        defaultCards={DEFAULT_ACMM_CARDS}
        statsType="acmm"
        beforeCards={<RepoPicker />}
        emptyState={{
          title: 'AI Codebase Maturity',
          description:
            'Enter a GitHub repo above to assess it against the AI Codebase Maturity Model.',
        }}
      />
      <ACMMIntroModal isOpen={intro.isOpen} onClose={intro.onClose} />
    </ACMMProvider>
  )
}

export default ACMM
