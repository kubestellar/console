/**
 * User-managed Drasi server connections — localStorage-backed list of
 * `(name, mode, url|cluster)` tuples plus a single "active" selection.
 *
 * Before this hook the Drasi card could only talk to whichever server the
 * build-time `VITE_DRASI_SERVER_URL` / `VITE_DRASI_PLATFORM_CLUSTER` envs
 * pointed at. Users asked for an in-dashboard picker modeled after the
 * AI/ML endpoint management flow (add / edit / delete / select) so they
 * can flip between multiple Drasi installs without rebuilding.
 *
 * Storage is split into two keys:
 *   - STORAGE_KEY_DRASI_CONNECTIONS        — JSON array of DrasiConnection
 *   - STORAGE_KEY_DRASI_ACTIVE_CONNECTION  — connection id string (or '')
 *
 * State is held at module level and synced across component instances via
 * a listener set — same pattern as useSnoozedRecommendations. Build-time
 * env vars are used to seed the list on first use so existing deployments
 * keep working without manual config.
 */
import { useEffect, useState } from 'react'
import {
  STORAGE_KEY_DRASI_CONNECTIONS,
  STORAGE_KEY_DRASI_ACTIVE_CONNECTION,
} from '../lib/constants/storage'

/** A single Drasi server connection as the user configured it. */
export interface DrasiConnection {
  id: string
  name: string
  mode: 'server' | 'platform'
  /** drasi-server URL when mode === 'server'. */
  url?: string
  /** kubeconfig context name when mode === 'platform'. */
  cluster?: string
  createdAt: number
  /** Seeded demo entry — visible in the connections modal so the UX is
   *  not empty on a fresh install, but the fetch hook skips it so the
   *  card stays in demo mode (the fake URLs point nowhere). */
  isDemoSeed?: boolean
}

/** Demo connections seeded on first use when no env vars are set. Give the
 *  user something to look at in the connections modal while they have no
 *  real Drasi install. The `isDemoSeed` flag keeps the fetch hook from
 *  trying to hit these fake endpoints. */
const DEMO_SEED_CONNECTIONS: Omit<DrasiConnection, 'createdAt'>[] = [
  {
    id: 'demo-seed-retail',
    name: 'retail-analytics (demo)',
    mode: 'server',
    url: 'https://drasi.retail-analytics.example.com',
    isDemoSeed: true,
  },
  {
    id: 'demo-seed-iot',
    name: 'iot-telemetry (demo)',
    mode: 'server',
    url: 'https://drasi.iot.example.com:8080',
    isDemoSeed: true,
  },
  {
    id: 'demo-seed-fraud',
    name: 'fraud-detection (demo)',
    mode: 'platform',
    cluster: 'fraud-prod',
    isDemoSeed: true,
  },
  {
    id: 'demo-seed-supply',
    name: 'supply-chain (demo)',
    mode: 'platform',
    cluster: 'supply-chain-dev',
    isDemoSeed: true,
  },
]

interface StoredState {
  connections: DrasiConnection[]
  activeId: string
}

/** Build-time env fallbacks. Seeded into the connection list on first use
 *  so the existing deployments don't break. */
const ENV_DRASI_SERVER_URL = import.meta.env.VITE_DRASI_SERVER_URL as string | undefined
const ENV_DRASI_PLATFORM_CLUSTER = import.meta.env.VITE_DRASI_PLATFORM_CLUSTER as string | undefined

let state: StoredState = { connections: [], activeId: '' }
const listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach(l => l())
}

function loadState(): StoredState {
  const loaded: StoredState = { connections: [], activeId: '' }
  try {
    const rawList = localStorage.getItem(STORAGE_KEY_DRASI_CONNECTIONS)
    if (rawList) loaded.connections = JSON.parse(rawList) as DrasiConnection[]
    loaded.activeId = localStorage.getItem(STORAGE_KEY_DRASI_ACTIVE_CONNECTION) ?? ''
  } catch {
    // Malformed localStorage — ignore and start fresh.
  }

  // Seed from env vars when the user hasn't configured anything yet. This
  // preserves the "env var = live mode" behavior from Waves A/B.
  if (loaded.connections.length === 0) {
    if (ENV_DRASI_SERVER_URL) {
      loaded.connections.push({
        id: 'env-server',
        name: 'Default (env)',
        mode: 'server',
        url: ENV_DRASI_SERVER_URL,
        createdAt: Date.now(),
      })
    }
    if (ENV_DRASI_PLATFORM_CLUSTER) {
      loaded.connections.push({
        id: 'env-platform',
        name: `Platform · ${ENV_DRASI_PLATFORM_CLUSTER}`,
        mode: 'platform',
        cluster: ENV_DRASI_PLATFORM_CLUSTER,
        createdAt: Date.now(),
      })
    }
    if (loaded.connections.length > 0 && !loaded.activeId) {
      loaded.activeId = loaded.connections[0].id
    }
  }

  // Still empty after env seeding — add the demo seed list so the
  // connections modal has something interesting on a fresh install. These
  // are clearly marked "(demo)" and skipped by the fetch path.
  if (loaded.connections.length === 0) {
    const now = Date.now()
    loaded.connections = DEMO_SEED_CONNECTIONS.map((c, i) => ({
      ...c,
      createdAt: now + i,
    }))
    // Do NOT auto-activate a demo seed — the card should stay in demo mode
    // until the user explicitly selects one (which still won't go live
    // because isDemoSeed short-circuits the fetch).
  }

  return loaded
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY_DRASI_CONNECTIONS, JSON.stringify(state.connections))
    localStorage.setItem(STORAGE_KEY_DRASI_ACTIVE_CONNECTION, state.activeId)
  } catch {
    // Ignore write errors (private browsing, quota exceeded, etc.).
  }
}

// Initialize on module load so the first useDrasiResources() call already
// sees the seeded env-based connection without a re-render round-trip.
state = loadState()

/** Module-level accessor used by `useDrasiResources` — reads the currently
 *  active connection without needing the React hook wiring. */
export function getActiveDrasiConnection(): DrasiConnection | null {
  if (!state.activeId) return null
  return state.connections.find(c => c.id === state.activeId) ?? null
}

export function useDrasiConnections() {
  const [localState, setLocalState] = useState<StoredState>(state)

  useEffect(() => {
    const listener = () => setLocalState({ ...state })
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  const addConnection = (conn: Omit<DrasiConnection, 'id' | 'createdAt'>): DrasiConnection => {
    const created: DrasiConnection = {
      ...conn,
      id: `drasi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    }
    state = {
      connections: [...state.connections, created],
      activeId: state.activeId || created.id,
    }
    saveState()
    notifyListeners()
    return created
  }

  const updateConnection = (id: string, patch: Partial<Omit<DrasiConnection, 'id' | 'createdAt'>>) => {
    state = {
      ...state,
      connections: state.connections.map(c => c.id === id ? { ...c, ...patch } : c),
    }
    saveState()
    notifyListeners()
  }

  const removeConnection = (id: string) => {
    const next = state.connections.filter(c => c.id !== id)
    state = {
      connections: next,
      activeId: state.activeId === id ? (next[0]?.id ?? '') : state.activeId,
    }
    saveState()
    notifyListeners()
  }

  const setActive = (id: string) => {
    if (id && !state.connections.some(c => c.id === id)) return
    state = { ...state, activeId: id }
    saveState()
    notifyListeners()
  }

  return {
    connections: localState.connections,
    activeId: localState.activeId,
    activeConnection: localState.connections.find(c => c.id === localState.activeId) ?? null,
    addConnection,
    updateConnection,
    removeConnection,
    setActive,
  }
}
