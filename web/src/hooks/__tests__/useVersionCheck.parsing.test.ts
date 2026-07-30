import { describe, it, expect } from 'vitest'
import {
    parseReleaseTag,
    parseRelease,
    getLatestForChannel,
    isDevVersion,
    isNewerVersion,
} from '../useVersionCheck'
import { makeGitHubRelease, makeParsedRelease } from './useVersionCheck.helpers'

describe('parseReleaseTag', () => {
    it('parses a nightly tag', () => {
        const result = parseReleaseTag('v0.0.1-nightly.20250124')
        expect(result.type).toBe('nightly')
        expect(result.date).toBe('20250124')
    })

    it('parses a weekly tag', () => {
        const result = parseReleaseTag('v0.0.1-weekly.20250124')
        expect(result.type).toBe('weekly')
        expect(result.date).toBe('20250124')
    })

    it('parses a three-part semver stable tag v1.2.3', () => {
        const result = parseReleaseTag('v1.2.3')
        expect(result.type).toBe('stable')
        expect(result.date).toBeNull()
    })

    it('parses a three-part semver stable tag v0.3.11', () => {
        const result = parseReleaseTag('v0.3.11')
        expect(result.type).toBe('stable')
        expect(result.date).toBeNull()
    })

    it('defaults unrecognised tags to stable with null date', () => {
        const result = parseReleaseTag('totally-invalid-tag')
        expect(result.type).toBe('stable')
        expect(result.date).toBeNull()
    })

    it('parses nightly tag with extra version parts', () => {
        const result = parseReleaseTag('v0.3.11-nightly.20260218')
        expect(result.type).toBe('nightly')
        expect(result.date).toBe('20260218')
    })
})


describe('parseRelease', () => {
    it('maps all GitHubRelease fields to ParsedRelease', () => {
        const raw = makeGitHubRelease({
            tag_name: 'v2.0.0',
            name: 'v2.0.0',
            body: 'Some notes',
            published_at: '2025-06-01T12:00:00Z',
            html_url: 'https://github.com/kubestellar/console/releases/tag/v2.0.0',
        })
        const parsed = parseRelease(raw)
        expect(parsed.tag).toBe('v2.0.0')
        expect(parsed.version).toBe('v2.0.0')
        expect(parsed.type).toBe('stable')
        expect(parsed.date).toBeNull()
        expect(parsed.releaseNotes).toBe('Some notes')
        expect(parsed.url).toBe('https://github.com/kubestellar/console/releases/tag/v2.0.0')
    })

    it('returns publishedAt as a Date object', () => {
        const raw = makeGitHubRelease({ published_at: '2025-01-24T00:00:00Z' })
        const parsed = parseRelease(raw)
        expect(parsed.publishedAt).toBeInstanceOf(Date)
        expect(parsed.publishedAt.getFullYear()).toBe(2025)
    })

    it('handles empty body by using empty string for releaseNotes', () => {
        const raw = makeGitHubRelease({ body: '' })
        const parsed = parseRelease(raw)
        expect(parsed.releaseNotes).toBe('')
    })

    it('correctly identifies a nightly release type', () => {
        const raw = makeGitHubRelease({ tag_name: 'v0.3.11-nightly.20260218' })
        const parsed = parseRelease(raw)
        expect(parsed.type).toBe('nightly')
        expect(parsed.date).toBe('20260218')
    })
})


