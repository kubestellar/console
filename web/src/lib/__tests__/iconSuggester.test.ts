import { describe, it, expect, vi, beforeEach } from 'vitest'
import { suggestIconSync, suggestDashboardIcon } from '../iconSuggester'

// Mock the getDemoMode dependency
vi.mock('../../hooks/useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
}))

// Mock WebSocket so askAgentForIcon does not open real connections
const mockWsSend = vi.fn()
const mockWsClose = vi.fn()

class MockWebSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null

  send = mockWsSend
  close = mockWsClose

  constructor() {
    // Simulate immediate error (agent not available) by default
    setTimeout(() => {
      this.onerror?.()
    }, 0)
  }
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket)
  mockWsSend.mockClear()
  mockWsClose.mockClear()
})

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

  // -----------------------------------------------------------------------
  // Additional keyword coverage
  // -----------------------------------------------------------------------

  it('matches gateway/service/endpoint/mesh keywords to Network', () => {
    expect(suggestIconSync('API Gateway')).toBe('Network')
    expect(suggestIconSync('Service Mesh')).toBe('Network')
    expect(suggestIconSync('Endpoint Health')).toBe('Network')
  })

  it('matches job/batch workload keywords', () => {
    // "job" keyword matches Wrench (appears before "cronjob" in the map)
    expect(suggestIconSync('Job Runner')).toBe('Wrench')
    // "batch" alone matches RefreshCw
    expect(suggestIconSync('Batch Processing')).toBe('RefreshCw')
  })

  it('matches cache/redis/queue keywords to Zap', () => {
    expect(suggestIconSync('Redis Cache')).toBe('Zap')
    expect(suggestIconSync('Message Queue')).toBe('Zap')
    expect(suggestIconSync('Kafka Streams')).toBe('Zap')
  })

  it('matches RBAC/policy/compliance security keywords', () => {
    expect(suggestIconSync('RBAC Manager')).toBe('Shield')
    expect(suggestIconSync('Policy Engine')).toBe('ShieldCheck')
    expect(suggestIconSync('Compliance Dashboard')).toBe('ShieldCheck')
    expect(suggestIconSync('Audit Log')).toBe('ShieldAlert')
  })

  it('matches identity/access/permission keywords', () => {
    expect(suggestIconSync('Identity Provider')).toBe('Fingerprint')
    expect(suggestIconSync('Access Control')).toBe('Key')
    expect(suggestIconSync('Permission Manager')).toBe('Key')
  })

  it('matches scan keyword to ScanLine', () => {
    // "Container Scan" matches "container" first -> Box. Use a name where "scan" is the first keyword.
    expect(suggestIconSync('Scan Results')).toBe('ScanLine')
  })

  it('matches log/trace/event observability keywords', () => {
    expect(suggestIconSync('Log Viewer')).toBe('Terminal')
    expect(suggestIconSync('Trace Explorer')).toBe('Activity')
    // "Event Monitor" — "monitor" keyword appears first in the map iteration
    expect(suggestIconSync('Event Tracker')).toBe('Activity')
  })

  it('matches chart/graph/analytics keywords', () => {
    expect(suggestIconSync('Analytics Panel')).toBe('TrendingUp')
    expect(suggestIconSync('Graph Explorer')).toBe('TrendingUp')
  })

  it('matches health/status keywords', () => {
    expect(suggestIconSync('Health Check')).toBe('CheckCircle')
    expect(suggestIconSync('Status Page')).toBe('CheckCircle')
  })

  it('matches CI/CD and pipeline keywords', () => {
    expect(suggestIconSync('CICD Pipeline')).toBe('GitPullRequest')
    // "Pipeline Status" — "status" maps to CheckCircle first. Use standalone pipeline.
    expect(suggestIconSync('Pipeline View')).toBe('GitPullRequest')
    expect(suggestIconSync('Webhook Manager')).toBe('Webhook')
  })

  it('matches user/team/group keywords', () => {
    expect(suggestIconSync('User Management')).toBe('Users')
    // "Team Dashboard" — "dashboard" keyword appears first. Use a name without other keywords.
    expect(suggestIconSync('Team Page')).toBe('Users')
  })

  it('matches config/settings keywords', () => {
    expect(suggestIconSync('Configuration')).toBe('Settings')
  })

  it('matches cost/billing/budget keywords', () => {
    expect(suggestIconSync('Cost Analysis')).toBe('TrendingUp')
    expect(suggestIconSync('Budget Tracker')).toBe('TrendingUp')
  })

  it('matches GPU/AI/ML keywords', () => {
    expect(suggestIconSync('GPU Allocation')).toBe('Cpu')
    expect(suggestIconSync('AI Insights')).toBe('Microscope')
    // "ML Pipeline" — "pipeline" maps to GitPullRequest before "ml" maps to Microscope
    expect(suggestIconSync('ML Workbench')).toBe('Microscope')
  })

  it('matches edge/IoT/remote keywords', () => {
    // "Edge Nodes" — "node" keyword maps to Server first. Use standalone "edge".
    expect(suggestIconSync('Edge Computing')).toBe('Satellite')
    expect(suggestIconSync('IoT Devices')).toBe('Radio')
  })

  it('matches game/demo/playground keywords', () => {
    expect(suggestIconSync('Demo Mode')).toBe('Gamepad2')
    expect(suggestIconSync('Playground')).toBe('Gamepad2')
  })

  it('matches fire/hot/critical/urgent keywords', () => {
    expect(suggestIconSync('Hot Reload')).toBe('Flame')
    // "Critical Alerts" — "alert" maps to Bell first. Use standalone "critical".
    expect(suggestIconSync('Critical Issues')).toBe('Flame')
  })

  it('matches cool/freeze/cold keywords', () => {
    // "Cold Storage" — "storage" maps to HardDrive first, "Cold Standby" — "db" in "standby" -> Database
    expect(suggestIconSync('Cold Tier')).toBe('Snowflake')
    expect(suggestIconSync('Freeze It')).toBe('Snowflake')
  })

  it('matches green/eco/sustainable keywords', () => {
    expect(suggestIconSync('Green IT')).toBe('Leaf')
    // "Eco Dashboard" — "dashboard" maps to LayoutDashboard first
    expect(suggestIconSync('Eco Footprint')).toBe('Leaf')
  })

  it('matches search/find/discover/explore keywords', () => {
    // "Search Pods" — "pod" matches first -> Box. Use standalone search.
    expect(suggestIconSync('Search Tool')).toBe('Search')
    expect(suggestIconSync('Explore Region')).toBe('Compass')
  })

  it('matches map/location/navigation keywords', () => {
    // "Geo Dashboard" — "dashboard" maps to LayoutDashboard first
    expect(suggestIconSync('Geo View')).toBe('Map')
    expect(suggestIconSync('Location Viewer')).toBe('Navigation')
  })

  it('matches cloud provider keywords', () => {
    expect(suggestIconSync('AWS Regions')).toBe('Cloud')
    // "Azure Status" — "status" maps to CheckCircle first
    expect(suggestIconSync('Azure Portal')).toBe('Cloud')
    // "GCP Billing" — "billing" maps to TrendingUp first
    expect(suggestIconSync('GCP Stuff')).toBe('Cloud')
  })

  it('matches overview/summary/main keywords', () => {
    expect(suggestIconSync('Overview')).toBe('LayoutDashboard')
    expect(suggestIconSync('Summary')).toBe('LayoutDashboard')
  })

  it('returns a valid string icon for every input', () => {
    const names = ['', '   ', 'random', 'a', '123', 'My Custom Dashboard!!!']
    for (const name of names) {
      const icon = suggestIconSync(name)
      expect(typeof icon).toBe('string')
      expect(icon.length).toBeGreaterThan(0)
    }
  })

  it('is case-insensitive for keyword matching', () => {
    expect(suggestIconSync('CLUSTER')).toBe('Server')
    expect(suggestIconSync('cluster')).toBe('Server')
    expect(suggestIconSync('Cluster')).toBe('Server')
    expect(suggestIconSync('cLuStEr')).toBe('Server')
  })

  it('matches partial keyword in longer name', () => {
    // "node" is inside "Node Health Dashboard"
    expect(suggestIconSync('Node Health Dashboard')).toBe('Server')
  })
})

