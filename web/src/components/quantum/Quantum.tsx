/**
 * Quantum Computing Dashboard Page
 *
 * Quantum circuit execution, qubit grid visualization, and result analysis.
 */
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { QuantumWorkloadBanner } from './QuantumWorkloadBanner'

const QUANTUM_CARDS_KEY = 'kubestellar-quantum-cards'
const DEFAULT_QUANTUM_CARDS = getDefaultCards('quantum')

export function Quantum() {
  return (
    <DashboardPage
      storageKey={QUANTUM_CARDS_KEY}
      defaultCards={DEFAULT_QUANTUM_CARDS}
      title="Quantum Computing"
      icon="Qiskit"
      statsType="compute"
      beforeCards={<QuantumWorkloadBanner />}
    />
  )
}
