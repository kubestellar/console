import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type {
  InvariantValidationResult,
  VisualLoginInvariant,
  VisualLoginInvariantRegistry,
} from './invariantTypes'

const DEFAULT_REGISTRY_PATH = path.resolve(
  process.cwd(),
  'harness/invariants/visual-login-invariants.yml',
)

function isSeverity(value: unknown): value is VisualLoginInvariant['severity'] {
  return value === 'critical' || value === 'major' || value === 'minor'
}

export function validateInvariantRegistry(
  registry: VisualLoginInvariantRegistry,
): InvariantValidationResult {
  const errors: string[] = []
  const seen = new Set<string>()
  const ids: string[] = []

  if (!registry || !Array.isArray(registry.invariants)) {
    return { ok: false, errors: ['Registry must contain an invariants array.'], ids }
  }

  for (const invariant of registry.invariants) {
    if (!invariant || typeof invariant !== 'object') {
      errors.push('Invariant entry must be an object.')
      continue
    }
    if (!invariant.id || typeof invariant.id !== 'string') {
      errors.push('Invariant is missing a string id.')
      continue
    }
    ids.push(invariant.id)
    if (seen.has(invariant.id)) errors.push(`Duplicate invariant id: ${invariant.id}`)
    seen.add(invariant.id)
    if (!invariant.area || typeof invariant.area !== 'string') {
      errors.push(`${invariant.id}: area is required.`)
    }
    if (!isSeverity(invariant.severity)) {
      errors.push(`${invariant.id}: severity must be critical, major, or minor.`)
    }
    if (!invariant.description || typeof invariant.description !== 'string') {
      errors.push(`${invariant.id}: description is required.`)
    }
    if (!Array.isArray(invariant.required)) {
      errors.push(`${invariant.id}: required must be an array.`)
    }
    if (!Array.isArray(invariant.forbidden)) {
      errors.push(`${invariant.id}: forbidden must be an array.`)
    }
  }

  return { ok: errors.length === 0, errors, ids }
}

export function loadInvariantRegistry(registryPath = DEFAULT_REGISTRY_PATH): VisualLoginInvariantRegistry {
  const raw = fs.readFileSync(registryPath, 'utf8')
  const parsed = yaml.load(raw) as VisualLoginInvariantRegistry
  const validation = validateInvariantRegistry(parsed)
  if (!validation.ok) {
    throw new Error(`Invalid visual/login invariant registry:\n${validation.errors.join('\n')}`)
  }
  return parsed
}

export function getInvariantById(id: string, registry = loadInvariantRegistry()): VisualLoginInvariant {
  const invariant = registry.invariants.find(item => item.id === id)
  if (!invariant) throw new Error(`Unknown visual/login invariant: ${id}`)
  return invariant
}

export function listInvariantIds(registry = loadInvariantRegistry()): string[] {
  return registry.invariants.map(invariant => invariant.id)
}
