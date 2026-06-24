import type { Meta, StoryObj } from '@storybook/react'
import { CheckCircle, AlertTriangle, XCircle, Info, Clock, Zap } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { TEST_STRINGS } from '@/lib/test-strings'

const meta = {
  title: 'UI/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  argTypes: {
    color: {
      control: 'select',
      options: ['green', 'red', 'yellow', 'blue', 'purple', 'orange', 'cyan', 'gray'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md'],
    },
    variant: {
      control: 'select',
      options: ['default', 'outline', 'solid'],
    },
    rounded: {
      control: 'select',
      options: ['default', 'full'],
    },
  },
} satisfies Meta<typeof StatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    color: 'green',
    children: 'Active',
  },
}

export const WithIcon: Story = {
  args: {
    color: 'green',
    icon: <CheckCircle className="w-3 h-3" />,
    children: 'Healthy',
  },
}

export const AllColors: Story = {
  args: { color: 'green' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge color="green">{TEST_STRINGS.statusBadge.green}</StatusBadge>
      <StatusBadge color="red">{TEST_STRINGS.statusBadge.red}</StatusBadge>
      <StatusBadge color="yellow">{TEST_STRINGS.statusBadge.yellow}</StatusBadge>
      <StatusBadge color="blue">{TEST_STRINGS.statusBadge.blue}</StatusBadge>
      <StatusBadge color="purple">{TEST_STRINGS.statusBadge.purple}</StatusBadge>
      <StatusBadge color="orange">{TEST_STRINGS.statusBadge.orange}</StatusBadge>
      <StatusBadge color="cyan">{TEST_STRINGS.statusBadge.cyan}</StatusBadge>
      <StatusBadge color="gray">{TEST_STRINGS.statusBadge.gray}</StatusBadge>
    </div>
  ),
}

export const AllColorsOutline: Story = {
  args: { color: 'green' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge color="green" variant="outline">{TEST_STRINGS.statusBadge.green}</StatusBadge>
      <StatusBadge color="red" variant="outline">{TEST_STRINGS.statusBadge.red}</StatusBadge>
      <StatusBadge color="yellow" variant="outline">{TEST_STRINGS.statusBadge.yellow}</StatusBadge>
      <StatusBadge color="blue" variant="outline">{TEST_STRINGS.statusBadge.blue}</StatusBadge>
      <StatusBadge color="purple" variant="outline">{TEST_STRINGS.statusBadge.purple}</StatusBadge>
      <StatusBadge color="orange" variant="outline">{TEST_STRINGS.statusBadge.orange}</StatusBadge>
      <StatusBadge color="cyan" variant="outline">{TEST_STRINGS.statusBadge.cyan}</StatusBadge>
      <StatusBadge color="gray" variant="outline">{TEST_STRINGS.statusBadge.gray}</StatusBadge>
    </div>
  ),
}

export const AllColorsSolid: Story = {
  args: { color: 'green' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge color="green" variant="solid">{TEST_STRINGS.statusBadge.green}</StatusBadge>
      <StatusBadge color="red" variant="solid">{TEST_STRINGS.statusBadge.red}</StatusBadge>
      <StatusBadge color="yellow" variant="solid">{TEST_STRINGS.statusBadge.yellow}</StatusBadge>
      <StatusBadge color="blue" variant="solid">{TEST_STRINGS.statusBadge.blue}</StatusBadge>
      <StatusBadge color="purple" variant="solid">{TEST_STRINGS.statusBadge.purple}</StatusBadge>
      <StatusBadge color="orange" variant="solid">{TEST_STRINGS.statusBadge.orange}</StatusBadge>
      <StatusBadge color="cyan" variant="solid">{TEST_STRINGS.statusBadge.cyan}</StatusBadge>
      <StatusBadge color="gray" variant="solid">{TEST_STRINGS.statusBadge.gray}</StatusBadge>
    </div>
  ),
}

export const AllSizes: Story = {
  args: { color: 'blue' },
  render: () => (
    <div className="flex flex-wrap gap-2 items-center">
      <StatusBadge color="blue" size="xs">Extra Small</StatusBadge>
      <StatusBadge color="blue" size="sm">Small</StatusBadge>
      <StatusBadge color="blue" size="md">Medium</StatusBadge>
    </div>
  ),
}

export const Rounded: Story = {
  args: {
    color: 'purple',
    rounded: 'full',
    children: 'Pill Shape',
  },
}

export const WithIcons: Story = {
  args: { color: 'green' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge color="green" icon={<CheckCircle className="w-3 h-3" />}>Healthy</StatusBadge>
      <StatusBadge color="yellow" icon={<AlertTriangle className="w-3 h-3" />}>Warning</StatusBadge>
      <StatusBadge color="red" icon={<XCircle className="w-3 h-3" />}>Error</StatusBadge>
      <StatusBadge color="blue" icon={<Info className="w-3 h-3" />}>Info</StatusBadge>
      <StatusBadge color="gray" icon={<Clock className="w-3 h-3" />}>Pending</StatusBadge>
      <StatusBadge color="purple" icon={<Zap className="w-3 h-3" />}>Active</StatusBadge>
    </div>
  ),
}

export const ClusterStatuses: Story = {
  name: 'Real-World: Cluster Statuses',
  args: { color: 'green' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge color="green" variant="outline" icon={<CheckCircle className="w-3 h-3" />}>3/3 Ready</StatusBadge>
      <StatusBadge color="yellow" variant="outline" icon={<AlertTriangle className="w-3 h-3" />}>2/3 Ready</StatusBadge>
      <StatusBadge color="red" variant="outline" icon={<XCircle className="w-3 h-3" />}>Offline</StatusBadge>
      <StatusBadge color="gray" variant="outline" icon={<Clock className="w-3 h-3" />}>Pending</StatusBadge>
    </div>
  ),
}
