/**
 * ACMM Dashboard
 *
 * Route component for /acmm. Wraps the 4 cards in an ACMMProvider so all
 * cards share a single scan, and renders the sticky RepoPicker header
 * above the card grid.
 */

import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { ACMMProvider, useACMM } from './ACMMProvider'
import { RepoPicker } from './RepoPicker'
import { ACMMIntroModal } from './ACMMIntroModal'
import { useACMMStats } from './useACMMStats'

const ACMM_CARDS_KEY = 'kubestellar-acmm-cards'
const DEFAULT_ACMM_CARDS = getDefaultCards('acmm')

/** Inner dashboard that lives inside ACMMProvider so it can consume
 *  both the ACMM context (for the intro modal) and the ACMM stat
 *  values (for the Stats Overview bar). */
function ACMMDashboard() {
  const { introOpen, closeIntro } = useACMM()
  const { getStatValue } = useACMMStats()
  return (
    <>
      <DashboardPage
        title="AI Codebase Maturity"
        subtitle="Assess any GitHub repo against the AI Codebase Maturity Model"
        icon="BarChart3"
        storageKey={ACMM_CARDS_KEY}
        defaultCards={DEFAULT_ACMM_CARDS}
        statsType="acmm"
        getStatValue={getStatValue}
        beforeCards={<RepoPicker />}
        emptyState={{
          title: 'AI Codebase Maturity',
          description:
            'Enter a GitHub repo above to assess it against the AI Codebase Maturity Model.',
        }}
      />
      <ACMMIntroModal isOpen={introOpen} onClose={closeIntro} />
    </>
  )
}

export function ACMM() {
  return (
    <ACMMProvider>
      <ACMMDashboard />
    </ACMMProvider>
  )
}

export default ACMM
