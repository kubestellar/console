import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ConditionBuilder } from './ConditionBuilder'
import type { AlertConditionType } from '../../types/alerts'

const t = (key: string) => key

const CONDITION_TYPES = [
  { value: 'gpu_usage' as AlertConditionType, label: 'GPU Usage', description: 'GPU usage threshold' },
  { value: 'pod_crash' as AlertConditionType, label: 'Pod Crash', description: 'Pod crash loop' },
  { value: 'weather_alerts' as AlertConditionType, label: 'Weather', description: 'Weather alerts' },
]

const DURATION_PRESETS = [
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
] as const

function baseProps(overrides: Partial<React.ComponentProps<typeof ConditionBuilder>> = {}) {
  return {
    conditionType: 'gpu_usage' as AlertConditionType,
    threshold: 80,
    duration: 60,
    weatherCondition: 'severe_storm' as const,
    temperatureThreshold: 100,
    windSpeedThreshold: 40,
    availableClusters: [{ name: 'cluster-a' }, { name: 'cluster-b' }],
    selectedClusters: [],
    conditionTypes: CONDITION_TYPES,
    durationPresets: DURATION_PRESETS,
    errors: {},
    onConditionTypeChange: vi.fn(),
    onThresholdChange: vi.fn(),
    onDurationChange: vi.fn(),
    onWeatherConditionChange: vi.fn(),
    onTemperatureThresholdChange: vi.fn(),
    onWindSpeedThresholdChange: vi.fn(),
    onToggleCluster: vi.fn(),
    t,
    ...overrides,
  }
}

describe('ConditionBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders condition type buttons and marks the active one', () => {
    render(<ConditionBuilder {...baseProps()} />)
    const gpuButton = screen.getByRole('button', { name: /GPU Usage/ })
    expect(gpuButton).toHaveAttribute('aria-pressed', 'true')
    const podButton = screen.getByRole('button', { name: /Pod Crash/ })
    expect(podButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('invokes onConditionTypeChange when a condition type is clicked', () => {
    const onConditionTypeChange = vi.fn()
    render(<ConditionBuilder {...baseProps({ onConditionTypeChange })} />)
    fireEvent.click(screen.getByRole('button', { name: /Pod Crash/ }))
    expect(onConditionTypeChange).toHaveBeenCalledWith('pod_crash')
  })

  it('shows the percent threshold field for gpu_usage and memory_pressure', () => {
    render(<ConditionBuilder {...baseProps({ conditionType: 'gpu_usage' })} />)
    expect(screen.getByLabelText('alerts.thresholdPercent')).toBeInTheDocument()
    expect(screen.queryByLabelText('alerts.restartCountThreshold')).not.toBeInTheDocument()
  })

  it('shows the restart-count field for pod_crash and hides percent threshold', () => {
    render(<ConditionBuilder {...baseProps({ conditionType: 'pod_crash' })} />)
    expect(screen.getByLabelText('alerts.restartCountThreshold')).toBeInTheDocument()
    expect(screen.queryByLabelText('alerts.thresholdPercent')).not.toBeInTheDocument()
  })

  it('calls onThresholdChange with a numeric value on input', () => {
    const onThresholdChange = vi.fn()
    render(<ConditionBuilder {...baseProps({ conditionType: 'gpu_usage', onThresholdChange })} />)
    fireEvent.change(screen.getByLabelText('alerts.thresholdPercent'), { target: { value: '55' } })
    expect(onThresholdChange).toHaveBeenCalledWith(55)
  })

  it('renders a threshold validation error when present', () => {
    render(
      <ConditionBuilder
        {...baseProps({ conditionType: 'gpu_usage', errors: { threshold: 'Too high' } })}
      />,
    )
    expect(screen.getByText('Too high')).toBeInTheDocument()
  })

  it('renders weather sub-fields only for the selected weather condition', () => {
    const { rerender } = render(
      <ConditionBuilder {...baseProps({ conditionType: 'weather_alerts', weatherCondition: 'extreme_heat' })} />,
    )
    expect(screen.getByLabelText('alerts.temperatureThreshold')).toBeInTheDocument()
    expect(screen.queryByLabelText('alerts.windSpeedThreshold')).not.toBeInTheDocument()

    rerender(
      <ConditionBuilder {...baseProps({ conditionType: 'weather_alerts', weatherCondition: 'high_wind' })} />,
    )
    expect(screen.getByLabelText('alerts.windSpeedThreshold')).toBeInTheDocument()
    expect(screen.queryByLabelText('alerts.temperatureThreshold')).not.toBeInTheDocument()
  })

  it('calls onWeatherConditionChange when the select changes', () => {
    const onWeatherConditionChange = vi.fn()
    render(
      <ConditionBuilder
        {...baseProps({ conditionType: 'weather_alerts', onWeatherConditionChange })}
      />,
    )
    fireEvent.change(screen.getByLabelText('alerts.weatherCondition'), { target: { value: 'snow' } })
    expect(onWeatherConditionChange).toHaveBeenCalledWith('snow')
  })

  it('calls onDurationChange when a preset button is clicked', () => {
    const onDurationChange = vi.fn()
    render(<ConditionBuilder {...baseProps({ onDurationChange })} />)
    fireEvent.click(screen.getByRole('button', { name: '5m' }))
    expect(onDurationChange).toHaveBeenCalledWith(300)
  })

  it('marks the active duration preset', () => {
    render(<ConditionBuilder {...baseProps({ duration: 300 })} />)
    expect(screen.getByRole('button', { name: '5m' })).toHaveClass('bg-purple-500/20')
  })

  it('renders cluster toggles only when more than one cluster is available', () => {
    const { rerender } = render(<ConditionBuilder {...baseProps({ availableClusters: [{ name: 'only-one' }] })} />)
    expect(screen.queryByLabelText(/cluster only-one/)).not.toBeInTheDocument()

    rerender(<ConditionBuilder {...baseProps()} />)
    expect(screen.getByLabelText('Select cluster cluster-a')).toBeInTheDocument()
    expect(screen.getByLabelText('Select cluster cluster-b')).toBeInTheDocument()
  })

  it('toggles cluster selection label between Select and Deselect', () => {
    const { rerender } = render(<ConditionBuilder {...baseProps({ selectedClusters: [] })} />)
    expect(screen.getByLabelText('Select cluster cluster-a')).toHaveAttribute('aria-pressed', 'false')

    rerender(<ConditionBuilder {...baseProps({ selectedClusters: ['cluster-a'] })} />)
    expect(screen.getByLabelText('Deselect cluster cluster-a')).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onToggleCluster with the cluster name', () => {
    const onToggleCluster = vi.fn()
    render(<ConditionBuilder {...baseProps({ onToggleCluster })} />)
    fireEvent.click(screen.getByLabelText('Select cluster cluster-b'))
    expect(onToggleCluster).toHaveBeenCalledWith('cluster-b')
  })
})
