/**
 * Unit tests for src/lib/a11y/skipLinks.ts
 *
 * Tests the accessibility skip-link utilities (WCAG 2.4.1):
 * - DEFAULT_SKIP_LINKS constant structure
 * - focusTarget: DOM element focusing with tabindex handling
 * - SKIP_LINK_STYLES: style objects for visually-hidden + focused states
 * - getSkipLinkClassName: class name accessor
 * - injectSkipLinkStyles: idempotent style injection into document head
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_SKIP_LINKS,
  focusTarget,
  SKIP_LINK_STYLES,
  getSkipLinkClassName,
  injectSkipLinkStyles,
} from '../skipLinks'

describe('skipLinks — accessibility utilities', () => {
  // ─── DEFAULT_SKIP_LINKS ────────────────────────────────────────────────────

  describe('DEFAULT_SKIP_LINKS', () => {
    it('provides exactly 3 default skip links', () => {
      expect(DEFAULT_SKIP_LINKS).toHaveLength(3)
    })

    it('includes skip-to-main as first link', () => {
      expect(DEFAULT_SKIP_LINKS[0]).toEqual({
        id: 'skip-to-main',
        label: 'Skip to main content',
        targetId: 'main-content',
      })
    })

    it('includes skip-to-nav and skip-to-search', () => {
      const ids = DEFAULT_SKIP_LINKS.map((l) => l.id)
      expect(ids).toContain('skip-to-nav')
      expect(ids).toContain('skip-to-search')
    })

    it('has unique IDs and target IDs', () => {
      const ids = DEFAULT_SKIP_LINKS.map((l) => l.id)
      const targetIds = DEFAULT_SKIP_LINKS.map((l) => l.targetId)
      expect(new Set(ids).size).toBe(ids.length)
      expect(new Set(targetIds).size).toBe(targetIds.length)
    })
  })

  // ─── focusTarget ───────────────────────────────────────────────────────────

  describe('focusTarget', () => {
    let container: HTMLDivElement

    beforeEach(() => {
      container = document.createElement('div')
      document.body.appendChild(container)
    })

    afterEach(() => {
      document.body.removeChild(container)
    })

    it('returns false when element does not exist', () => {
      expect(focusTarget('nonexistent-id')).toBe(false)
    })

    it('focuses the target element and returns true', () => {
      const el = document.createElement('div')
      el.id = 'test-target'
      container.appendChild(el)

      const result = focusTarget('test-target')

      expect(result).toBe(true)
      expect(document.activeElement).toBe(el)
    })

    it('adds tabindex=-1 if element lacks tabindex', () => {
      const el = document.createElement('section')
      el.id = 'section-target'
      container.appendChild(el)

      focusTarget('section-target')

      expect(el.getAttribute('tabindex')).toBe('-1')
    })

    it('does not override existing tabindex', () => {
      const el = document.createElement('button')
      el.id = 'btn-target'
      el.setAttribute('tabindex', '0')
      container.appendChild(el)

      focusTarget('btn-target')

      expect(el.getAttribute('tabindex')).toBe('0')
    })
  })

  // ─── SKIP_LINK_STYLES ─────────────────────────────────────────────────────

  describe('SKIP_LINK_STYLES', () => {
    it('has base style that hides element off-screen', () => {
      expect(SKIP_LINK_STYLES.base.position).toBe('absolute')
      expect(SKIP_LINK_STYLES.base.left).toBe('-9999px')
      expect(SKIP_LINK_STYLES.base.overflow).toBe('hidden')
      expect(SKIP_LINK_STYLES.base.zIndex).toBe(-1)
    })

    it('has focused style that positions element visibly', () => {
      expect(SKIP_LINK_STYLES.focused.position).toBe('fixed')
      expect(SKIP_LINK_STYLES.focused.zIndex).toBe(9999)
      expect(SKIP_LINK_STYLES.focused.overflow).toBe('visible')
      expect(SKIP_LINK_STYLES.focused.width).toBe('auto')
      expect(SKIP_LINK_STYLES.focused.height).toBe('auto')
    })

    it('focused style has accessible colors (light text on dark bg)', () => {
      expect(SKIP_LINK_STYLES.focused.backgroundColor).toBe('#1e293b')
      expect(SKIP_LINK_STYLES.focused.color).toBe('#f8fafc')
    })
  })

  // ─── getSkipLinkClassName ──────────────────────────────────────────────────

  describe('getSkipLinkClassName', () => {
    it('returns the skip-link class name string', () => {
      expect(getSkipLinkClassName()).toBe('skip-link')
    })
  })

  // ─── injectSkipLinkStyles ──────────────────────────────────────────────────

  describe('injectSkipLinkStyles', () => {
    afterEach(() => {
      const el = document.getElementById('a11y-skip-link-styles')
      if (el) el.remove()
    })

    it('injects a <style> element into document head', () => {
      injectSkipLinkStyles()

      const style = document.getElementById('a11y-skip-link-styles')
      expect(style).not.toBeNull()
      expect(style?.tagName.toLowerCase()).toBe('style')
    })

    it('style element contains .skip-link class definition', () => {
      injectSkipLinkStyles()

      const style = document.getElementById('a11y-skip-link-styles')
      expect(style?.textContent).toContain('.skip-link')
      expect(style?.textContent).toContain('.skip-link:focus')
    })

    it('is idempotent — second call does not add duplicate', () => {
      injectSkipLinkStyles()
      injectSkipLinkStyles()

      const styles = document.querySelectorAll('#a11y-skip-link-styles')
      expect(styles).toHaveLength(1)
    })
  })
})
