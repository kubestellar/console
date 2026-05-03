import { execSync } from 'child_process'

/**
 * Playwright global teardown — generates coverage reports when VITE_COVERAGE=true.
 *
 * This runs automatically after all Playwright tests complete.
 * For standalone coverage report generation, see: scripts/coverage-report.mjs
 * (invoked by scripts/run-e2e-coverage.sh)
 */
async function globalTeardown() {
  if (process.env.VITE_COVERAGE === 'true') {
    console.log('\n📊 Generating coverage report...\n')
    try {
      execSync('npx nyc report --reporter=text --reporter=html --reporter=lcov', {
        stdio: 'inherit',
        cwd: process.cwd(),
      })
      console.log('\n✅ Coverage report generated in ./coverage directory\n')
    } catch (error) {
      console.warn('⚠️  Failed to generate coverage report:', error)
    }
  }
}

export default globalTeardown
