/**
 * Miscellaneous Card Config Tests
 *
 * Tests miscellaneous card configurations (RSS, utilities, etc.).
 */
import { describe, it, expect } from 'vitest'
import { rssFeedConfig } from '../rss-feed'
import { cascadeImpactMapConfig } from '../cascade-impact-map'
import { certManagerConfig } from '../cert-manager'
import { externalSecretsConfig } from '../external-secrets'
import { vaultSecretsConfig } from '../vault-secrets'
import { tufStatusConfig } from '../tuf-status'
import { openfeatureStatusConfig } from '../openfeature-status'
import { openfgaStatusConfig } from '../openfga-status'
import { keycloakStatusConfig } from '../keycloak-status'
import { vclusterStatusConfig } from '../vcluster-status'
import { flatcarStatusConfig } from '../flatcar-status'

const miscCards = [
  { name: 'rssFeed', config: rssFeedConfig },
  { name: 'cascadeImpactMap', config: cascadeImpactMapConfig },
  { name: 'certManager', config: certManagerConfig },
  { name: 'externalSecrets', config: externalSecretsConfig },
  { name: 'vaultSecrets', config: vaultSecretsConfig },
  { name: 'tufStatus', config: tufStatusConfig },
  { name: 'openfeatureStatus', config: openfeatureStatusConfig },
  { name: 'openfgaStatus', config: openfgaStatusConfig },
  { name: 'keycloakStatus', config: keycloakStatusConfig },
  { name: 'vclusterStatus', config: vclusterStatusConfig },
  { name: 'flatcarStatus', config: flatcarStatusConfig },
]

describe('Miscellaneous card configs', () => {
  it.each(miscCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(miscCards)('$name has valid dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(miscCards)('$name has icon', ({ config }) => {
    expect(config.icon).toBeTruthy()
  })

  it.each(miscCards)('$name has no undefined required fields', ({ config }) => {
    expect(config.type).not.toBeUndefined()
    expect(config.title).not.toBeUndefined()
    expect(config.category).not.toBeUndefined()
    expect(config.content).not.toBeUndefined()
    expect(config.dataSource).not.toBeUndefined()
  })
})
