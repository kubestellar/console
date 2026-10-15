/**
 * Generates the card-registry manifest: a stable, schema-versioned summary
 * of every card type id registered in `CARD_COMPONENTS` (the merged output
 * of `cardRegistry.index.ts`'s domain registries, the quantum registry, and
 * `cardDescriptors.registry.ts`'s descriptor cards).
 *
 * External consumers (notably kubestellar/console-marketplace's
 * `scripts/validate_marketplace_lib/ts_parsing.py`, see
 * kubestellar/console-marketplace#953 and kubestellar/console#24350)
 * previously had no stable contract for "which card types exist" and
 * regex-parsed this repo's TypeScript source directly. The checked-in
 * `card-registry-manifest.json` (kept in sync by
 * `cardRegistryManifest.test.ts`) is that contract.
 */
import { CARD_COMPONENTS } from './cardRegistry.index'

export const CARD_REGISTRY_MANIFEST_SCHEMA_VERSION = 1

export type CardRegistryManifest = {
  schemaVersion: number
  cardTypes: string[]
}

export function buildCardRegistryManifest(): CardRegistryManifest {
  return {
    schemaVersion: CARD_REGISTRY_MANIFEST_SCHEMA_VERSION,
    cardTypes: Object.keys(CARD_COMPONENTS).sort(),
  }
}
