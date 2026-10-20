import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionButton, Badge, ConfirmationPanel, ListBlock, Section, Timeline } from './EventModal.parts'

describe('EventModal.parts', () => {
  it('Badge renders children', () => {
    render(<Badge color="red">critical</Badge>)
    expect(screen.getByText('critical')).toBeInTheDocument()
  })

  it('Section renders title and children', () => {
    render(<Section title="Details"><p>body text</p></Section>)
    expect(screen.getByText('Details')).toBeInTheDocument()
    expect(screen.getByText('body text')).toBeInTheDocument()
  })

  it('Timeline shows empty state', () => {
    render(<Timeline entries={[]} />)
    expect(screen.getByText('No timeline entries recorded yet.')).toBeInTheDocument()
  })

  it('Timeline renders each entry label and detail', () => {
    render(
      <Timeline
        entries={[
          { ts: '2026-05-16T00:00:00.000Z', label: 'Detected', detail: 'Pod crashed' },
          { ts: '2026-05-16T00:05:00.000Z', label: 'Resolved', detail: 'Pod restarted' },
        ]}
      />
    )
    expect(screen.getByText('Detected')).toBeInTheDocument()
    expect(screen.getByText('Pod restarted')).toBeInTheDocument()
  })

  it('ListBlock shows empty text when no items', () => {
    render(<ListBlock items={[]} emptyText="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('ListBlock renders items', () => {
    render(<ListBlock items={[{ id: '1', title: 'Item A', subtitle: 'Sub A' }]} emptyText="none" />)
    expect(screen.getByText('Item A')).toBeInTheDocument()
    expect(screen.getByText('Sub A')).toBeInTheDocument()
    expect(screen.queryByText('none')).not.toBeInTheDocument()
  })

  it('ActionButton fires onClick and respects disabled', () => {
    const onClick = vi.fn()
    const { rerender } = render(<ActionButton color="red" onClick={onClick}>Go</ActionButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<ActionButton color="red" disabled onClick={onClick}>Go</ActionButton>)
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()
  })

  it('ConfirmationPanel wires change, cancel and confirm', () => {
    const onChange = vi.fn()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmationPanel
        title="Confirm"
        description="Are you sure?"
        value=""
        onChange={onChange}
        placeholder="Reason"
        onCancel={onCancel}
        onConfirm={onConfirm}
        confirmLabel="Do it"
        isSubmitting={false}
      />
    )
    fireEvent.change(screen.getByPlaceholderText('Reason'), { target: { value: 'because' } })
    expect(onChange).toHaveBeenCalledWith('because')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('ConfirmationPanel disables confirm while submitting', () => {
    render(
      <ConfirmationPanel
        title="t" description="d" value="" onChange={() => {}} placeholder="p"
        onCancel={() => {}} onConfirm={() => {}} confirmLabel="Do it" isSubmitting
      />
    )
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()
  })
})
