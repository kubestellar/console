/**
 * Drill Action Registry - Maps action names to functions
 */

export type DrillAction = (...args: unknown[]) => void

export const drillActionRegistry = new Map<string, DrillAction>()

export function registerDrillAction(name: string, action: DrillAction) {
  drillActionRegistry.set(name, action)
}
