import fs from 'node:fs'
import path from 'node:path'
import type { MutationResult } from '../../../harness/mutations/mutationTypes'
import { safeJsonStringify } from '../../../harness/evidence/sanitizeEvidence'

export function appendMutationResult(result: MutationResult) {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  const outPath = path.join(outDir, 'mutation-results.json')
  fs.mkdirSync(outDir, { recursive: true })
  let existing: MutationResult[] = []
  try {
    existing = JSON.parse(fs.readFileSync(outPath, 'utf8')) as MutationResult[]
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') {
      throw error
    }
  }
  const withoutDuplicate = existing.filter(item => item.id !== result.id)
  withoutDuplicate.push(result)
  fs.writeFileSync(outPath, safeJsonStringify(withoutDuplicate))
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
}
