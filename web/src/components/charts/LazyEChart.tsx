import { lazy, Suspense, type Ref } from 'react'
import type { EChartsReactProps } from 'echarts-for-react/lib/types'
import type EChartsReact from 'echarts-for-react'

const SKELETON_MIN_HEIGHT_PX = 120

const ReactEChartsLazy = lazy(() => import('echarts-for-react'))

interface LazyEChartProps extends EChartsReactProps {
  ref?: Ref<EChartsReact>
}

function ChartSkeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      className="animate-pulse bg-muted/30 rounded w-full"
      style={{ minHeight: SKELETON_MIN_HEIGHT_PX, ...style }}
    />
  )
}

export function LazyEChart({ ref, ...props }: LazyEChartProps) {
  return (
    <Suspense fallback={<ChartSkeleton style={props.style} />}>
      <ReactEChartsLazy ref={ref} {...props} />
    </Suspense>
  )
}
