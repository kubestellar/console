import { describe, expect, it } from 'vitest'
import {
  FlightPlanBlueprint,
  FlightPlanBlueprintCanvas,
  FlightPlanBlueprintInfoPanel,
  FlightPlanBlueprintToolbar,
  INFO_PANEL_DEFAULT,
  OVERLAYS,
} from '../FlightPlanBlueprint'

describe('FlightPlanBlueprint module', () => {
  it('exports the main component and extracted helpers', () => {
    expect(FlightPlanBlueprint).toBeDefined()
    expect(typeof FlightPlanBlueprint).toBe('function')
    expect(FlightPlanBlueprintCanvas).toBeDefined()
    expect(FlightPlanBlueprintInfoPanel).toBeDefined()
    expect(FlightPlanBlueprintToolbar).toBeDefined()
    expect(INFO_PANEL_DEFAULT).toBe(416)
    expect(OVERLAYS.length).toBeGreaterThan(0)
  })
})
