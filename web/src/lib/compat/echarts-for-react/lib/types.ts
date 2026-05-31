import type { Component, CSSProperties } from 'react'
import type { EChartsCoreOption, EChartsInitOpts, EChartsType } from 'echarts/core'

export type EChartsEventHandler = (...args: unknown[]) => void

export interface EChartsModule {
  init: (dom: HTMLElement, theme?: string | object | null, opts?: EChartsInitOpts) => EChartsType
  getInstanceByDom?: (dom: HTMLElement) => EChartsType | undefined
}

export interface EChartsReactProps {
  option: EChartsCoreOption
  notMerge?: boolean
  lazyUpdate?: boolean
  style?: CSSProperties
  className?: string
  theme?: string | object | null
  onChartReady?: (instance: EChartsType) => void
  showLoading?: boolean
  loadingOption?: object
  onEvents?: Record<string, EChartsEventHandler>
  echarts?: EChartsModule
  opts?: EChartsInitOpts
  shouldSetOption?: (
    previousProps: Readonly<EChartsReactProps>,
    nextProps: Readonly<EChartsReactProps>,
  ) => boolean
}

declare class ReactECharts extends Component<EChartsReactProps> {
  getEchartsInstance(): EChartsType | undefined
}

export default ReactECharts
