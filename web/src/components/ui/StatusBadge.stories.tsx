import type { Meta, StoryObj } from '@storybook/react'
import { CheckCircle, AlertTriangle, XCircle, Info, Clock, Zap } from 'lucide-react'
import { StatusBadge } from './StatusBadge'

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
      options: ['default', 'outline-solid', 'solid'],
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
      <StatusBadge color="green">Green</StatusBadge>
      <StatusBadge color="red">Red</StatusBadge>
      <StatusBadge color="yellow">Yellow</StatusBadge>
      <StatusBadge color="blue">Blue</StatusBadge>
      <StatusBadge color="purple">Purple</StatusBadge>
      <StatusBadge color="orange">Orange</StatusBadge>
      <StatusBadge color="cyan">Cyan</StatusBadge>
      <StatusBadge color="gray">Gray</StatusBadge>
    </div>
  ),
}

export const AllColorsOutline: Story = {
  args: { color: 'green' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge color="green" variant="outline">Green</StatusBadge>
      <StatusBadge color="red" variant="outline">Red</StatusBadge>
      <StatusBadge color="yellow" variant="outline">Yellow</StatusBadge>
      <StatusBadge color="blue" variant="outline">Blue</StatusBadge>
      <StatusBadge color="purple" variant="outline">Purple</StatusBadge>
      <StatusBadge color="orange" variant="outline">Orange</StatusBadge>
      <StatusBadge color="cyan" variant="outline">Cyan</StatusBadge>
      <StatusBadge color="gray" variant="outline">Gray</StatusBadge>
    </div>
  ),
}

export const AllColorsSolid: Story = {
  args: { color: 'green' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge color="green" variant="solid">Green</StatusBadge>
      <StatusBadge color="red" variant="solid">Red</StatusBadge>
      <StatusBadge color="yellow" variant="solid">Yellow</StatusBadge>
      <StatusBadge color="blue" variant="solid">Blue</StatusBadge>
      <StatusBadge color="purple" variant="solid">Purple</StatusBadge>
      <StatusBadge color="orange" variant="solid">Orange</StatusBadge>
      <StatusBadge color="cyan" variant="solid">Cyan</StatusBadge>
      <StatusBadge color="gray" variant="solid">Gray</StatusBadge>
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
