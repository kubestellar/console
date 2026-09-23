import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TemplateDropdown, T1Preview, T2Preview } from './cardFactoryPreviews'
import type { AiCardT1Result, AiCardT2Result } from './cardFactoryAiTypes'

describe('TemplateDropdown Component', () => {
  const templates = [{ name: 'Template A' }, { name: 'Template B' }]

  it('does not show the menu until opened', () => {
    render(<TemplateDropdown templates={templates} onSelect={vi.fn()} label="Templates" />)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the menu and lists all templates when clicked', () => {
    render(<TemplateDropdown templates={templates} onSelect={vi.fn()} label="Templates" />)

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))

    expect(screen.getByRole('menu')).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Template A' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Template B' })).toBeVisible()
  })

  it('calls onSelect with the chosen template and closes the menu', () => {
    const onSelect = vi.fn()
    render(<TemplateDropdown templates={templates} onSelect={onSelect} label="Templates" />)

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Template B' }))

    expect(onSelect).toHaveBeenCalledWith(templates[1])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('T1Preview Component', () => {
  const baseResult: AiCardT1Result = {
    title: 'Pod Health',
    description: '',
    layout: 'list',
    defaultWidth: 6,
    defaultLimit: 5,
    columns: [{ field: 'name', label: 'Name' }],
    searchFields: ['name'],
    staticData: [{ name: 'pod-a' }],
  }

  it('renders the title and layout badge', () => {
    render(<T1Preview result={baseResult} />)

    expect(screen.getByText('Pod Health')).toBeVisible()
    expect(screen.getByText('list')).toBeVisible()
  })

  it('renders the description when provided', () => {
    render(<T1Preview result={{ ...baseResult, description: 'Shows pod health status' }} />)

    expect(screen.getByText('Shows pod health status')).toBeVisible()
  })

  it('renders row data for each column', () => {
    render(<T1Preview result={baseResult} />)

    expect(screen.getByText('pod-a')).toBeVisible()
  })
})

describe('T2Preview Component', () => {
  const result: AiCardT2Result = {
    title: 'Custom Chart',
    description: '',
    defaultWidth: 6,
    sourceCode: 'export default function Card() { return null }',
  }

  it('renders the title and source code', () => {
    render(<T2Preview result={result} />)

    expect(screen.getByText('Custom Chart')).toBeVisible()
    expect(screen.getByText(result.sourceCode)).toBeVisible()
  })

  it('renders the description when provided', () => {
    render(<T2Preview result={{ ...result, description: 'A custom card' }} />)

    expect(screen.getByText('A custom card')).toBeVisible()
  })
})
