import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import { Pagination } from './Pagination'

const meta = {
  title: 'UI/Pagination',
  component: Pagination,
  tags: ['autodocs'],
  argTypes: {
    currentPage: { control: { type: 'number', min: 1 } },
    totalPages: { control: { type: 'number', min: 1 } },
    totalItems: { control: { type: 'number', min: 0 } },
    itemsPerPage: { control: { type: 'number', min: 1 } },
    showItemsPerPage: { control: 'boolean' },
  },
  args: {
    onPageChange: fn(),
    onItemsPerPageChange: fn(),
  },
} satisfies Meta<typeof Pagination>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    currentPage: 1,
    totalPages: 10,
    totalItems: 100,
    itemsPerPage: 10,
    showItemsPerPage: true,
  },
}

export const MiddlePage: Story = {
  args: {
    currentPage: 5,
    totalPages: 10,
    totalItems: 100,
    itemsPerPage: 10,
    showItemsPerPage: true,
  },
}

export const LastPage: Story = {
  args: {
    currentPage: 10,
    totalPages: 10,
    totalItems: 100,
    itemsPerPage: 10,
    showItemsPerPage: true,
  },
}

export const SinglePage: Story = {
  args: {
    currentPage: 1,
    totalPages: 1,
    totalItems: 3,
    itemsPerPage: 10,
    showItemsPerPage: false,
  },
}

export const NoItems: Story = {
  args: {
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10,
    showItemsPerPage: false,
  },
}

export const WithoutItemsPerPage: Story = {
  args: {
    currentPage: 3,
    totalPages: 8,
    totalItems: 76,
    itemsPerPage: 10,
    showItemsPerPage: false,
  },
}

export const FewItems: Story = {
  args: {
    currentPage: 1,
    totalPages: 3,
    totalItems: 12,
    itemsPerPage: 5,
    showItemsPerPage: true,
  },
}

export const ManyPages: Story = {
  args: {
    currentPage: 25,
    totalPages: 50,
    totalItems: 500,
    itemsPerPage: 10,
    showItemsPerPage: true,
  },
}