describe('getLatestForChannel', () => {
    const stableRelease = makeParsedRelease({
        tag: 'v1.2.3',
        version: 'v1.2.3',
        type: 'stable',
        publishedAt: new Date('2025-03-01'),
    })
    const olderStableRelease = makeParsedRelease({
        tag: 'v1.2.2',
        version: 'v1.2.2',
        type: 'stable',
        publishedAt: new Date('2025-01-01'),
    })
    const nightlyRelease = makeParsedRelease({
        tag: 'v0.0.1-nightly.20250124',
        version: 'v0.0.1-nightly.20250124',
        type: 'nightly',
        date: '20250124',
        publishedAt: new Date('2025-01-24'),
    })
    const newerNightlyRelease = makeParsedRelease({
        tag: 'v0.0.1-nightly.20250201',
        version: 'v0.0.1-nightly.20250201',
        type: 'nightly',
        date: '20250201',
        publishedAt: new Date('2025-02-01'),
    })

    const allReleases = [stableRelease, olderStableRelease, nightlyRelease, newerNightlyRelease]

    it('returns the latest stable release for stable channel', () => {
        const result = getLatestForChannel(allReleases, 'stable')
        expect(result).not.toBeNull()
        expect(result!.tag).toBe('v1.2.3')
    })

    it('returns the latest nightly release for unstable channel', () => {
        const result = getLatestForChannel(allReleases, 'unstable')
        expect(result).not.toBeNull()
        expect(result!.tag).toBe('v0.0.1-nightly.20250201')
    })

    it('returns null for developer channel', () => {
        const result = getLatestForChannel(allReleases, 'developer')
        expect(result).toBeNull()
    })

    it('returns null when no matching releases exist for stable channel', () => {
        const nightlyOnly = [nightlyRelease, newerNightlyRelease]
        const result = getLatestForChannel(nightlyOnly, 'stable')
        expect(result).toBeNull()
    })

    it('returns null when no matching releases exist for unstable channel', () => {
        const stableOnly = [stableRelease, olderStableRelease]
        const result = getLatestForChannel(stableOnly, 'unstable')
        expect(result).toBeNull()
    })

    it('returns null for empty releases list', () => {
        expect(getLatestForChannel([], 'stable')).toBeNull()
        expect(getLatestForChannel([], 'unstable')).toBeNull()
        expect(getLatestForChannel([], 'developer')).toBeNull()
    })
})


describe('version comparison edge cases via parseReleaseTag', () => {
    it('nightly with different base version parts', () => {
        const r1 = parseReleaseTag('v0.3.11-nightly.20260301')
        expect(r1.type).toBe('nightly')
        expect(r1.date).toBe('20260301')
    })

    it('weekly with different base version parts', () => {
        const r1 = parseReleaseTag('v1.0.0-weekly.20260101')
        expect(r1.type).toBe('weekly')
        expect(r1.date).toBe('20260101')
    })

    it('tag without v prefix is stable with null date', () => {
        const r1 = parseReleaseTag('1.0.0')
        expect(r1.type).toBe('stable')
        expect(r1.date).toBeNull()
    })

    it('tag with extra suffix defaults to stable', () => {
        const r1 = parseReleaseTag('v1.0.0-beta.1')
        expect(r1.type).toBe('stable')
        expect(r1.date).toBeNull()
    })
})


describe('isDevVersion', () => {
    it('returns true for "unknown"', () => {
        expect(isDevVersion('unknown')).toBe(true)
    })

    it('returns true for "dev"', () => {
        expect(isDevVersion('dev')).toBe(true)
    })

    it('returns true for "0.0.0" placeholder version', () => {
        expect(isDevVersion('0.0.0')).toBe(true)
    })

    it('returns false for semver without v prefix (e.g. "0.1.0") — Helm installs', () => {
        expect(isDevVersion('0.1.0')).toBe(false)
    })

    it('returns false for "1.0.0" (no v prefix) — valid release', () => {
        expect(isDevVersion('1.0.0')).toBe(false)
    })

    it('returns false for proper tagged version with v prefix', () => {
        expect(isDevVersion('v1.2.3')).toBe(false)
    })

    it('returns false for nightly tag', () => {
        expect(isDevVersion('v0.0.1-nightly.20250124')).toBe(false)
    })

    it('returns false for weekly tag', () => {
        expect(isDevVersion('v0.0.1-weekly.20250124')).toBe(false)
    })
})


