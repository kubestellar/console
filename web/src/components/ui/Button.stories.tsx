import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import { Download, Plus, ArrowRight, Trash2, Settings } from 'lucide-react'
import { Button } from './Button'

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
    children: 'Primary Button',
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
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
    children: 'Ghost Button',
  },
}

export const Accent: Story = {
  args: {
    variant: 'accent',
    children: 'Accent Button',
  },
}

export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Small',
  },
}

export const Medium: Story = {
  args: {
    size: 'md',
    children: 'Medium',
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Large',
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
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="accent">Accent</Button>
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Button variant="primary" size="sm">Small</Button>
      <Button variant="primary" size="md">Medium</Button>
      <Button variant="primary" size="lg">Large</Button>
    </div>
  ),
}
