import type { Meta, StoryObj } from '@storybook/react'
import { LogoWithStar } from './LogoWithStar'

const meta = {
  title: 'UI/LogoWithStar',
  component: LogoWithStar,
  tags: ['autodocs'],
  argTypes: {
    showStar: { control: 'boolean' },
    alt: { control: 'text' },
  },
} satisfies Meta<typeof LogoWithStar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    className: 'w-16 h-16',
  },
}

export const WithStar: Story = {
  args: {
    className: 'w-16 h-16',
    showStar: true,
  },
}

export const WithoutStar: Story = {
  args: {
    className: 'w-16 h-16',
    showStar: false,
  },
}

export const Small: Story = {
  args: {
    className: 'w-8 h-8',
    showStar: true,
  },
}

export const Large: Story = {
  args: {
    className: 'w-24 h-24',
    showStar: true,
  },
}

export const CustomAlt: Story = {
  args: {
    className: 'w-12 h-12',
    alt: 'Custom Alt Text',
    showStar: true,
  },
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <div className="flex flex-col items-center gap-2">
        <LogoWithStar className="w-6 h-6" showStar />
        <span className="text-xs text-muted-foreground">24px</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <LogoWithStar className="w-8 h-8" showStar />
        <span className="text-xs text-muted-foreground">32px</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <LogoWithStar className="w-12 h-12" showStar />
        <span className="text-xs text-muted-foreground">48px</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <LogoWithStar className="w-16 h-16" showStar />
        <span className="text-xs text-muted-foreground">64px</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <LogoWithStar className="w-24 h-24" showStar />
        <span className="text-xs text-muted-foreground">96px</span>
      </div>
    </div>
  ),
}
