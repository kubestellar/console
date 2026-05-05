import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shortenClusterName, exportFullReport } from '../BlueprintReport'
import type { MissionControlState } from '../types'

describe('BlueprintReport', () => {
  describe('shortenClusterName', () => {
    it('strips context prefix', () => {
      expect(shortenClusterName('default/my-cluster')).toBe('my-cluster')
      expect(shortenClusterName('kind-kind/cluster-1')).toBe('cluster-1')
    })

    it('shortens very long names by taking segments', () => {
      const longName = 'default/api-fmaas-platform-eval-fmaas-res-2024'
      // Expected: api-fmaas-platform (first 3 segments)
      expect(shortenClusterName(longName)).toBe('api-fmaas-platform')
    })

    it('truncates with ellipsis if no segments are found', () => {
      const longUnderscoreName = 'default/thisisareallylongclusternamewithoutanysegments'
      expect(shortenClusterName(longUnderscoreName)).toBe('thisisareallylongclust…')
    })

    it('returns original name if it is short enough', () => {
      expect(shortenClusterName('my-cluster')).toBe('my-cluster')
    })
  })

  describe('exportFullReport', () => {
    const mockState: MissionControlState = {
      title: 'Report Mission',
      description: 'Desc',
      projects: [],
      assignments: [],
      phases: [],
      deployMode: 'phased',
      phase: 'blueprint',
    }

    beforeEach(() => {
      vi.spyOn(window, 'open').mockReturnValue({
        document: {
          write: vi.fn(),
          close: vi.fn(),
        },
      } as unknown as Window & typeof globalThis)

      // Mock XMLSerializer which might not be in all environments
      vi.stubGlobal('XMLSerializer', class {
        serializeToString = vi.fn().mockReturnValue('<svg></svg>')
      })
    })

    it('calls window.open and writes HTML', () => {
      const svgRef: React.RefObject<HTMLDivElement> = { current: document.createElement('div') }
      
      exportFullReport(mockState, mockState, new Set(), null, svgRef)
      
      expect(window.open).toHaveBeenCalledWith('', '_blank')
      const openedWindow = (window.open as unknown as { mock: { results: Array<{ value: Window }> } }).mock.results[0].value
      expect(openedWindow.document.write).toHaveBeenCalledWith(expect.stringContaining('Report Mission'))
      expect(openedWindow.document.write).toHaveBeenCalledWith(expect.stringContaining('<h1>Flight Plan: Report Mission</h1>'))
    })
  })
})
