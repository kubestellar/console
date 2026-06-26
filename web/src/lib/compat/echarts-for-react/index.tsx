import React, { createRef } from 'react'
import { use as registerEChartsModules, getInstanceByDom, init } from 'echarts/core'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
  RadarComponent,
} from 'echarts/components'
import {
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  TreemapChart,
} from 'echarts/charts'
import { SVGRenderer, CanvasRenderer } from 'echarts/renderers'
import type { EChartsInitOpts, EChartsType, SetOptionOpts } from 'echarts/core'
import type { EChartsReactProps, EChartsEventHandler } from './lib/types'

// Register only the chart types/components used by the console to avoid pulling
// the full ECharts bundle into the app.
registerEChartsModules([
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
  RadarComponent,
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  TreemapChart,
  SVGRenderer,
  CanvasRenderer,
])

// Create a minimal echarts module object with the functions we need
const echartsCore = { use: registerEChartsModules, getInstanceByDom, init }

interface RegisteredEvents {
  [eventName: string]: EChartsEventHandler
}

function sameInitOptions(a?: EChartsInitOpts, b?: EChartsInitOpts): boolean {
  return a?.renderer === b?.renderer &&
    a?.devicePixelRatio === b?.devicePixelRatio &&
    a?.width === b?.width &&
    a?.height === b?.height &&
    a?.locale === b?.locale &&
    a?.useDirtyRect === b?.useDirtyRect &&
    a?.useCoarsePointer === b?.useCoarsePointer &&
    a?.pointerSize === b?.pointerSize &&
    a?.ssr === b?.ssr
}

export default class ReactECharts extends React.Component<EChartsReactProps> {
  private readonly containerRef = createRef<HTMLDivElement>()
  private chart?: EChartsType
  private resizeObserver?: ResizeObserver
  private registeredEvents: RegisteredEvents = {}

  componentDidMount() {
    this.initChart()
  }

  componentDidUpdate(previousProps: Readonly<EChartsReactProps>) {
    if (this.shouldRecreateChart(previousProps)) {
      this.disposeChart()
      this.initChart()
      return
    }

    this.rebindEvents(previousProps.onEvents, this.props.onEvents ?? {})
    this.updateLoadingState()
    this.setChartOption(previousProps)

    if (previousProps.style !== this.props.style) {
      this.chart?.resize()
    }
  }

  componentWillUnmount() {
    this.disposeChart()
  }

  getEchartsInstance(): EChartsType | undefined {
    return this.chart
  }

  private getEchartsModule() {
    return this.props.echarts ?? echartsCore
  }

  private shouldRecreateChart(previousProps: Readonly<EChartsReactProps>): boolean {
    return previousProps.theme !== this.props.theme ||
      previousProps.echarts !== this.props.echarts ||
      !sameInitOptions(previousProps.opts, this.props.opts)
  }

  private initChart() {
    const container = this.containerRef.current
    if (!container) {
      return
    }

    const echartsModule = this.getEchartsModule()
    const chart = echartsModule.getInstanceByDom?.(container) ?? echartsModule.init(container, this.props.theme, this.props.opts)
    this.chart = chart
    this.attachResizeObserver(container)
    this.rebindEvents(undefined, this.props.onEvents ?? {})
    this.updateLoadingState()
    this.setChartOption()
    chart.resize()
    this.props.onChartReady?.(chart)
  }

  private setChartOption(previousProps?: Readonly<EChartsReactProps>) {
    if (!this.chart) {
      return
    }

    if (previousProps && this.props.shouldSetOption && !this.props.shouldSetOption(previousProps, this.props)) {
      return
    }

    const setOptionOptions: SetOptionOpts = {
      notMerge: this.props.notMerge,
      lazyUpdate: this.props.lazyUpdate,
    }
    this.chart.setOption(this.props.option, setOptionOptions)
  }

  private rebindEvents(
    previousEvents: Record<string, EChartsEventHandler> | undefined,
    nextEvents: Record<string, EChartsEventHandler>,
  ) {
    if (!this.chart) {
      return
    }

    const currentEvents = nextEvents
    const eventNames = new Set<string>([
      ...Object.keys(this.registeredEvents),
      ...Object.keys(previousEvents ?? {}),
      ...Object.keys(currentEvents),
    ])

    for (const eventName of eventNames) {
      const registeredHandler = this.registeredEvents[eventName]
      if (registeredHandler) {
        this.chart.off(eventName, registeredHandler)
        delete this.registeredEvents[eventName]
      }

      const nextHandler = currentEvents[eventName]
      if (nextHandler) {
        this.chart.on(eventName, nextHandler)
        this.registeredEvents[eventName] = nextHandler
      }
    }
  }

  private updateLoadingState() {
    if (!this.chart) {
      return
    }

    if (this.props.showLoading) {
      this.chart.showLoading(undefined, this.props.loadingOption)
      return
    }

    this.chart.hideLoading()
  }

  private attachResizeObserver(container: HTMLDivElement) {
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    this.resizeObserver?.disconnect()
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize()
    })
    this.resizeObserver.observe(container)
  }

  private disposeChart() {
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined

    if (!this.chart) {
      return
    }

    this.rebindEvents(this.props.onEvents, {})
    this.chart.dispose()
    this.chart = undefined
  }

  render() {
    const { className, style } = this.props
    return <div ref={this.containerRef} className={className} style={style} />
  }
}
