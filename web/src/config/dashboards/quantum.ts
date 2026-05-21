/**
 * Quantum Computing Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const quantumDashboardConfig: UnifiedDashboardConfig = {
  id: 'quantum',
  name: 'Quantum Demo',
  subtitle: 'Quantum circuit execution and results',
  route: '/quantum',
  statsType: 'quantum',
  cards: [
    // Quantum control panel
    {
      id: 'quantum-control-1',
      cardType: 'quantum_control_panel',
      title: 'Quantum Control Panel',
      position: { w: 6, h: 4 },
    },
    // Quantum qubit grid
    {
      id: 'quantum-qubits-1',
      cardType: 'quantum_qubit_grid',
      title: 'Quantum Qubit Grid',
      position: { w: 6, h: 5 },
    },
    // Quantum status
    {
      id: 'quantum-status-1',
      cardType: 'quantum_status',
      title: 'Quantum Status',
      position: { w: 4, h: 3 },
    },
    // Quantum circuit viewer
    {
      id: 'quantum-circuit-1',
      cardType: 'quantum_circuit_viewer',
      title: 'Quantum Circuit Viewer',
      position: { w: 6, h: 3 },
    },
    // Quantum histogram
    {
      id: 'quantum-histogram-1',
      cardType: 'quantum_histogram',
      title: 'Execution Histogram',
      position: { w: 12, h: 5 },
    },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
  },
  storageKey: 'kubestellar-quantum-cards',
}

export default quantumDashboardConfig
