/**
 * Demo data for the Lima VM status card.
 *
 * These numbers represent a typical developer workstation running Lima
 * as a virtual machine manager (e.g., for running local Kubernetes clusters
 * with k3s or kind on macOS). Used when the dashboard is in demo mode or
 * when no Lima-managed nodes are connected.
 *
 * Lima instances are detected via node labels (`lima.sh/instance`) or node
 * names that begin with "lima-".
 */

export interface LimaInstance {
  name: string
  status: 'running' | 'stopped' | 'broken'
  cpuCores: number
  memoryGB: number
  diskGB: number
  arch: string
  os: string
  limaVersion: string
  lastSeen: string
}

export interface LimaDemoData {
  instances: LimaInstance[]
  totalNodes: number
  runningNodes: number
  stoppedNodes: number
  brokenNodes: number
  health: 'healthy' | 'degraded' | 'not-detected'
  totalCpuCores: number
  totalMemoryGB: number
  lastCheckTime: string
}

export const LIMA_DEMO_DATA: LimaDemoData = {
  instances: [
    {
      name: 'lima-k3s',
      status: 'running',
      cpuCores: 4,
      memoryGB: 8,
      diskGB: 60,
      arch: 'x86_64',
      os: 'Ubuntu 22.04 LTS',
      limaVersion: '0.18.0',
      lastSeen: new Date(Date.now() - 30 * 1000).toISOString(),
    },
    {
      name: 'lima-default',
      status: 'running',
      cpuCores: 2,
      memoryGB: 4,
      diskGB: 30,
      arch: 'x86_64',
      os: 'Ubuntu 22.04 LTS',
      limaVersion: '0.18.0',
      lastSeen: new Date(Date.now() - 45 * 1000).toISOString(),
    },
    {
      name: 'lima-dev',
      status: 'running',
      cpuCores: 4,
      memoryGB: 8,
      diskGB: 80,
      arch: 'aarch64',
      os: 'Ubuntu 23.10',
      limaVersion: '0.17.2',
      lastSeen: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    {
      name: 'lima-test',
      status: 'stopped',
      cpuCores: 2,
      memoryGB: 4,
      diskGB: 20,
      arch: 'x86_64',
      os: 'Fedora 39',
      limaVersion: '0.17.2',
      lastSeen: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
  ],
  totalNodes: 4,
  runningNodes: 3,
  stoppedNodes: 1,
  brokenNodes: 0,
  health: 'degraded',
  totalCpuCores: 12,
  totalMemoryGB: 24,
  lastCheckTime: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
}
