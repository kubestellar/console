/**
 * Shared test factories and helpers for useVersionCheck test suites.
 *
 * This file is pure — no vi.mock(), vi.hoisted(), or React imports —
 * so pure-function test files can import it without dragging in
 * provider/mock dependencies.
 */
import type { GitHubRelease, ParsedRelease } from '../../types/updates'

export function makeGitHubRelease(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
    return {
        tag_name: 'v1.2.3',
        name: 'Release v1.2.3',
        body: 'Release notes',
        published_at: '2025-01-24T00:00:00Z',
        html_url: 'https://github.com/kubestellar/console/releases/tag/v1.2.3',
        prerelease: false,
        draft: false,
        ...overrides,
    }
}

export function makeParsedRelease(overrides: Partial<ParsedRelease> = {}): ParsedRelease {
    return {
        tag: 'v1.2.3',
        version: 'v1.2.3',
        type: 'stable',
        date: null,
        publishedAt: new Date('2025-01-24T00:00:00Z'),
        releaseNotes: 'Release notes',
        url: 'https://github.com/kubestellar/console/releases/tag/v1.2.3',
        ...overrides,
    }
}

/**
 * Build a mock headers object that returns 'application/json' for Content-Type
 * and delegates other keys to an optional custom getter.
 */
export function jsonHeaders(custom?: (key: string) => string | null): { get: (key: string) => string | null } {
    return {
        get: (key: string) => {
            if (key.toLowerCase() === 'content-type') return 'application/json'
            return custom ? custom(key) : null
        },
    }
}

export const RELEASES_API_PATH = '/api/github/repos/kubestellar/console/releases'
export const AUTO_UPDATE_STATUS_PATH = '/auto-update/status'

export function isReleasesApiCall(call: unknown[]): boolean {
    return typeof call[0] === 'string' && (call[0] as string).includes(RELEASES_API_PATH)
}

export function isAutoUpdateStatusCall(call: unknown[]): boolean {
    return typeof call[0] === 'string' && (call[0] as string).includes(AUTO_UPDATE_STATUS_PATH)
}
