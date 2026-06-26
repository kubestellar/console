/**
 * Compliance cards backed by live data hooks.
 *
 * This file now orchestrates thin wrappers so each card implementation can live
 * in its own focused module without changing the public exports consumed by the
 * dashboard registry.
 */

import type { CardConfig } from './cardTypes'
import { FalcoAlertsCard } from './FalcoAlertsCard'
import { TrivyScanCard } from './TrivyScanCard'
import { KubescapeScanCard } from './KubescapeScanCard'
import { PolicyViolationsCard } from './PolicyViolationsCard'
import { ComplianceScoreCard } from './ComplianceScoreCard'

export function FalcoAlerts(props: CardConfig) {
  return <FalcoAlertsCard {...props} />
}

export function TrivyScan(props: CardConfig) {
  return <TrivyScanCard {...props} />
}

export function KubescapeScan(props: CardConfig) {
  return <KubescapeScanCard {...props} />
}

export function PolicyViolations(props: CardConfig) {
  return <PolicyViolationsCard {...props} />
}

export function ComplianceScore(props: CardConfig) {
  return <ComplianceScoreCard {...props} />
}
