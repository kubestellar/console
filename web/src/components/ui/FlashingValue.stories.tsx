import { useState, useEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { FlashingValue } from './FlashingValue'

const meta = {
  title: 'UI/FlashingValue',
  component: FlashingValue,
  tags: ['autodocs'],
  argTypes: {
    value: { control: 'text' },
    flashDuration: { control: { type: 'number', min: 200, max: 5000, step: 100 } },
  },
} satisfies Meta<typeof FlashingValue>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    value: 42,
    className: 'text-2xl font-bold text-foreground',
  },
}

export const StringValue: Story = {
  args: {
    value: '99.9%',
    className: 'text-xl font-semibold text-green-400',
  },
}

export const CustomDuration: Story = {
  args: {
    value: 128,
    flashDuration: 3000,
    className: 'text-2xl font-bold text-foreground',
  },
}

/** Demonstrates the flash animation by updating the value every 2 seconds */
function AutoUpdatingDemo() {
  const AUTO_UPDATE_INTERVAL_MS = 2000
  const [count, setCount] = useState(42)

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prev) => prev + Math.floor(Math.random() * 10) + 1)
    }, AUTO_UPDATE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Value updates every 2 seconds to demonstrate the flash animation:
      </p>
      <FlashingValue
        value={count}
        className="text-3xl font-bold text-foreground"
      />
    </div>
  )
}

export const AutoUpdating: Story = {
  args: { value: 42 },
  render: () => <AutoUpdatingDemo />,
}

/** Multiple metrics flashing independently */
function MultiMetricDemo() {
  const METRIC_UPDATE_INTERVAL_MS = 3000
  const [pods, setPods] = useState(24)
  const [cpu, setCpu] = useState('67%')
  const [memory, setMemory] = useState('4.2 GiB')

  useEffect(() => {
    const interval = setInterval(() => {
      setPods(Math.floor(Math.random() * 50) + 10)
      setCpu(`${Math.floor(Math.random() * 100)}%`)
      const mem = (Math.random() * 8 + 1).toFixed(1)
      setMemory(`${mem} GiB`)
    }, METRIC_UPDATE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex gap-8">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-muted-foreground">Pods</span>
        <FlashingValue value={pods} className="text-2xl font-bold text-foreground" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-muted-foreground">CPU</span>
        <FlashingValue value={cpu} className="text-2xl font-bold text-blue-400" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-muted-foreground">Memory</span>
        <FlashingValue value={memory} className="text-2xl font-bold text-purple-400" />
      </div>
    </div>
  )
}

export const MultipleMetrics: Story = {
  args: { value: 24 },
  render: () => <MultiMetricDemo />,
}
