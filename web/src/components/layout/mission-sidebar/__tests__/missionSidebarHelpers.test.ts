import { describe, expect, it, vi } from 'vitest'
import type { Mission } from '../../../../hooks/useMissions'
import type { Resolution } from '../../../../hooks/useResolutions'
import type { MissionExport } from '../../../../lib/missions/types'
import {
  handleApplyResolution,
  handleRollback,
  savedMissionToExport,
} from '../missionSidebarHelpers'

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Test Mission',
    description: 'A test mission',
    type: 'custom',
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    ...overrides,
  } as Mission
}

function makeResolution(overrides: Partial<Resolution> = {}): Resolution {
  return {
    id: 'res-1',
    title: 'Fix pod crash',
    resolution: {
      summary: 'Increase memory limits',
      steps: ['Check pod logs', 'Update resource limits'],
    },
    ...overrides,
  } as Resolution
}

describe('missionSidebarHelpers', () => {
  describe('handleApplyResolution', () => {
    it('does nothing when activeMission is null', () => {
      const sendMessage = vi.fn()
      handleApplyResolution(null, makeResolution(), sendMessage)
      expect(sendMessage).not.toHaveBeenCalled()
    })

    it('does nothing for non-appliable statuses', () => {
      const sendMessage = vi.fn()
      const blockedStatuses = ['blocked', 'pending', 'cancelling', 'running'] as const

      for (const status of blockedStatuses) {
        const mission = makeMission({ status: status as Mission['status'] })
        handleApplyResolution(mission, makeResolution(), sendMessage)
      }

      expect(sendMessage).not.toHaveBeenCalled()
    })

    it('sends a message for appliable mission statuses', () => {
      const sendMessage = vi.fn()
      const mission = makeMission({ status: 'waiting_input' })

      handleApplyResolution(mission, makeResolution(), sendMessage)

      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(sendMessage).toHaveBeenCalledWith('mission-1', expect.stringContaining('Fix pod crash'))
    })

    it('includes resolution steps in the message', () => {
      const sendMessage = vi.fn()
      const mission = makeMission({ status: 'waiting_input' })
      const resolution = makeResolution({
        resolution: {
          summary: 'Increase memory',
          steps: ['Step one', 'Step two'],
        },
      })

      handleApplyResolution(mission, resolution, sendMessage)

      const message = sendMessage.mock.calls[0][1]
      expect(message).toContain('1. Step one')
      expect(message).toContain('2. Step two')
    })

    it('includes YAML block when resolution has yaml', () => {
      const sendMessage = vi.fn()
      const mission = makeMission({ status: 'waiting_input' })
      const resolution = makeResolution({
        resolution: {
          summary: 'Apply manifest',
          steps: [],
          yaml: 'apiVersion: v1\nkind: Pod',
        },
      })

      handleApplyResolution(mission, resolution, sendMessage)

      const message = sendMessage.mock.calls[0][1]
      expect(message).toContain('```yaml')
      expect(message).toContain('apiVersion: v1')
    })

    it('omits steps section when steps array is empty', () => {
      const sendMessage = vi.fn()
      const mission = makeMission({ status: 'waiting_input' })
      const resolution = makeResolution({
        resolution: {
          summary: 'Simple fix',
          steps: [],
        },
      })

      handleApplyResolution(mission, resolution, sendMessage)

      const message = sendMessage.mock.calls[0][1]
      expect(message).not.toContain('Steps:')
    })
  })

  describe('handleRollback', () => {
    it('calls startMission with rollback prompt', () => {
      const mission = makeMission({
        title: 'Deploy Redis',
        status: 'failed' as Mission['status'],
        cluster: 'prod-cluster',
        messages: [
          { role: 'assistant', content: 'Installing Redis operator...' },
          { role: 'user', content: 'proceed' },
          { role: 'assistant', content: 'Applied CRDs and StatefulSet' },
        ],
      })
      const startMission = vi.fn()
      const openSidebar = vi.fn()

      handleRollback(mission as Mission, startMission, openSidebar)

      expect(startMission).toHaveBeenCalledTimes(1)
      const params = startMission.mock.calls[0][0]
      expect(params.title).toBe('Rollback: Deploy Redis')
      expect(params.type).toBe('repair')
      expect(params.cluster).toBe('prod-cluster')
      expect(params.initialPrompt).toContain('Deploy Redis')
      expect(params.initialPrompt).toContain('Installing Redis operator')
    })

    it('opens the sidebar after starting rollback', () => {
      const mission = makeMission({ messages: [] })
      const startMission = vi.fn()
      const openSidebar = vi.fn()

      handleRollback(mission as Mission, startMission, openSidebar)

      expect(openSidebar).toHaveBeenCalledTimes(1)
    })

    it('filters out user messages from rollback prompt', () => {
      const mission = makeMission({
        messages: [
          { role: 'user', content: 'do the thing' },
          { role: 'assistant', content: 'Doing the thing' },
        ],
      })
      const startMission = vi.fn()

      handleRollback(mission as Mission, startMission, vi.fn())

      const prompt = startMission.mock.calls[0][0].initialPrompt
      expect(prompt).toContain('Doing the thing')
      expect(prompt).not.toContain('do the thing')
    })

    it('omits cluster from params when mission has no cluster', () => {
      const mission = makeMission({ cluster: undefined, messages: [] })
      const startMission = vi.fn()

      handleRollback(mission as Mission, startMission, vi.fn())

      const prompt = startMission.mock.calls[0][0].initialPrompt
      expect(prompt).not.toContain('Cluster:')
    })
  })

  describe('savedMissionToExport', () => {
    it('converts a basic mission to export format', () => {
      const mission = makeMission({
        title: 'Install Linkerd',
        description: 'Deploy Linkerd service mesh',
        type: 'deploy',
      })

      const exported = savedMissionToExport(mission)

      expect(exported.version).toBe('1.0')
      expect(exported.title).toBe('Install Linkerd')
      expect(exported.description).toBe('Deploy Linkerd service mesh')
      expect(exported.type).toBe('deploy')
      expect(exported.tags).toEqual([])
    })

    it('prefers importedFrom fields when available', () => {
      const mission = makeMission({
        title: 'Local title',
        description: 'Local description',
        importedFrom: {
          title: 'Original title',
          description: 'Original description',
          tags: ['networking', 'cncf'],
          missionClass: 'install',
          cncfProject: 'linkerd',
          steps: [{ title: 'Step 1', description: 'Do step 1' }],
        },
      })

      const exported = savedMissionToExport(mission as Mission)

      expect(exported.title).toBe('Original title')
      expect(exported.description).toBe('Original description')
      expect(exported.tags).toEqual(['networking', 'cncf'])
      expect(exported.missionClass).toBe('install')
      expect(exported.cncfProject).toBe('linkerd')
      expect(exported.steps).toEqual([{ title: 'Step 1', description: 'Do step 1' }])
    })

    it('returns empty tags and steps when importedFrom has none', () => {
      const mission = makeMission({
        importedFrom: {
          title: 'Imported',
          description: 'Imported desc',
          tags: undefined,
          steps: undefined,
        },
      })

      const exported = savedMissionToExport(mission as Mission)

      expect(exported.tags).toEqual(undefined)
      expect(exported.steps).toEqual([])
    })
  })
})
