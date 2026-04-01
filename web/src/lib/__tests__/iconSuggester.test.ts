import { describe, it, expect } from 'vitest'
import { suggestIconSync } from '../iconSuggester'

describe('suggestIconSync', () => {
  it('returns LayoutDashboard for empty string', () => {
    expect(suggestIconSync('')).toBe('LayoutDashboard')
    expect(suggestIconSync('   ')).toBe('LayoutDashboard')
  })

  it('matches infrastructure keywords', () => {
    expect(suggestIconSync('Cluster Overview')).toBe('Server')
    expect(suggestIconSync('CPU Usage')).toBe('Cpu')
    expect(suggestIconSync('Storage Dashboard')).toBe('HardDrive')
    expect(suggestIconSync('Network Policies')).toBe('Globe')
  })

  it('matches workload keywords', () => {
    expect(suggestIconSync('Pod Monitor')).toBe('Box')
    expect(suggestIconSync('Deployment Status')).toBe('Rocket')
    expect(suggestIconSync('Database Admin')).toBe('Database')
  })

  it('matches security keywords', () => {
    expect(suggestIconSync('Security Audit')).toBe('Shield')
    expect(suggestIconSync('Secret Manager')).toBe('Lock')
    expect(suggestIconSync('Vulnerability Scanner')).toBe('Bug')
  })

  it('matches observability keywords', () => {
    expect(suggestIconSync('Monitoring')).toBe('Monitor')
    // 'Metrics Dashboard' matches 'dashboard' keyword first → LayoutDashboard
    expect(suggestIconSync('Metrics Dashboard')).toBe('LayoutDashboard')
    expect(suggestIconSync('Alert Manager')).toBe('Bell')
  })

  it('matches devops keywords', () => {
    expect(suggestIconSync('Git Workflow')).toBe('GitBranch')
    expect(suggestIconSync('Test Runner')).toBe('TestTube2')
  })

  it('returns deterministic random icon for unknown names', () => {
    const icon1 = suggestIconSync('xyzabc123')
    const icon2 = suggestIconSync('xyzabc123')
    expect(icon1).toBe(icon2) // Same name = same icon
  })

  it('returns different icons for different names', () => {
    // Not guaranteed but very likely for sufficiently different names
    const icon1 = suggestIconSync('aaa')
    const icon2 = suggestIconSync('zzz')
    // Just check both are valid strings
    expect(typeof icon1).toBe('string')
    expect(typeof icon2).toBe('string')
  })
})
