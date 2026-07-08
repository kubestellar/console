// Barrel re-export — preserves the public API for all callers.
// Implementation is split across focused sub-modules:
//   useDrillDown.types.ts     — shared TypeScript types and interfaces
//   useDrillDown.history.ts   — browser history state helpers
//   useDrillDown.provider.tsx — DrillDownContext, DrillDownProvider, useDrillDown
//   useDrillDown.actions.ts   — useDrillDownActions and all drillTo* helpers

export type { DrillDownViewType, DrillDownView, DrillDownState, DrillDownContextType } from './useDrillDown.types'
export { DrillDownProvider, useDrillDown } from './useDrillDown.provider'
export { useDrillDownActions } from './useDrillDown.actions'
