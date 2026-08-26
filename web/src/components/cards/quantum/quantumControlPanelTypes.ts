import type { QuantumSystemStatus } from '../../../hooks/useCachedQuantum'

export interface ControlState {
  backend: string
  shots: number
  qasm_file: string
  executing: boolean
  loop_mode: boolean
  last_execution?: {
    job_id: string
    status: string
    timestamp: string
  }
}

export type SystemStatus = QuantumSystemStatus

export const LARGE_CIRCUIT_QASM = 'expt32.qasm'
export const LOOP_MODE_STATUS_SYNC_DELAY_MS = 100
export const EXECUTION_STATUS_POLL_DELAY_MS = 500
export const BACKENDS_REQUIRING_IBM: ReadonlySet<string> = new Set(['qx5', 'least', 'aer_noise'])

export const DEMO_DATA: ControlState = {
  backend: 'aer',
  shots: 1024,
  qasm_file: 'bell.qasm',
  executing: false,
  loop_mode: false,
}
