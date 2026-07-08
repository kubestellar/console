import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NODE_POSITIONS, CONNECTIONS, COLORS, PremiumNode } from '../LLMdFlowNodes'

vi.mock('framer-motion', () => ({
  motion: {
    circle: ({ children, ...props }: any) => <circle {...props}>{children}</circle>,
    path: ({ children, ...props }: any) => <path {...props}>{children}</path>,
    g: ({ children, ...props }: any) => <g {...props}>{children}</g>,
  },
}))

vi.mock('./shared/colorUtils', () => ({
  getLoadColors: (load: number) => ({
    start: '#f59e0b',
    end: '#ef4444',
    glow: '#f59e0b',
  }),
  getHorseshoeColor: (value: number) => '#22c55e',
}))

describe('LLMdFlowNodes', () => {
  describe('NODE_POSITIONS', () => {
    it('has positions for all expected nodes', () => {
      expect(NODE_POSITIONS.client).toBeDefined()
      expect(NODE_POSITIONS.gateway).toBeDefined()
      expect(NODE_POSITIONS.epp).toBeDefined()
      expect(NODE_POSITIONS.prefill0).toBeDefined()
      expect(NODE_POSITIONS.decode0).toBeDefined()
    })

    it('positions have x and y coordinates', () => {
      expect(NODE_POSITIONS.client.x).toBeGreaterThanOrEqual(0)
      expect(NODE_POSITIONS.client.y).toBeGreaterThanOrEqual(0)
    })
  })

  describe('CONNECTIONS', () => {
    it('has expected connections', () => {
      expect(CONNECTIONS.length).toBeGreaterThan(0)
    })

    it('each connection has required fields', () => {
      CONNECTIONS.forEach(conn => {
        expect(conn.from).toBeDefined()
        expect(conn.to).toBeDefined()
        expect(conn.type).toBeDefined()
        expect(conn.trafficPercent).toBeGreaterThanOrEqual(0)
      })
    })

    it('traffic percentages are valid', () => {
      CONNECTIONS.forEach(conn => {
        expect(conn.trafficPercent).toBeGreaterThanOrEqual(0)
        expect(conn.trafficPercent).toBeLessThanOrEqual(100)
      })
    })
  })

  describe('COLORS', () => {
    it('has colors for connection types', () => {
      expect(COLORS.prefill).toBeDefined()
      expect(COLORS.decode).toBeDefined()
      expect(COLORS['kv-transfer']).toBeDefined()
    })

    it('colors are hex strings', () => {
      expect(COLORS.prefill).toMatch(/^#[0-9a-f]{6}$/i)
      expect(COLORS.decode).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  describe('PremiumNode', () => {
    it('renders without crashing', () => {
      const { container } = render(
        <svg>
          <PremiumNode
            id="client"
            label="Client"
            nodeColor="#3b82f6"
            uniqueId="test-client"
            nodePositions={NODE_POSITIONS}
          />
        </svg>
      )
      expect(container.querySelector('circle')).toBeTruthy()
    })

    it('returns null for unknown node id', () => {
      const { container } = render(
        <svg>
          <PremiumNode
            id="unknown"
            label="Unknown"
            nodeColor="#3b82f6"
            uniqueId="test-unknown"
            nodePositions={NODE_POSITIONS}
          />
        </svg>
      )
      expect(container.querySelector('circle')).toBeNull()
    })

    it('renders with metrics', () => {
      const { container } = render(
        <svg>
          <PremiumNode
            id="prefill0"
            label="Prefill 0"
            metrics={{ load: 75, queueDepth: 10 }}
            nodeColor="#9333ea"
            uniqueId="test-prefill"
            nodePositions={NODE_POSITIONS}
          />
        </svg>
      )
      expect(container.querySelector('circle')).toBeTruthy()
    })
  })
})
