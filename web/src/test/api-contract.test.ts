/**
 * Global API Contract Tests
 *
 * Verifies that the Go backend and TypeScript frontend agree on the
 * response shapes for core REST endpoints. This catches schema drift
 * without requiring a running backend.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'

// ── Paths ───────────────────────────────────────────────────────────────────

// process.cwd() is the web/ directory when vitest runs; go up one level.
const REPO_ROOT = resolve(process.cwd(), '..')

const SERVER_GO_PATH = join(REPO_ROOT, 'pkg/api/server.go')
const ROUTES_HEALTH_GO_PATH = join(REPO_ROOT, 'pkg/api/routes_health.go')
const USER_MODEL_PATH = join(REPO_ROOT, 'pkg/models/user.go')
const SETTINGS_TYPES_PATH = join(REPO_ROOT, 'pkg/settings/types.go')

// ── Schemas (Frontend Expectations) ─────────────────────────────────────────

const HealthSchema = z.object({
    status: z.string(),
    version: z.string(),
    oauth_configured: z.boolean(),
    in_cluster: z.boolean(),
    install_method: z.string(),
    project: z.string(),
    branding: z.object({
        appName: z.string(),
        appShortName: z.string(),
        tagline: z.string(),
        logoUrl: z.string(),
        faviconUrl: z.string(),
        themeColor: z.string(),
        docsUrl: z.string(),
        communityUrl: z.string(),
        websiteUrl: z.string(),
        issuesUrl: z.string(),
        repoUrl: z.string(),
        hostedDomain: z.string(),
    }),
})

const VersionSchema = z.object({
    version: z.string(),
    go_version: z.string(),
    git_commit: z.string(),
    git_time: z.string(),
    git_dirty: z.boolean(),
})

const UserSchema = z.object({
    id: z.string(),
    github_id: z.string(),
    github_login: z.string(),
    email: z.string().optional(),
    slack_id: z.string().optional(),
    avatar_url: z.string().optional(),
    role: z.string(),
    onboarded: z.boolean(),
    created_at: z.string(),
    last_login: z.string().optional(),
})

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract struct fields and their json tags from Go source. */
function getGoStructFields(source: string, structName: string): Record<string, string> {
    const structStart = source.indexOf(`type ${structName} struct {`)
    if (structStart < 0) return {}
    const afterStruct = source.slice(structStart)
    const structEnd = afterStruct.indexOf('\n}')
    const body = afterStruct.slice(0, structEnd)

    const fields: Record<string, string> = {}
    const lines = body.split('\n')
    for (const line of lines) {
        const match = line.match(/^\s+(\w+)\s+[\w.*[\]]+\s+`json:"([^,"]+)(,[^"]+)?"`/)
        if (match) {
            fields[match[2]] = match[1]
        }
    }
    return fields
}

/** Extract fiber.Map keys from a handler body in Go source. */
function getFiberMapKeys(source: string, routePath: string, methodName: string = 'Get'): string[] {
    // Find the route registration, e.g. s.app.Get("/health", ...)
    const routePattern = new RegExp(`app\\.${methodName}\\("${routePath}"[\\), ]`)
    const routeMatch = source.match(routePattern)
    if (!routeMatch) return []

    const startIndex = routeMatch.index!
    const afterRoute = source.slice(startIndex)

    // Find the handler block. Look for the first return or JSON response.
    // For /health, it defines 'resp := fiber.Map{ ... }'
    // Match closing brace on its own line (with optional indentation)
    const mainMapMatch = afterRoute.match(/resp\s*:=\s*fiber\.Map\{([\s\S]+?)\n[ \t]*\}/)
    const mapMatch = mainMapMatch || afterRoute.match(/fiber\.Map\{([\s\S]+?)\}/)
    if (!mapMatch) return []

    const body = mapMatch[1]
    const keys: string[] = []
    const keyMatches = body.matchAll(/"(\w+)":/g)
    for (const match of keyMatches) {
        keys.push(match[1])
    }
    return keys
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('API Contract — /health', () => {
    it('backend /health response contains all expected top-level keys', () => {
        const source = readFileSync(ROUTES_HEALTH_GO_PATH, 'utf-8')
        const keys = getFiberMapKeys(source, '/health')

        // Check required top-level keys in HealthSchema
        const expectedKeys = Object.keys(HealthSchema.shape)
        for (const key of expectedKeys) {
            if (key === 'branding') continue // handled separately
            expect(keys, `Missing key in /health: ${key}`).toContain(key)
        }
    })

    it('backend /health branding sub-object contains all expected keys', () => {
        const source = readFileSync(ROUTES_HEALTH_GO_PATH, 'utf-8')
        // Find the branding fiber.Map inside /health
        const healthPattern = /app\.Get\("\/health",/
        const match = source.match(healthPattern)
        expect(match).not.toBeNull()
        const afterHealth = source.slice(match!.index)

        const brandingMatch = afterHealth.match(/"branding":\s*fiber\.Map\{([\s\S]+?)\n[ \t]*\},/)
        expect(brandingMatch).not.toBeNull()

        const body = brandingMatch![1]
        const keys: string[] = []
        const keyMatches = body.matchAll(/"(\w+)":/g)
        for (const match of keyMatches) {
            keys.push(match[1])
        }

        const expectedBrandingKeys = Object.keys(HealthSchema.shape.branding.shape)
        for (const key of expectedBrandingKeys) {
            expect(keys, `Missing key in /health branding: ${key}`).toContain(key)
        }
    })
})

describe('API Contract — /api/version', () => {
    it('backend /api/version response contains all expected keys', () => {
        const source = readFileSync(ROUTES_HEALTH_GO_PATH, 'utf-8')
        const keys = getFiberMapKeys(source, '/api/version')

        const expectedKeys = Object.keys(VersionSchema.shape)
        for (const key of expectedKeys) {
            expect(keys, `Missing key in /api/version: ${key}`).toContain(key)
        }
    })
})

describe('API Contract — Models (User)', () => {
    it('User struct in Go matches UserSchema in TypeScript', () => {
        const source = readFileSync(USER_MODEL_PATH, 'utf-8')
        const fields = getGoStructFields(source, 'User')

        const expectedKeys = Object.keys(UserSchema.shape)
        for (const key of expectedKeys) {
            expect(fields, `Missing json tag in User struct: ${key}`).toHaveProperty(key)
        }
    })
})

describe('API Contract — Settings', () => {
    it('AllSettings struct in Go contains core fields expected by UI', () => {
        const source = readFileSync(SETTINGS_TYPES_PATH, 'utf-8')
        const fields = getGoStructFields(source, 'AllSettings')

        // UI expects these core fields for settings to load
        const coreSettingsFields = [
            'aiMode',
            'theme',
            'apiKeys',
            'feedbackGithubToken',
            'notifications'
        ]

        for (const field of coreSettingsFields) {
            expect(fields, `Missing json tag in AllSettings struct: ${field}`).toHaveProperty(field)
        }
    })
})
