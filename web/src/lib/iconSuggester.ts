/**
 * AI-powered icon suggestion for custom dashboards.
 * Uses the local agent WebSocket to ask the AI for the best Lucide icon
 * matching a dashboard name. Falls back to keyword matching if the agent
 * is unavailable, then to a random generic icon.
 */

import { getDemoMode } from '../hooks/useDemoMode'
import { LOCAL_AGENT_WS_URL } from './constants'

// All Lucide icons available in the sidebar
const ICON_POOL = [
  'LayoutDashboard', 'Server', 'Box', 'Activity', 'Shield', 'GitBranch',
  'History', 'Settings', 'Plus', 'Zap', 'Database', 'Cloud', 'Lock',
  'Key', 'Users', 'Bell', 'AlertTriangle', 'CheckCircle', 'XCircle',
  'RefreshCw', 'Search', 'Filter', 'Layers', 'Globe', 'Terminal',
  'Code', 'Cpu', 'HardDrive', 'Wifi', 'Monitor', 'Folder', 'Gamepad2',
  'Rocket', 'Eye', 'BarChart3', 'PieChart', 'TrendingUp', 'Gauge',
  'Network', 'Container', 'Boxes', 'Wrench', 'Bug', 'TestTube2',
  'FileCode', 'GitPullRequest', 'Webhook', 'Radio', 'Satellite',
  'ShieldCheck', 'ShieldAlert', 'Fingerprint', 'ScanLine', 'Microscope',
  'Flame', 'Snowflake', 'Leaf', 'Target', 'Crosshair', 'Compass',
  'Map', 'Navigation', 'Anchor', 'Crown', 'Star', 'Heart', 'Bookmark',
]

// Generic icons used as random fallback (visually distinct, non-specific)
const GENERIC_ICONS = [
  'Layers', 'Boxes', 'Compass', 'Target', 'Star', 'Bookmark',
  'Crown', 'Rocket', 'Zap', 'Gauge', 'Eye', 'Radio',
]

// Keyword-to-icon mapping for fast local fallback
const KEYWORD_MAP: Record<string, string> = {
  // Infrastructure
  cluster: 'Server', server: 'Server', node: 'Server', machine: 'Server',
  compute: 'Cpu', cpu: 'Cpu', processor: 'Cpu', performance: 'Gauge',
  memory: 'Cpu', ram: 'Cpu',
  storage: 'HardDrive', disk: 'HardDrive', volume: 'HardDrive', pvc: 'HardDrive',
  network: 'Globe', dns: 'Globe', ingress: 'Globe', route: 'Globe', traffic: 'Globe',
  gateway: 'Network', service: 'Network', endpoint: 'Network', mesh: 'Network',

  // Workloads
  pod: 'Box', container: 'Box', workload: 'Box', deploy: 'Rocket', deployment: 'Rocket',
  app: 'Boxes', application: 'Boxes', microservice: 'Boxes',
  job: 'Wrench', cronjob: 'RefreshCw', batch: 'RefreshCw',
  stateful: 'Database', database: 'Database', db: 'Database', data: 'Database',
  cache: 'Zap', redis: 'Zap', queue: 'Zap', kafka: 'Zap',

  // Security
  security: 'Shield', rbac: 'Shield', policy: 'ShieldCheck', audit: 'ShieldAlert',
  secret: 'Lock', auth: 'Lock', certificate: 'Lock', tls: 'Lock', ssl: 'Lock',
  compliance: 'ShieldCheck', posture: 'ShieldCheck', vulnerability: 'Bug',
  scan: 'ScanLine', identity: 'Fingerprint', access: 'Key', permission: 'Key',

  // Observability
  monitor: 'Monitor', observ: 'Eye', watch: 'Eye', dashboard: 'LayoutDashboard',
  metric: 'BarChart3', chart: 'PieChart', graph: 'TrendingUp', analytics: 'TrendingUp',
  log: 'Terminal', trace: 'Activity', alert: 'Bell', notification: 'Bell',
  event: 'Activity', health: 'CheckCircle', status: 'CheckCircle',

  // DevOps
  git: 'GitBranch', cicd: 'GitPullRequest', pipeline: 'GitPullRequest',
  code: 'FileCode', develop: 'Code', build: 'Wrench', test: 'TestTube2',
  release: 'Rocket', webhook: 'Webhook',

  // Misc
  user: 'Users', team: 'Users', people: 'Users', group: 'Users',
  config: 'Settings', setting: 'Settings', preference: 'Settings',
  history: 'History', archive: 'Folder', backup: 'Folder',
  cost: 'TrendingUp', billing: 'TrendingUp', budget: 'TrendingUp',
  gpu: 'Cpu', ai: 'Microscope', ml: 'Microscope', model: 'Microscope',
  edge: 'Satellite', iot: 'Radio', remote: 'Satellite',
  game: 'Gamepad2', demo: 'Gamepad2', playground: 'Gamepad2',
  fire: 'Flame', hot: 'Flame', critical: 'Flame', urgent: 'Flame',
  cool: 'Snowflake', freeze: 'Snowflake', cold: 'Snowflake',
  green: 'Leaf', eco: 'Leaf', sustainable: 'Leaf', environment: 'Leaf',
  search: 'Search', find: 'Search', discover: 'Search', explore: 'Compass',
  map: 'Map', geo: 'Map', location: 'Navigation', navigate: 'Navigation',
  cloud: 'Cloud', aws: 'Cloud', azure: 'Cloud', gcp: 'Cloud',
  overview: 'LayoutDashboard', summary: 'LayoutDashboard', main: 'LayoutDashboard',
}

