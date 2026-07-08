import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Download, Plus, ArrowRight, Trash2, Settings } from 'lucide-react'
import { Button } from './Button'
import { TEST_STRINGS } from '@/lib/test-strings'

const meta = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'ghost', 'accent'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    loading: { control: 'boolean' },
    fullWidth: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'Button',
  },
}

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: `${TEST_STRINGS.button.primary} Button`,
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: `${TEST_STRINGS.button.secondary} Button`,
  },
}

export const Danger: Story = {
  args: {
    variant: 'danger',
    children: 'Delete',
    icon: <Trash2 className="w-4 h-4" />,
  },
}

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: `${TEST_STRINGS.button.ghost} Button`,
  },
}

export const Accent: Story = {
  args: {
    variant: 'accent',
    children: `${TEST_STRINGS.button.accent} Button`,
  },
}

export const Small: Story = {
  args: {
    size: 'sm',
    children: TEST_STRINGS.button.small,
  },
}

export const Medium: Story = {
  args: {
    size: 'md',
    children: TEST_STRINGS.button.medium,
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    children: TEST_STRINGS.button.large,
  },
}

export const WithLeftIcon: Story = {
  args: {
    variant: 'primary',
    icon: <Plus className="w-4 h-4" />,
    children: 'Add Item',
  },
}

export const WithRightIcon: Story = {
  args: {
    variant: 'primary',
    iconRight: <ArrowRight className="w-4 h-4" />,
    children: 'Continue',
  },
}

export const IconOnly: Story = {
  args: {
    variant: 'ghost',
    icon: <Settings className="w-4 h-4" />,
    title: 'Settings',
  },
}

export const Loading: Story = {
  args: {
    variant: 'primary',
    loading: true,
    children: 'Loading...',
  },
}

export const Disabled: Story = {
  args: {
    variant: 'primary',
    disabled: true,
    children: 'Disabled',
  },
}

export const FullWidth: Story = {
  args: {
    variant: 'primary',
    fullWidth: true,
    icon: <Download className="w-4 h-4" />,
    children: 'Download Report',
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Button variant="primary">{TEST_STRINGS.button.primary}</Button>
      <Button variant="secondary">{TEST_STRINGS.button.secondary}</Button>
      <Button variant="danger">{TEST_STRINGS.button.danger}</Button>
      <Button variant="ghost">{TEST_STRINGS.button.ghost}</Button>
      <Button variant="accent">{TEST_STRINGS.button.accent}</Button>
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Button variant="primary" size="sm">{TEST_STRINGS.button.small}</Button>
      <Button variant="primary" size="md">{TEST_STRINGS.button.medium}</Button>
      <Button variant="primary" size="lg">{TEST_STRINGS.button.large}</Button>
    </div>
  ),
}
