import { execSync } from 'child_process'

/**
 * Global teardown for Playwright tests.
 * Generates coverage reports if coverage collection is enabled.
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