describe('isNewerVersion', () => {
    it('returns false when tags are identical', () => {
        expect(isNewerVersion('v1.0.0', 'v1.0.0', 'stable')).toBe(false)
    })

    it('returns false for developer channel (uses SHA comparison instead)', () => {
        expect(isNewerVersion('v1.0.0', 'v2.0.0', 'developer')).toBe(false)
    })

    it('returns true for version without v prefix when newer is available', () => {
        // "0.1.0" without v prefix is a valid release (e.g., Helm install)
        expect(isNewerVersion('0.1.0', 'v2.0.0', 'stable')).toBe(true)
    })

    it('returns false for "0.0.0" placeholder dev version', () => {
        // "0.0.0" is a dev placeholder — no update shown
        expect(isNewerVersion('0.0.0', 'v2.0.0', 'stable')).toBe(false)
    })

    it('returns false for "unknown" current tag', () => {
        expect(isNewerVersion('unknown', 'v2.0.0', 'stable')).toBe(false)
    })

    it('returns true when nightly user has newer stable available (stable channel)', () => {
        // User on nightly v0.3.11, latest stable is v0.3.12
        expect(isNewerVersion('v0.3.11-nightly.20260218', 'v0.3.12', 'stable')).toBe(true)
    })

    it('returns false when nightly user has older stable (stable channel)', () => {
        // User on nightly v0.3.12, latest stable is v0.3.11 — no update
        expect(isNewerVersion('v0.3.12-nightly.20260218', 'v0.3.11', 'stable')).toBe(false)
    })

    it('returns false when nightly user has same base as latest stable', () => {
        // Same base version — stable is the final of the pre-release
        expect(isNewerVersion('v0.3.11-nightly.20260218', 'v0.3.11', 'stable')).toBe(false)
    })

    it('returns false when comparing different types (nightly vs stable on unstable channel)', () => {
        expect(isNewerVersion('v0.0.1-nightly.20250124', 'v1.0.0', 'unstable')).toBe(false)
    })

    it('returns true when comparing nightly dates (newer date)', () => {
        expect(isNewerVersion('v0.0.1-nightly.20250124', 'v0.0.1-nightly.20250201', 'unstable')).toBe(true)
    })

    it('returns false when comparing nightly dates (older date)', () => {
        expect(isNewerVersion('v0.0.1-nightly.20250201', 'v0.0.1-nightly.20250124', 'unstable')).toBe(false)
    })

    it('returns true for newer stable semver (v1.0.0 → v2.0.0)', () => {
        expect(isNewerVersion('v1.0.0', 'v2.0.0', 'stable')).toBe(true)
    })

    it('returns false for older stable semver (v2.0.0 → v1.0.0)', () => {
        expect(isNewerVersion('v2.0.0', 'v1.0.0', 'stable')).toBe(false)
    })

    it('returns true for newer patch version (v1.0.0 → v1.0.1)', () => {
        expect(isNewerVersion('v1.0.0', 'v1.0.1', 'stable')).toBe(true)
    })

    it('returns false for older patch version (v1.0.1 → v1.0.0)', () => {
        expect(isNewerVersion('v1.0.1', 'v1.0.0', 'stable')).toBe(false)
    })

    it('returns false when versions are equal (semver comparison)', () => {
        // Already covered by same-tag check, but exercises semver path too
        expect(isNewerVersion('v1.2.3', 'v1.2.3', 'stable')).toBe(false)
    })

    it('handles versions with different part counts', () => {
        // v1.0 vs v1.0.1 — extra part means newer
        expect(isNewerVersion('v1.0', 'v1.0.1', 'stable')).toBe(true)
    })

    it('returns true for weekly comparison with newer date', () => {
        expect(isNewerVersion('v0.0.1-weekly.20250101', 'v0.0.1-weekly.20250201', 'unstable')).toBe(true)
    })

    it('returns false when weekly dates are the same', () => {
        // Same tag caught by first check
        expect(isNewerVersion('v0.0.1-weekly.20250101', 'v0.0.1-weekly.20250101', 'unstable')).toBe(false)
    })
})


