import { describe, it, expect, beforeEach } from 'vitest'
import {
  setActiveProject,
  getActiveProject,
  isVisibleForProject,
} from '../context'

describe('project/context', () => {
  beforeEach(() => {
    // Reset to default
    setActiveProject('kubestellar')
  })

  describe('setActiveProject / getActiveProject', () => {
    it('sets and gets the active project', () => {
      setActiveProject('llm-d')
      expect(getActiveProject()).toBe('llm-d')
    })

    it('defaults to kubestellar when empty string is provided', () => {
      setActiveProject('')
      expect(getActiveProject()).toBe('kubestellar')
    })

    it('returns kubestellar by default', () => {
      setActiveProject('kubestellar')
      expect(getActiveProject()).toBe('kubestellar')
    })

    it('can set custom project names', () => {
      setActiveProject('my-custom-project')
      expect(getActiveProject()).toBe('my-custom-project')
    })
  })

  describe('isVisibleForProject', () => {
    it('returns true when projects is undefined (universal)', () => {
      expect(isVisibleForProject(undefined)).toBe(true)
    })

    it('returns true when projects is empty array (universal)', () => {
      expect(isVisibleForProject([])).toBe(true)
    })

    it('returns true when projects contains wildcard *', () => {
      expect(isVisibleForProject(['*'])).toBe(true)
      expect(isVisibleForProject(['llm-d', '*'])).toBe(true)
    })

    it('returns true when active project is in the projects list', () => {
      setActiveProject('kubestellar')
      expect(isVisibleForProject(['kubestellar', 'llm-d'])).toBe(true)
    })

    it('returns false when active project is not in the projects list', () => {
      setActiveProject('kubestellar')
      expect(isVisibleForProject(['llm-d', 'custom'])).toBe(false)
    })

    it('accepts an explicit project parameter', () => {
      expect(isVisibleForProject(['llm-d'], 'llm-d')).toBe(true)
      expect(isVisibleForProject(['llm-d'], 'kubestellar')).toBe(false)
    })

    it('explicit project parameter overrides active project', () => {
      setActiveProject('kubestellar')
      expect(isVisibleForProject(['llm-d'], 'llm-d')).toBe(true)
    })

    it('wildcard works with explicit project parameter', () => {
      expect(isVisibleForProject(['*'], 'any-project')).toBe(true)
    })

    it('returns true for single matching project', () => {
      setActiveProject('llm-d')
      expect(isVisibleForProject(['llm-d'])).toBe(true)
    })

    it('returns false for single non-matching project', () => {
      setActiveProject('kubestellar')
      expect(isVisibleForProject(['llm-d'])).toBe(false)
    })
  })
})
