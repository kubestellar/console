import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RefObject } from 'react'
import { shortenClusterName, exportFullReport } from '../BlueprintReport'
import type { MissionControlState } from '../types'

describe('BlueprintReport', () => {
  let mockDocument: { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }

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
      mockDocument = {
        write: vi.fn(),
        close: vi.fn(),
      }

      vi.spyOn(window, 'open').mockReturnValue({
        document: mockDocument,
      } as unknown as Window)

      // Mock XMLSerializer which might not be in all environments
      vi.stubGlobal('XMLSerializer', class {
        serializeToString = vi.fn().mockReturnValue('<svg></svg>')
      })
    })

    it('calls window.open and writes HTML', () => {
      const svgRef: RefObject<HTMLDivElement | null> = { current: document.createElement('div') }
      
      exportFullReport(mockState, mockState, new Set(), null, svgRef)
      
      expect(window.open).toHaveBeenCalledWith('', '_blank')
      expect(mockDocument.write).toHaveBeenCalledWith(expect.stringContaining('Report Mission'))
      expect(mockDocument.write).toHaveBeenCalledWith(expect.stringContaining('<h1>Flight Plan: Report Mission</h1>'))
    })
  })
})