describe('suggestDashboardIcon', () => {
  it('returns LayoutDashboard for empty/whitespace name', async () => {
    expect(await suggestDashboardIcon('')).toBe('LayoutDashboard')
    expect(await suggestDashboardIcon('   ')).toBe('LayoutDashboard')
  })

  it('falls back to keyword match when agent is unavailable', async () => {
    // MockWebSocket triggers onerror immediately, so askAgentForIcon returns null
    const icon = await suggestDashboardIcon('Cluster Health')
    expect(icon).toBe('Server')
  })

  it('falls back to deterministic random icon for unknown name', async () => {
    const icon = await suggestDashboardIcon('xyzabc_totally_unknown_9876')
    expect(typeof icon).toBe('string')
    expect(icon.length).toBeGreaterThan(0)
    // Should be deterministic
    const icon2 = await suggestDashboardIcon('xyzabc_totally_unknown_9876')
    expect(icon2).toBe(icon)
  })

  it('returns keyword icon for security-related names', async () => {
    const icon = await suggestDashboardIcon('Secret Rotation')
    expect(icon).toBe('Lock')
  })

  it('skips WebSocket in demo mode and falls back', async () => {
    const { getDemoMode } = await import('../../hooks/useDemoMode')
    vi.mocked(getDemoMode).mockReturnValue(true)

    const icon = await suggestDashboardIcon('Pod Monitor')
    // Should still resolve via keyword fallback
    expect(icon).toBe('Box')

    vi.mocked(getDemoMode).mockReturnValue(false)
  })

  it('uses AI icon from WebSocket stream response', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: JSON.stringify({ type: 'stream', payload: { content: 'Shield', done: true } }) })
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('Security Overview')
    expect(icon).toBe('Shield')
  })

  it('uses AI icon from WebSocket result response', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: JSON.stringify({ type: 'result', payload: { content: 'Database' } }) })
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('Data Store')
    expect(icon).toBe('Database')
  })

  it('handles WebSocket error message type gracefully', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: JSON.stringify({ type: 'error', payload: { message: 'fail' } }) })
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('My Dashboard')
    expect(typeof icon).toBe('string')
  })

  it('accumulates streamed content across multiple messages', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: JSON.stringify({ type: 'stream', payload: { content: 'Lay' } }) })
          this.onmessage?.({ data: JSON.stringify({ type: 'stream', payload: { content: 'outDashboard', done: true } }) })
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('Main View')
    expect(icon).toBe('LayoutDashboard')
  })

  it('parses icon from messy AI response with quotes', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: JSON.stringify({ type: 'result', payload: { content: '"Server"' } }) })
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('Cluster Nodes')
    expect(icon).toBe('Server')
  })

  it('parses icon from response containing icon name in longer text', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: JSON.stringify({ type: 'result', payload: { content: 'I recommend using the Shield icon' } }) })
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('Protect Everything')
    expect(icon).toBe('Shield')
  })

  it('handles case-insensitive icon matching from AI response', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: JSON.stringify({ type: 'result', payload: { content: 'shield' } }) })
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('Guard Zone')
    expect(icon).toBe('Shield')
  })

  it('falls back to keywords when AI returns unrecognized icon name', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: JSON.stringify({ type: 'result', payload: { content: 'NotARealIcon' } }) })
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('Cluster Health')
    expect(icon).toBe('Server')
  })

  it('handles WebSocket onclose with partial response', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: JSON.stringify({ type: 'stream', payload: { content: 'Database' } }) })
          this.onclose?.()
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('Data Warehouse')
    expect(icon).toBe('Database')
  })

  it('handles invalid JSON in WebSocket message without crashing', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: '{invalid json' })
          this.onmessage?.({ data: JSON.stringify({ type: 'result', payload: { content: 'Cpu' } }) })
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('Compute Resources')
    expect(icon).toBe('Cpu')
  })

  it('uses result payload content over accumulated stream when result type received', async () => {
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
      constructor() {
        setTimeout(() => {
          this.onopen?.()
          this.onmessage?.({ data: JSON.stringify({ type: 'stream', payload: { content: 'Shield' } }) })
          this.onmessage?.({ data: JSON.stringify({ type: 'result', payload: { content: 'Lock' } }) })
        }, 0)
      }
    })
    const icon = await suggestDashboardIcon('Auth Security')
    expect(icon).toBe('Lock')
  })
})