/**
 * Ask the local agent AI for the best icon matching a dashboard name.
 * Returns a Promise that resolves to a Lucide icon name.
 * Times out after 5 seconds.
 */
function askAgentForIcon(name: string): Promise<string | null> {
  // In demo mode, skip WebSocket connection to avoid console errors
  if (getDemoMode()) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(null)
    }, 5000)

    try {
      const ws = new WebSocket(LOCAL_AGENT_WS_URL)
      let response = ''
      const requestId = `icon-suggest-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'chat',
          payload: {
            prompt: `Pick the single best Lucide React icon name for a Kubernetes dashboard named "${name}". Choose from this list: ${ICON_POOL.join(', ')}. Reply with ONLY the icon name, nothing else. No explanation, no quotes, no punctuation - just the PascalCase icon name.`,
            sessionId: `icon-${Date.now()}`,
          }
        }))
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          if (message.type === 'stream') {
            const payload = message.payload as { content?: string; done?: boolean }
            if (payload.content) {
              response += payload.content
            }
            if (payload.done) {
              clearTimeout(timeout)
              ws.close()
              const iconName = parseIconFromResponse(response)
              resolve(iconName)
            }
          } else if (message.type === 'result') {
            clearTimeout(timeout)
            ws.close()
            const payload = message.payload as { content?: string }
            const iconName = parseIconFromResponse(payload.content || response)
            resolve(iconName)
          } else if (message.type === 'error') {
            clearTimeout(timeout)
            ws.close()
            resolve(null)
          }
        } catch {
          // Continue listening for more messages
        }
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        ws.close()
        resolve(null)
      }

      ws.onclose = () => {
        clearTimeout(timeout)
        // If we haven't resolved yet, try to parse what we have
        if (response) {
          resolve(parseIconFromResponse(response))
        } else {
          resolve(null)
        }
      }
    } catch {
      clearTimeout(timeout)
      resolve(null)
    }
  })
}

/**
 * Parse an icon name from the AI response.
 * The AI should return just the icon name, but we handle messy responses.
 */
function parseIconFromResponse(response: string): string | null {
  const cleaned = response.trim().replace(/["`']/g, '').trim()

  // Direct match
  if (ICON_POOL.includes(cleaned)) {
    return cleaned
  }

  // Try to find an icon name anywhere in the response
  for (const icon of ICON_POOL) {
    if (cleaned.includes(icon)) {
      return icon
    }
  }

  // Case-insensitive match
  const lower = cleaned.toLowerCase()
  for (const icon of ICON_POOL) {
    if (lower.includes(icon.toLowerCase())) {
      return icon
    }
  }

  return null
}

/**
 * Fast keyword-based icon matching (no AI needed).
 */
function matchIconByKeywords(name: string): string | null {
  const lower = name.toLowerCase()

  for (const [keyword, icon] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword)) {
      return icon
    }
  }

  return null
}

/**
 * Pick a random generic icon (deterministic per name for consistency).
 */
function randomGenericIcon(name: string): string {
  // Simple hash of the name for deterministic selection
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % GENERIC_ICONS.length
  return GENERIC_ICONS[index]
}

/**
 * Suggest the best Lucide icon for a dashboard name.
 *
 * Strategy:
 * 1. Try AI agent (local agent WebSocket) for intelligent matching
 * 2. Fall back to keyword matching
 * 3. Fall back to deterministic random generic icon
 */
export async function suggestDashboardIcon(name: string): Promise<string> {
  if (!name.trim()) return 'LayoutDashboard'

  // Try AI agent first
  const aiIcon = await askAgentForIcon(name)
  if (aiIcon) return aiIcon

  // Fall back to keyword matching
  const keywordIcon = matchIconByKeywords(name)
  if (keywordIcon) return keywordIcon

  // Fall back to random generic icon
  return randomGenericIcon(name)
}

/**
 * Synchronous keyword-only suggestion (for immediate display before AI responds).
 */
export function suggestIconSync(name: string): string {
  if (!name.trim()) return 'LayoutDashboard'
  return matchIconByKeywords(name) || randomGenericIcon(name)
}
