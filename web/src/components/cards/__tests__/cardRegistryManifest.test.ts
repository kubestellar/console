/**
 * Guards web/src/components/cards/card-registry-manifest.json against drift.
 *
 * Regenerate after adding/removing/renaming a card type:
 *
 *   UPDATE_CARD_REGISTRY_MANIFEST=1 npx vitest run \
 *     src/components/cards/__tests__/cardRegistryManifest.test.ts
 *
 * (same --update-env convention as `npm run lint:baseline`, see
 * scripts/lint-baseline-check.mjs). Without the env var, a drifted manifest
 * fails this test instead of being silently rewritten.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { buildCardRegistryManifest } from '../cardRegistryManifest'

const MANIFEST_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'card-registry-manifest.json',
)

describe('card-registry-manifest.json', () => {
  it('matches the live registry (run with UPDATE_CARD_REGISTRY_MANIFEST=1 to refresh)', () => {
    const generated = buildCardRegistryManifest()

    if (process.env.UPDATE_CARD_REGISTRY_MANIFEST) {
      writeFileSync(MANIFEST_PATH, JSON.stringify(generated, null, 2) + '\n')
    }

    const checkedIn = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    expect(checkedIn).toEqual(generated)
  })

  it('is non-empty and schema-versioned', () => {
    const generated = buildCardRegistryManifest()
    expect(generated.schemaVersion).toBeGreaterThan(0)
    expect(generated.cardTypes.length).toBeGreaterThan(0)
    expect(generated.cardTypes).toEqual([...generated.cardTypes].sort())
  })
})
