import { describe, expect, it } from 'vitest'
import viteConfig from '../../vite.config'

type ViteConfigFactory = (env: {
  command: 'serve' | 'build'
  mode: string
  isSsrBuild?: boolean
  isPreview?: boolean
}) => Awaited<ReturnType<typeof viteConfig>>

describe('vite auth proxy routes', () => {
  it('proxies manifest setup and callback routes to the backend in dev', async () => {
    const resolvedConfig = typeof viteConfig === 'function'
      ? await (viteConfig as ViteConfigFactory)({ command: 'serve', mode: 'development', isSsrBuild: false, isPreview: false })
      : viteConfig

    const proxy = resolvedConfig.server?.proxy

    expect(proxy).toBeDefined()
    expect(proxy).toHaveProperty('/auth/manifest/setup')
    expect(proxy).toHaveProperty('/auth/manifest/callback')
  })
})
