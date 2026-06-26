import { describe, it, expect } from 'vitest'
import { getDemoPods } from './demoData'

describe('getDemoPods', () => {
  it('includes demo etcd pods for cluster admin cards', () => {
    const etcdPods = getDemoPods().filter(p => p.labels?.component === 'etcd')

    expect(etcdPods.length).toBeGreaterThan(0)
    expect(etcdPods.every(p => p.namespace === 'kube-system')).toBe(true)
    expect(etcdPods.every(p => p.containers?.some(c => c.name === 'etcd'))).toBe(true)
  })

  it('spans multiple clusters for etcd demo mode', () => {
    const clusters = new Set(
      getDemoPods()
        .filter(p => p.labels?.component === 'etcd')
        .map(p => p.cluster)
    )

    expect(clusters.size).toBeGreaterThan(1)
  })
})
