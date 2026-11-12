import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./check-merged-coverage.mjs', import.meta.url))
const metrics = ['lines', 'functions', 'branches', 'statements']
const file = (covered, total) => Object.fromEntries(metrics.map(metric => [metric, { covered, total }]))

function check(summary) {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-floor-'))
  try {
    const path = join(dir, 'summary.json')
    writeFileSync(path, JSON.stringify(summary))
    return spawnSync(process.execPath, [script, path], { encoding: 'utf8' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function summary() {
  return {
    total: file(100, 100),
    '/web/src/hooks/a.ts': file(1, 10),
    '/web/src/hooks/b.ts': file(3, 10),
    '/web/src/services/a.ts': file(6, 10),
    '/web/src/other.ts': file(100, 100),
  }
}

test('aggregates matching files at the exact floor, not their individual percentages', () => {
  assert.equal(check(summary()).status, 0)
})

test('fails on an individual metric despite high unrelated coverage', () => {
  const data = summary()
  data['/web/src/services/a.ts'].branches.covered = 5
  const result = check(data)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /services\/\*\* branches coverage is below 60%/)
})

test('fails closed when a directory is missing', () => {
  const data = summary()
  delete data['/web/src/hooks/a.ts']
  delete data['/web/src/hooks/b.ts']
  const result = check(data)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /No hooks\/\*\* files/)
})
