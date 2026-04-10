/**
 * Resource-agnostic YAML masking for Kubernetes drilldown views.
 *
 * Originally written inline in `SecretDrillDown.tsx` as a regex
 * (`maskSecretYaml`) to mask the `data:` block in `kubectl get secret -o
 * yaml` output. PR #6218 reused that helper for ConfigMaps; #6231 then
 * caught two real bugs in the regex approach:
 *
 *   1. Block-scalar values (`key: |` / `key: >`) produced malformed
 *      output. The regex masked the `key:` line into a single-line
 *      scalar but then still emitted (masked) continuation lines,
 *      leaving stray indented lines that no longer belonged to any key.
 *   2. The regex doc claimed a YAML parser would "bloat the bundle",
 *      but `js-yaml` is already a project dependency
 *      (`web/src/lib/missions/fileParser.ts`,
 *      `web/src/components/cards/WorkloadImportDialog.tsx`,
 *      `web/src/components/missions/ShareMissionDialog.tsx`).
 *
 * This module replaces the regex with a `js-yaml`-based parse → walk →
 * dump pipeline that:
 *
 *   - Correctly masks every key in `data:` and `stringData:` regardless
 *     of whether the value is a single-line scalar, a `|` block scalar,
 *     a `>` folded scalar, a quoted string, or a multi-line value.
 *   - Preserves keys (so users can still see WHAT is in the resource)
 *     and surrounding YAML structure (metadata, type, kind, etc.).
 *   - Handles multi-document YAML (`---` separator) by walking each
 *     document independently — useful for `kubectl get secret -o yaml`
 *     when called against multiple secrets.
 *   - Falls back to a hard-mask sentinel ("# masking parse error — full
 *     content hidden") if `js-yaml` rejects the input. **This is
 *     deliberate**: a parse failure on a security-critical helper must
 *     never silently expose secrets, so we err on the side of hiding
 *     everything.
 *
 * Reused by `SecretDrillDown.tsx` and `ConfigMapDrillDown.tsx`. Pinned
 * by tests in `__tests__/yamlMask.test.ts`.
 */

import yaml from 'js-yaml'

/** Sentinel string used in place of secret values when masking. Same
 * width as the per-key reveal placeholder on the Data tabs so masked
 * YAML and masked Data look consistent. */
export const YAML_MASK_PLACEHOLDER = '••••••••••••••••'

/** Hard-mask sentinel returned when js-yaml fails to parse the input.
 * Comment-prefixed so the user sees an explanation in place of the
 * real document. */
const PARSE_FAILURE_SENTINEL = `# masking parse error — full content hidden\n${YAML_MASK_PLACEHOLDER}\n`

/** Top-level field names whose values should be masked when rendering
 * a Kubernetes resource. Both `data` and `stringData` are valid for
 * Secrets; ConfigMaps use `data`. */
const SENSITIVE_FIELDS: ReadonlySet<string> = new Set(['data', 'stringData'])

/** Walk one parsed YAML document and replace every value inside the
 * sensitive top-level fields with the placeholder. Mutates `doc` in
 * place and returns it for convenience. The walk only descends one
 * level past `data:` / `stringData:` because Kubernetes Secret and
 * ConfigMap data fields are flat string→string maps. */
function maskSensitiveFields(doc: unknown): unknown {
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
    return doc
  }
  const obj = doc as Record<string, unknown>
  for (const field of SENSITIVE_FIELDS) {
    const block = obj[field]
    if (block != null && typeof block === 'object' && !Array.isArray(block)) {
      const masked: Record<string, string> = {}
      for (const key of Object.keys(block as Record<string, unknown>)) {
        masked[key] = YAML_MASK_PLACEHOLDER
      }
      obj[field] = masked
    }
  }
  return obj
}

/**
 * Mask the `data:` and `stringData:` blocks of a Kubernetes resource
 * YAML document, returning a redumped YAML string with values
 * replaced by the placeholder.
 *
 * Used by both Secret and ConfigMap drilldown YAML tabs. Replaces the
 * earlier regex-based `maskSecretYaml` (#6231).
 *
 * @param yamlInput  Raw YAML from `kubectl get <resource> -o yaml`.
 * @returns          Masked YAML, or a hard-mask sentinel if parsing
 *                   fails. Empty input returns empty.
 */
export function maskKubernetesYamlData(yamlInput: string): string {
  if (!yamlInput) return yamlInput

  let docs: unknown[]
  try {
    // loadAll handles multi-document YAML transparently — single docs
    // come back as a 1-element array. Use the safe loader (default in
    // js-yaml v4) to avoid arbitrary code execution from custom tags.
    docs = yaml.loadAll(yamlInput)
  } catch {
    // Parse failure on a security helper must never silently expose
    // secrets — return the hard-mask sentinel so the user sees an
    // explicit "this could not be safely masked" message.
    return PARSE_FAILURE_SENTINEL
  }

  if (docs.length === 0) return yamlInput

  try {
    const maskedDocs = docs.map(maskSensitiveFields)
    // dumpAll for multi-doc, single dump for single-doc, so we don't
    // emit a stray `---` for single-resource YAML.
    if (maskedDocs.length === 1) {
      return yaml.dump(maskedDocs[0], {
        // noRefs avoids emitting `&anchor` references for repeated
        // values; the placeholder is repeated by design and we don't
        // want kubectl-style YAML cluttered with `&id001`.
        noRefs: true,
        // lineWidth -1 keeps long values on one line so the masked
        // output stays compact.
        lineWidth: -1,
      })
    }
    return maskedDocs
      .map(d =>
        yaml.dump(d, { noRefs: true, lineWidth: -1 }),
      )
      .join('---\n')
  } catch {
    return PARSE_FAILURE_SENTINEL
  }
}
