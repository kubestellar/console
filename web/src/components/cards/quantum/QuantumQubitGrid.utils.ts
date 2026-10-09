import { DEMO_QUANTUM_QUBITS, QUANTUM_QUBIT_GRID_DEFAULT_POLL_MS } from '../../../hooks/useCachedQuantum'

export const IDLE_QUBIT_STYLE = { backgroundColor: 'rgb(104, 97, 104)' } as const

// Polling interval for qubit grid updates (adjustable for responsiveness)
export const QUBIT_GRID_DEFAULT_POLL_MS = QUANTUM_QUBIT_GRID_DEFAULT_POLL_MS
// SVG border color for qubit grid display
export const SVG_BORDER_COLOR = '#ccc'

export interface QubitSimpleData {
  num_qubits: number
  pattern: string
}

export const DEMO_DATA: QubitSimpleData = DEMO_QUANTUM_QUBITS

// Qubit pixel coordinate mappings from QuantumKCDemo.v0_2.py
export const QUBIT_DISPLAY_PATTERNS = {
  ibm_qx5: [
    [40, 41, 48, 49],
    [8, 9, 16, 17],
    [28, 29, 36, 37],
    [6, 7, 14, 15],
    [54, 55, 62, 63],
  ],
  ibm_qx5t: [
    [0, 1, 8, 9],
    [3, 4, 11, 12],
    [6, 7, 14, 15],
    [27, 28, 35, 36],
    [51, 52, 59, 60],
  ],
  ibm_qhex: [
    [3],
    [10], [12],
    [17], [21],
    [24], [30],
    [33], [37],
    [42], [44],
    [51]
  ],
  ibm_q16x: [
    [63], [54], [61], [52],
    [59], [50], [57], [48],
    [7], [14], [5], [12],
    [3], [10], [1], [8]
  ],
  ibm_q32x: [
    [0], [2], [4], [6],
    [9], [11], [13], [15],
    [16], [18], [20], [22],
    [25], [27], [29], [31],
    [32], [34], [36], [38],
    [41], [43], [45], [47],
    [48], [50], [52], [54],
    [57], [59], [61], [63]
  ],
  qk_logo: [
    [2], [3], [4], [5],
    [9], [10], [13], [14],
    [16], [18], [21], [23],
    [24], [27], [28], [31],
    [32], [33], [38], [39],
    [40], [42], [43], [44], [45], [47],
    [49], [54],
    [58], [59], [60], [61]
  ]
} as const

export const MASK_OPTIONS = [
  { key: 'ibm_qx5t' as const, label: 'IBM QX5 Tee (5-qubit)', maxQubits: 5 },
  { key: 'ibm_qx5' as const, label: 'IBM QX5 Bowtie (5-qubit)', maxQubits: 5 },
  { key: 'ibm_qhex' as const, label: 'IBM QHex (12-qubit)', maxQubits: 12 },
  { key: 'ibm_q16x' as const, label: 'IBM Q16x (16-qubit)', maxQubits: 16 },
  { key: 'ibm_q32x' as const, label: 'IBM Q32x (32-qubit)', maxQubits: 32 },
]

export type MaskKey = typeof MASK_OPTIONS[number]['key']

// Map qubit state to RGB: 0=Blue, 1=Red, 2=Purple (indeterminate/unused), 3=Black (background)
export function qubitStateToColor(state: number): [number, number, number] {
  switch (state) {
    case 1: return [255, 0, 0]      // Red for |1⟩
    case 0: return [0, 0, 255]      // Blue for |0⟩
    case 2: return [104,97,104]
    //case 2: return [128, 0, 128]    // Purple for indeterminate/unused qubits
    case 3: return [0, 0, 0]        // Black for background pixels
    default: return [0, 0, 0]       // Black (fallback)
  }
}

// Render 8x8 SVG grid with proper qubit pattern mapping
export function renderQubitSVG(pattern: string, displayPattern: readonly (readonly number[])[]): string {
  const gridSize = 64
  const rectSize = 16
  const padding = 1

  // If no data available, show Qiskit logo in "unused" color (state 2)
  if (!pattern || pattern.length === 0) {
    const pixelStates = new Array(gridSize).fill(3) // 3 = black (background)
    const logoPattern = QUBIT_DISPLAY_PATTERNS.qk_logo as unknown as (readonly number[])[]

    // Mark logo pixels as state 2 (unused/purple)
    for (const pixelIndices of logoPattern) {
      for (const pixelIndex of pixelIndices) {
        if (pixelIndex < gridSize) {
          pixelStates[pixelIndex] = 2
        }
      }
    }

    let svg = `<svg width="128" height="128" version="1.1" xmlns="http://www.w3.org/2000/svg" style="border: 1px solid ${SVG_BORDER_COLOR}; border-radius: 4px;">\n`

    for (let i = 0; i < gridSize; i++) {
      const x = rectSize * (i % 8)
      const y = rectSize * Math.floor(i / 8)
      const [r, g, b] = qubitStateToColor(pixelStates[i])
      svg += `  <rect x="${x}" y="${y}" width="${rectSize}" height="${rectSize}" fill="rgb(${r},${g},${b})" stroke="white" stroke-width="${padding}"/>\n`
    }

    svg += '</svg>'
    return svg
  }

  // Initialize all pixels as black (state 3 = background pixels)
  const pixelStates = new Array(gridSize).fill(3)

  // First pass: Mark all template pixels as indeterminate/purple (state 2)
  for (const pixelCoords of displayPattern) {
    for (const pixelIndex of pixelCoords) {
      if (pixelIndex < gridSize) {
        pixelStates[pixelIndex] = 2 // 2 = purple (indeterminate/unused)
      }
    }
  }

  // Second pass: Overlay actual qubit data (0 or 1)
  for (let q = 0; q < displayPattern.length && q < pattern.length; q++) {
    const qubitState = pattern[q] === '1' ? 1 : 0
    for (const pixelIndex of displayPattern[q]) {
      if (pixelIndex < gridSize) {
        pixelStates[pixelIndex] = qubitState
      }
    }
  }

  let svg = `<svg width="128" height="128" version="1.1" xmlns="http://www.w3.org/2000/svg" style="border: 1px solid var(--border); border-radius: 4px;">\n`

  for (let i = 0; i < gridSize; i++) {
    const x = rectSize * (i % 8)
    const y = rectSize * Math.floor(i / 8)
    const [r, g, b] = qubitStateToColor(pixelStates[i])
    svg += `  <rect x="${x}" y="${y}" width="${rectSize}" height="${rectSize}" fill="rgb(${r},${g},${b})" stroke="white" stroke-width="${padding}"/>\n`
  }

  svg += '</svg>'
  return svg
}
