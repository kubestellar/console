import { describe, it, expect } from 'vitest'
import {
  PURPLE_600, BLUE_500, GREEN_500, AMBER_500, RED_500, VIOLET_500,
  CYAN_500, LIME_500, ORANGE_500, PINK_500, TEAL_500, INDIGO_500,
  YELLOW_500, GREEN_500_BRIGHT,
  CLUSTER_CHART_PALETTE, CROSS_CLUSTER_EVENT_PALETTE, GPU_TYPE_CHART_PALETTE,
  GPU_FREE_AREA_COLOR,
  METRIC_CPU_COLOR, METRIC_MEMORY_COLOR, METRIC_PODS_COLOR, METRIC_NODES_COLOR,
  OVERLOADED_COLOR, BALANCED_COLOR, UNDERLOADED_COLOR, AVERAGE_LINE_COLOR,
  KUBEBERT_TILE_UNVISITED, KUBEBERT_TILE_VISITED, KUBEBERT_TILE_TARGET,
  KUBEBERT_PLAYER, KUBEBERT_ENEMY_COILY, KUBEBERT_ENEMY_BALL, KUBEBERT_BG,
  KAGENT_RUNTIME_PYTHON, KAGENT_RUNTIME_GO, KAGENT_RUNTIME_BYO,
  KAGENT_EDGE_AGENT_TOOL, KAGENT_EDGE_AGENT_MODEL,
  hexToRgba,
} from '../chartColors'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

describe('chartColors', () => {
  describe('base palette exports', () => {
    const palette = [
      PURPLE_600, BLUE_500, GREEN_500, AMBER_500, RED_500, VIOLET_500,
      CYAN_500, LIME_500, ORANGE_500, PINK_500, TEAL_500, INDIGO_500,
      YELLOW_500, GREEN_500_BRIGHT,
    ]

    it('all base colors are valid hex strings', () => {
      for (const color of palette) {
        expect(color).toMatch(HEX_COLOR_RE)
      }
    })
  })

  describe('chart palettes', () => {
    it('CLUSTER_CHART_PALETTE has entries', () => {
      expect(CLUSTER_CHART_PALETTE.length).toBeGreaterThan(0)
      for (const c of CLUSTER_CHART_PALETTE) expect(c).toMatch(HEX_COLOR_RE)
    })

    it('CROSS_CLUSTER_EVENT_PALETTE has entries', () => {
      expect(CROSS_CLUSTER_EVENT_PALETTE.length).toBeGreaterThan(0)
      for (const c of CROSS_CLUSTER_EVENT_PALETTE) expect(c).toMatch(HEX_COLOR_RE)
    })

    it('GPU_TYPE_CHART_PALETTE has entries', () => {
      expect(GPU_TYPE_CHART_PALETTE.length).toBeGreaterThan(0)
      for (const c of GPU_TYPE_CHART_PALETTE) expect(c).toMatch(HEX_COLOR_RE)
    })
  })

  describe('semantic color aliases', () => {
    it('metric colors are valid hex', () => {
      expect(METRIC_CPU_COLOR).toMatch(HEX_COLOR_RE)
      expect(METRIC_MEMORY_COLOR).toMatch(HEX_COLOR_RE)
      expect(METRIC_PODS_COLOR).toMatch(HEX_COLOR_RE)
      expect(METRIC_NODES_COLOR).toMatch(HEX_COLOR_RE)
    })

    it('load balancer colors are valid hex', () => {
      expect(OVERLOADED_COLOR).toMatch(HEX_COLOR_RE)
      expect(BALANCED_COLOR).toMatch(HEX_COLOR_RE)
      expect(UNDERLOADED_COLOR).toMatch(HEX_COLOR_RE)
      expect(AVERAGE_LINE_COLOR).toMatch(HEX_COLOR_RE)
    })

    it('GPU free area color is valid hex', () => {
      expect(GPU_FREE_AREA_COLOR).toMatch(HEX_COLOR_RE)
    })
  })

  describe('KubeBert game colors', () => {
    it('all game colors are valid hex', () => {
      const gameColors = [
        KUBEBERT_TILE_UNVISITED, KUBEBERT_TILE_VISITED, KUBEBERT_TILE_TARGET,
        KUBEBERT_PLAYER, KUBEBERT_ENEMY_COILY, KUBEBERT_ENEMY_BALL, KUBEBERT_BG,
      ]
      for (const c of gameColors) expect(c).toMatch(HEX_COLOR_RE)
    })
  })

  describe('KAgent colors', () => {
    it('all kagent colors are valid hex', () => {
      const kagentColors = [
        KAGENT_RUNTIME_PYTHON, KAGENT_RUNTIME_GO, KAGENT_RUNTIME_BYO,
        KAGENT_EDGE_AGENT_TOOL, KAGENT_EDGE_AGENT_MODEL,
      ]
      for (const c of kagentColors) expect(c).toMatch(HEX_COLOR_RE)
    })
  })

  describe('hexToRgba', () => {
    it('converts a hex color to rgba', () => {
      expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)')
      expect(hexToRgba('#00ff00', 1)).toBe('rgba(0,255,0,1)')
      expect(hexToRgba('#0000ff', 0)).toBe('rgba(0,0,255,0)')
    })

    it('handles mixed hex values', () => {
      expect(hexToRgba('#9333ea', 0.8)).toBe('rgba(147,51,234,0.8)')
    })

    it('returns raw hex for invalid input', () => {
      expect(hexToRgba('invalid', 0.5)).toBe('invalid')
    })
  })
})
