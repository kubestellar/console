import { useState } from 'react'
import { TimeSeriesChart } from '../charts'

// Generate demo time series data
function generateTimeSeriesData(points: number, baseValue: number, variance: number) {
  const now = new Date()
  return Array.from({ length: points }, (_, i) => {
    const time = new Date(now.getTime() - (points - i - 1) * 60000)
    return {
      time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: Math.max(0, baseValue + (Math.random() - 0.5) * variance),
    }
  })
}

const metrics = {
  cpu: generateTimeSeriesData(20, 65, 30),
  memory: generateTimeSeriesData(20, 72, 20),
  network: generateTimeSeriesData(20, 150, 100),
  requests: generateTimeSeriesData(20, 1200, 500),
}

type MetricType = keyof typeof metrics

const metricConfig = {
  cpu: { label: 'CPU Usage', color: '#9333ea', unit: '%' },
  memory: { label: 'Memory Usage', color: '#3b82f6', unit: '%' },
  network: { label: 'Network I/O', color: '#10b981', unit: ' MB/s' },
  requests: { label: 'Requests/min', color: '#f59e0b', unit: '' },
}

export function ClusterMetrics() {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('cpu')

  const config = metricConfig[selectedMetric]
  const data = metrics[selectedMetric]
  const currentValue = data[data.length - 1]?.value || 0

  return (
    <div className="h-full flex flex-col">
      {/* Header with metric selector */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-medium text-white">{config.label}</h4>
          <p className="text-2xl font-bold text-white">
            {Math.round(currentValue)}<span className="text-sm text-muted-foreground">{config.unit}</span>
          </p>
        </div>
        <div className="flex gap-1">
          {(Object.keys(metrics) as MetricType[]).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedMetric(key)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                selectedMetric === key
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-white hover:bg-secondary/50'
              }`}
            >
              {metricConfig[key].label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <TimeSeriesChart
          data={data}
          color={config.color}
          height={160}
          unit={config.unit}
          showGrid
        />
      </div>

      {/* Stats */}
      <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Min</p>
          <p className="text-sm font-medium text-white">
            {Math.round(Math.min(...data.map((d) => d.value)))}{config.unit}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Avg</p>
          <p className="text-sm font-medium text-white">
            {Math.round(data.reduce((a, b) => a + b.value, 0) / data.length)}{config.unit}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Max</p>
          <p className="text-sm font-medium text-white">
            {Math.round(Math.max(...data.map((d) => d.value)))}{config.unit}
          </p>
        </div>
      </div>
    </div>
  )
}
