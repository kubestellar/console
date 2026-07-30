import { describe, it, expect } from 'vitest'
import type { EChartsEventHandler, EChartsModule, EChartsReactProps } from '../lib/types'
import type { EChartsType, EChartsInitOpts } from 'echarts/core'

describe('ECharts types', () => {
  it('EChartsEventHandler is callable with unknown[]', () => {
    const handler: EChartsEventHandler = (...args: unknown[]) => args.length
    expect(handler('foo', 1, {})).toBe(3)
  })

  it('EChartsModule.init returns EChartsType', () => {
    const dummy: EChartsType = {} as EChartsType
    const mod: EChartsModule = {
      init: (dom: HTMLElement, theme?: string | object | null, opts?: EChartsInitOpts) => dummy
    }
    expect(mod.init(document.createElement('div'))).toBe(dummy)
  })

  it('EChartsReactProps option is required and correct type', () => {
    const option = { title: { text: 'foo' } } as EChartsReactProps['option']
    expect(option).toBeDefined()
  })

  it('EChartsReactProps onChartReady receives EChartsType', () => {
    let called = false
    const props: EChartsReactProps = {
      option: { title: { text: 'foo' } },
      onChartReady: (inst) => {
        called = true
        expect(inst).toBeDefined()
      }
    }
    props.onChartReady?.({} as EChartsType)
    expect(called).toBe(true)
  })
})
