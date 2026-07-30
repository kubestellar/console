import { safeLazy } from '../../lib/safeLazy'
import type { CardRegistryCategory } from './cardRegistry.types'

const _quantumBundle = import('./quantum').catch(() => undefined as never)
const QuantumControlPanel = safeLazy(() => _quantumBundle, 'QuantumControlPanel')
const QuantumQubitGrid = safeLazy(() => _quantumBundle, 'QuantumQubitGrid')
const QuantumStatus = safeLazy(() => _quantumBundle, 'QuantumStatus')
const QuantumCircuitViewer = safeLazy(() => _quantumBundle, 'QuantumCircuitViewer')
const QuantumHistogramCard = safeLazy(() => _quantumBundle, 'QuantumHistogramCard')

export const quantumCardRegistry: CardRegistryCategory = {
  components: {
    quantum_control_panel: QuantumControlPanel,
    quantum_qubit_grid: QuantumQubitGrid,
    quantum_status: QuantumStatus,
    quantum_circuit_viewer: QuantumCircuitViewer,
    quantum_histogram: QuantumHistogramCard,
  },
  preloaders: {
    quantum_control_panel: () => import('./quantum'),
    quantum_qubit_grid: () => import('./quantum'),
    quantum_status: () => import('./quantum'),
    quantum_circuit_viewer: () => import('./quantum'),
    quantum_histogram: () => import('./quantum'),
  },
  defaultWidths: {
    quantum_control_panel: 6,
    quantum_qubit_grid: 6,
    quantum_status: 4,
    quantum_circuit_viewer: 6,
    quantum_histogram: 6,
  },
}
