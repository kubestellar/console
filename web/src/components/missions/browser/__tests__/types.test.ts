/**
 * browser/types.ts unit tests
 *
 * Verifies type definitions and constants.
 */

import { describe, it, expect } from 'vitest'
import { BROWSER_TABS } from '../types'
import type { TreeNode, ViewMode, BrowserTab } from '../types'

describe('browser/types', () => {
  describe('BROWSER_TABS', () => {
    it('contains all expected tabs', () => {
      expect(BROWSER_TABS).toHaveLength(4)
      
      const ids = BROWSER_TABS.map(tab => tab.id)
      expect(ids).toContain('recommended')
      expect(ids).toContain('installers')
      expect(ids).toContain('fixes')
      expect(ids).toContain('schedule')
    })

    it('each tab has required properties', () => {
      BROWSER_TABS.forEach(tab => {
        expect(tab).toHaveProperty('id')
        expect(tab).toHaveProperty('label')
        expect(tab).toHaveProperty('icon')
        
        expect(typeof tab.id).toBe('string')
        expect(typeof tab.label).toBe('string')
        expect(typeof tab.icon).toBe('string')
      })
    })

    it('recommended tab has correct properties', () => {
      const recommendedTab = BROWSER_TABS.find(tab => tab.id === 'recommended')
      expect(recommendedTab).toBeDefined()
      expect(recommendedTab?.label).toBe('Recommended')
    })

    it('installers tab has correct properties', () => {
      const installersTab = BROWSER_TABS.find(tab => tab.id === 'installers')
      expect(installersTab).toBeDefined()
      expect(installersTab?.label).toBe('Installers')
    })

    it('fixes tab has correct properties', () => {
      const fixesTab = BROWSER_TABS.find(tab => tab.id === 'fixes')
      expect(fixesTab).toBeDefined()
      expect(fixesTab?.label).toBe('Fixes')
    })

    it('schedule tab has correct properties', () => {
      const scheduleTab = BROWSER_TABS.find(tab => tab.id === 'schedule')
      expect(scheduleTab).toBeDefined()
      expect(scheduleTab?.label).toBe('Schedule Action')
    })
  })

  describe('TreeNode type', () => {
    it('accepts valid file node', () => {
      const fileNode: TreeNode = {
        id: 'file-1',
        name: 'mission.yaml',
        path: '/root/mission.yaml',
        type: 'file',
        source: 'community',
      }
      
      expect(fileNode.type).toBe('file')
      expect(fileNode.source).toBe('community')
    })

    it('accepts valid directory node', () => {
      const dirNode: TreeNode = {
        id: 'dir-1',
        name: 'configs',
        path: '/root/configs',
        type: 'directory',
        source: 'github',
        children: [],
      }
      
      expect(dirNode.type).toBe('directory')
      expect(dirNode.source).toBe('github')
    })

    it('accepts node with optional properties', () => {
      const fullNode: TreeNode = {
        id: 'full-1',
        name: 'test',
        path: '/test',
        type: 'directory',
        source: 'local',
        loaded: true,
        loading: false,
        description: 'Test node',
        isEmpty: false,
        content: 'cached content',
        repoOwner: 'owner',
        repoName: 'repo',
        infoTooltip: 'Info text',
      }
      
      expect(fullNode.loaded).toBe(true)
      expect(fullNode.description).toBe('Test node')
      expect(fullNode.repoOwner).toBe('owner')
    })
  })

  describe('ViewMode type', () => {
    it('accepts grid view mode', () => {
      const mode: ViewMode = 'grid'
      expect(mode).toBe('grid')
    })

    it('accepts list view mode', () => {
      const mode: ViewMode = 'list'
      expect(mode).toBe('list')
    })
  })

  describe('BrowserTab type', () => {
    it('accepts all valid tab values', () => {
      const tabs: BrowserTab[] = ['recommended', 'installers', 'fixes', 'schedule']
      tabs.forEach(tab => {
        expect(BROWSER_TABS.map(t => t.id)).toContain(tab)
      })
    })
  })
})
