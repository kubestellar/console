import { describe, it, expect } from 'vitest'
import { iconRegistry, getIcon } from '../icons'

describe('icons', () => {
  describe('iconRegistry', () => {
    it('contains common icons', () => {
      expect(iconRegistry.Server).toBeDefined()
      expect(iconRegistry.Database).toBeDefined()
      expect(iconRegistry.Cpu).toBeDefined()
      expect(iconRegistry.Activity).toBeDefined()
    })

    it('contains over 200 icons', () => {
      expect(Object.keys(iconRegistry).length).toBeGreaterThan(200)
    })

    it('every registry entry is a function (React component)', () => {
      for (const [_name, icon] of Object.entries(iconRegistry)) {
        // Lucide icons in React 18 are forwardRef objects (typeof 'object'),
        // while custom icons like KubernetesWheel are plain functions.
        const isFunction = typeof icon === 'function'
        const isForwardRef = typeof icon === 'object' && icon !== null && '$$typeof' in icon
        expect(isFunction || isForwardRef).toBe(true)
      }
    })

    it('includes Kubernetes navigation icons', () => {
      expect(iconRegistry.Box).toBeDefined()
      expect(iconRegistry.Layers).toBeDefined()
      expect(iconRegistry.Shield).toBeDefined()
      expect(iconRegistry.Globe).toBeDefined()
    })

    it('includes the custom KubernetesWheel icon', () => {
      expect(iconRegistry.KubernetesWheel).toBeDefined()
      expect(typeof iconRegistry.KubernetesWheel).toBe('function')
    })

    it('includes status indicator icons', () => {
      expect(iconRegistry.CheckCircle).toBeDefined()
      expect(iconRegistry.AlertTriangle).toBeDefined()
      expect(iconRegistry.XCircle).toBeDefined()
      expect(iconRegistry.HelpCircle).toBeDefined()
    })

    it('includes chart and UI icons', () => {
      expect(iconRegistry.BarChart2).toBeDefined()
      expect(iconRegistry.PieChart).toBeDefined()
      expect(iconRegistry.TrendingUp).toBeDefined()
      expect(iconRegistry.TrendingDown).toBeDefined()
    })
  })

  describe('getIcon', () => {
    it('returns the correct icon for a known name', () => {
      const icon = getIcon('Server')
      expect(icon).toBe(iconRegistry.Server)
    })

    it('returns HelpCircle for unknown icon names', () => {
      const icon = getIcon('NonExistentIcon')
      expect(icon).toBe(iconRegistry.HelpCircle)
    })

    it('returns HelpCircle for empty string', () => {
      const icon = getIcon('')
      expect(icon).toBe(iconRegistry.HelpCircle)
    })

    it('is case-sensitive (lowercase fails)', () => {
      const icon = getIcon('server')
      expect(icon).toBe(iconRegistry.HelpCircle)
    })

    it('returns correct icon for all PascalCase lookups', () => {
      const testCases = ['Cpu', 'Globe', 'Shield', 'Lock', 'Cloud']
      for (const name of testCases) {
        expect(getIcon(name)).toBe(iconRegistry[name])
      }
    })
  })
})
