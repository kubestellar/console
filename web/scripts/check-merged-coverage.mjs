import { readFileSync } from 'node:fs'

// These floors apply to the union of all shards, never to individual shards.
const floors = { hooks: 20, services: 60 }
const metrics = ['lines', 'functions', 'branches', 'statements']
const summary = JSON.parse(readFileSync(process.argv[2] || 'coverage/coverage-summary.json', 'utf8'))
let failed = false

for (const [directory, floor] of Object.entries(floors)) {
  const files = Object.entries(summary).filter(([path]) =>
    path !== 'total' && path.replaceAll('\\', '/').split('/').includes(directory),
  )
  if (files.length === 0) {
    console.error(`::error::No ${directory}/** files found in merged coverage`)
    failed = true
    continue
  }
  for (const metric of metrics) {
    let covered = 0
    let total = 0
    for (const [, file] of files) {
      if (!file[metric] || !Number.isFinite(file[metric].covered) || !Number.isFinite(file[metric].total)) {
        throw new Error(`Missing ${metric} coverage for ${directory}`)
      }
      covered += file[metric].covered
      total += file[metric].total
    }
    const pct = total === 0 ? 100 : (covered / total) * 100
    console.log(`${directory}/** ${metric}: ${pct.toFixed(2)}% (minimum ${floor}%)`)
    if (pct < floor) {
      console.error(`::error::${directory}/** ${metric} coverage is below ${floor}%`)
      failed = true
    }
  }
}
if (failed) process.exitCode = 1
