import { describe, it, expect } from 'vitest'
import {
  ARTIFACT_HUB_DEMO_DATA,
  type ArtifactHubDemoData,
} from '../artifact_hub_status/demoData'

describe('ARTIFACT_HUB_DEMO_DATA', () => {
  it('is defined', () => {
    expect(ARTIFACT_HUB_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid: ArtifactHubDemoData['health'][] = ['healthy', 'degraded']
    expect(valid).toContain(ARTIFACT_HUB_DEMO_DATA.health)
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(ARTIFACT_HUB_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  it('packages count is positive', () => {
    expect(ARTIFACT_HUB_DEMO_DATA.packages).toBeGreaterThan(0)
  })

  it('repositories count is positive', () => {
    expect(ARTIFACT_HUB_DEMO_DATA.repositories).toBeGreaterThan(0)
  })

  it('organizations count is positive', () => {
    expect(ARTIFACT_HUB_DEMO_DATA.organizations).toBeGreaterThan(0)
  })

  it('users count is positive', () => {
    expect(ARTIFACT_HUB_DEMO_DATA.users).toBeGreaterThan(0)
  })

  it('repositories < packages (hub scale)', () => {
    expect(ARTIFACT_HUB_DEMO_DATA.repositories).toBeLessThan(ARTIFACT_HUB_DEMO_DATA.packages)
  })

  it('organizations < users (org scale)', () => {
    expect(ARTIFACT_HUB_DEMO_DATA.organizations).toBeLessThan(ARTIFACT_HUB_DEMO_DATA.users)
  })
})
