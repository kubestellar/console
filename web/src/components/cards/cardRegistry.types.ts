import type { ComponentType } from 'react'

export type CardComponentProps = { config?: Record<string, unknown> }
export type CardComponent = ComponentType<CardComponentProps>
export type CardChunkPreloader = () => Promise<unknown>

export type CardRegistryCategory = {
  components: Record<string, CardComponent>
  preloaders: Record<string, CardChunkPreloader>
  defaultWidths: Record<string, number>
  demoDataCards?: readonly string[]
  liveDataCards?: readonly string[]
  demoStartupPreloaders?: readonly CardChunkPreloader[]
}
