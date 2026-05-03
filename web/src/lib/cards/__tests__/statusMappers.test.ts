import { describe, it, expect } from 'vitest'
import {
  gatewayStatusIcons,
  gatewayStatusColors,
  crdStatusIcons,
  crdStatusColors,
  helmStatusIcons,
  helmStatusColors,
  operatorStatusIcons,
  operatorStatusColors,
  createStatusMappers,
} from '../statusMappers'

describe('statusMappers', () => {
  describe('gatewayStatusIcons', () => {
    it('maps all expected statuses', () => {
      expect(gatewayStatusIcons['Programmed']).toBeDefined()
      expect(gatewayStatusIcons['Accepted']).toBeDefined()
      expect(gatewayStatusIcons['Pending']).toBeDefined()
      expect(gatewayStatusIcons['NotAccepted']).toBeDefined()
      expect(gatewayStatusIcons['Unknown']).toBeDefined()
    })
  })

  describe('gatewayStatusColors', () => {
    it('returns color configs with bg, text, border', () => {
      for (const status of ['Programmed', 'Accepted', 'Pending', 'NotAccepted', 'Unknown']) {
        const c = gatewayStatusColors[status]
        expect(c.bg).toBeTruthy()
        expect(c.text).toBeTruthy()
        expect(c.border).toBeTruthy()
      }
    })
  })

  describe('crdStatusIcons', () => {
    it('maps CRD statuses', () => {
      expect(crdStatusIcons['Established']).toBeDefined()
      expect(crdStatusIcons['NotEstablished']).toBeDefined()
      expect(crdStatusIcons['Terminating']).toBeDefined()
    })
  })

  describe('crdStatusColors', () => {
    it('maps CRD status to simple color names', () => {
      expect(crdStatusColors['Established']).toBe('green')
      expect(crdStatusColors['NotEstablished']).toBe('red')
      expect(crdStatusColors['Terminating']).toBe('orange')
    })
  })

  describe('helmStatusIcons', () => {
    it('maps Helm statuses', () => {
      expect(helmStatusIcons['Deployed']).toBeDefined()
      expect(helmStatusIcons['Failed']).toBeDefined()
      expect(helmStatusIcons['Pending']).toBeDefined()
    })
  })

  describe('helmStatusColors', () => {
    it('returns color configs for all Helm statuses', () => {
      for (const status of ['Deployed', 'Superseded', 'Failed', 'Pending', 'Unknown']) {
        const c = helmStatusColors[status]
        expect(c.bg).toBeTruthy()
        expect(c.text).toBeTruthy()
        expect(c.border).toBeTruthy()
      }
    })
  })

  describe('operatorStatusIcons + operatorStatusColors', () => {
    it('maps operator statuses', () => {
      for (const s of ['Running', 'Failed', 'Unknown', 'Pending']) {
        expect(operatorStatusIcons[s]).toBeDefined()
        expect(operatorStatusColors[s]).toBeDefined()
      }
    })
  })

  describe('createStatusMappers', () => {
    it('returns getIcon and getColor functions', () => {
      const mappers = createStatusMappers(
        gatewayStatusIcons as Record<string, typeof gatewayStatusIcons[string]>,
        gatewayStatusColors as Record<string, typeof gatewayStatusColors[string]>,
      )
      expect(typeof mappers.getIcon).toBe('function')
      expect(typeof mappers.getColor).toBe('function')
    })

    it('getIcon returns mapped icon for known status', () => {
      const mappers = createStatusMappers(
        gatewayStatusIcons as Record<string, typeof gatewayStatusIcons[string]>,
        gatewayStatusColors as Record<string, typeof gatewayStatusColors[string]>,
      )
      expect(mappers.getIcon('Programmed')).toBe(gatewayStatusIcons['Programmed'])
    })

    it('getColor returns mapped color for known status', () => {
      const mappers = createStatusMappers(
        gatewayStatusIcons as Record<string, typeof gatewayStatusIcons[string]>,
        gatewayStatusColors as Record<string, typeof gatewayStatusColors[string]>,
      )
      expect(mappers.getColor('Pending')).toBe(gatewayStatusColors['Pending'])
    })

    it('returns default icon and color for unknown status', () => {
      const mappers = createStatusMappers(
        gatewayStatusIcons as Record<string, typeof gatewayStatusIcons[string]>,
        gatewayStatusColors as Record<string, typeof gatewayStatusColors[string]>,
      )
      const icon = mappers.getIcon('nonexistent')
      const color = mappers.getColor('nonexistent')
      expect(icon).toBeDefined()
      expect(color.bg).toBeTruthy()
    })
  })
})
