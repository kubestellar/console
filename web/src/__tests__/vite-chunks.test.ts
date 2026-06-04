import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('Vite chunk splitting configuration', () => {
  const viteConfig = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf-8')

  const expectedChunks = [
    // Card domain chunks
    'cards-gpu',
    'cards-gitops',
    'cards-observability',
    'cards-security',
    'cards-aiml',
    'cards-quantum',
    'cards-networking',
    'cards-platform',
    'cards-misc',
    // Supplementary chunks
    'contexts-providers',
    'hooks-data',
    'lib-cache',
  ]

  it.each(expectedChunks)('defines %s chunk in manualChunks', (chunkName) => {
    expect(viteConfig).toContain(`'${chunkName}'`)
  })
})
