import { describe, it, expect } from 'vitest'
import { maskKubernetesYamlData, YAML_MASK_PLACEHOLDER } from '../yamlMask'

/**
 * Pin behavior of the resource-agnostic Kubernetes YAML masker.
 * Replaces the earlier regex-based pinning in SecretDrillDown.test.tsx.
 *
 * Particularly important: the block-scalar correctness bug from #6231
 * which the previous regex-based helper failed on (it would mask the
 * key: line into a single-line scalar but still emit indented
 * continuation lines that no longer belonged to any key).
 */
describe('maskKubernetesYamlData', () => {
  it('masks values inside the data: block', () => {
    const input = [
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      '  name: my-secret',
      'data:',
      '  password: cGFzczEyMw==',
      '  username: dXNlcg==',
      'type: Opaque',
      '',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    expect(masked).not.toContain('cGFzczEyMw==')
    expect(masked).not.toContain('dXNlcg==')
    expect(masked).toContain(YAML_MASK_PLACEHOLDER)
    // Surrounding YAML preserved (parser may reformat slightly)
    expect(masked).toContain('apiVersion: v1')
    expect(masked).toContain('kind: Secret')
    expect(masked).toContain('my-secret')
    expect(masked).toContain('Opaque')
    // Both keys present in the masked output
    expect(masked).toContain('password')
    expect(masked).toContain('username')
  })

  it('masks values inside the stringData: block', () => {
    const input = [
      'apiVersion: v1',
      'kind: Secret',
      'stringData:',
      '  api-key: super-secret-12345',
      '  api-key-2: another-very-secret-value',
      'type: Opaque',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    expect(masked).not.toContain('super-secret-12345')
    expect(masked).not.toContain('another-very-secret-value')
    expect(masked).toContain(YAML_MASK_PLACEHOLDER)
    expect(masked).toContain('api-key')
  })

  it('correctly masks block-scalar values (| literal) — #6231', () => {
    // The KEY bug from #6231: the previous regex would mask the
    // `cert: |` line into a single-line scalar but still emit (masked)
    // continuation lines, leaving stray content.
    const input = [
      'apiVersion: v1',
      'kind: Secret',
      'data:',
      '  cert: |',
      '    -----BEGIN CERTIFICATE-----',
      '    MIIBkTCB+wIJAJ...',
      '    -----END CERTIFICATE-----',
      'type: Opaque',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    // The certificate body must NOT appear in any form (raw or masked)
    expect(masked).not.toContain('BEGIN CERTIFICATE')
    expect(masked).not.toContain('MIIBkTCB')
    expect(masked).not.toContain('END CERTIFICATE')
    // The output must still be parseable as valid YAML — re-parse it
    // to prove no stray indented lines were emitted.
    expect(() => {
      const yaml = require('js-yaml')
      yaml.load(masked)
    }).not.toThrow()
    // Key name preserved
    expect(masked).toContain('cert')
    expect(masked).toContain(YAML_MASK_PLACEHOLDER)
  })

  it('correctly masks folded block scalar (> indicator)', () => {
    const input = [
      'data:',
      '  message: >',
      '    this is a folded',
      '    multi-line value',
      '    that should be masked',
      'kind: Secret',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    expect(masked).not.toContain('this is a folded')
    expect(masked).not.toContain('multi-line value')
    expect(masked).not.toContain('should be masked')
    expect(masked).toContain('message')
    expect(masked).toContain(YAML_MASK_PLACEHOLDER)
  })

  it('does not mask keys outside the data block', () => {
    const input = [
      'metadata:',
      '  name: my-secret',
      '  labels:',
      '    app: web',
      '    tier: frontend',
      'data:',
      '  password: aGVsbG8=',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    expect(masked).toContain('my-secret')
    expect(masked).toContain('app')
    expect(masked).toContain('web')
    expect(masked).toContain('frontend')
    expect(masked).not.toContain('aGVsbG8=')
  })

  it('handles a resource with no data block (pass-through)', () => {
    const input = [
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      '  name: empty',
      'type: Opaque',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    // No data → no masking → output is parseable and contains the
    // same key info (parser may reformat, so don't assert byte-equal)
    expect(masked).toContain('empty')
    expect(masked).toContain('Opaque')
    expect(masked).not.toContain(YAML_MASK_PLACEHOLDER)
  })

  it('returns empty string unchanged', () => {
    expect(maskKubernetesYamlData('')).toBe('')
  })

  it('returns the parse-failure sentinel for malformed YAML (security default-deny)', () => {
    // Deliberately malformed — js-yaml will reject this. The helper
    // MUST NOT return the raw input; instead it must return a sentinel
    // that hides the content so a parse failure cannot leak secrets.
    const input = [
      'data:',
      '  password: cGFzczEyMw==',
      '  username: not closed "',
      ': : : : invalid',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    expect(masked).not.toContain('cGFzczEyMw==')
    expect(masked).toContain(YAML_MASK_PLACEHOLDER)
    // Sentinel includes a comment explaining what happened
    expect(masked).toContain('parse error')
  })

  it('works for ConfigMap data blocks (same field name as Secret)', () => {
    const input = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      '  name: app-config',
      'data:',
      '  database_url: postgresql://user:pass@host/db',
      '  api_endpoint: https://api.example.com',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    expect(masked).not.toContain('postgresql://user:pass@host/db')
    expect(masked).not.toContain('https://api.example.com')
    expect(masked).toContain('database_url')
    expect(masked).toContain('api_endpoint')
    expect(masked).toContain(YAML_MASK_PLACEHOLDER)
    expect(masked).toContain('app-config')
  })

  it('handles multi-document YAML', () => {
    const input = [
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      '  name: secret-1',
      'data:',
      '  key1: dmFsdWUx',
      '---',
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      '  name: secret-2',
      'data:',
      '  key2: dmFsdWUy',
    ].join('\n')

    const masked = maskKubernetesYamlData(input)

    expect(masked).not.toContain('dmFsdWUx')
    expect(masked).not.toContain('dmFsdWUy')
    // Both documents masked, both names preserved
    expect(masked).toContain('secret-1')
    expect(masked).toContain('secret-2')
    expect(masked).toContain('key1')
    expect(masked).toContain('key2')
    // Multi-doc separator preserved
    expect(masked).toContain('---')
  })
})
