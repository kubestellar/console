import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScheduleActionForm } from './ScheduleActionForm'

vi.mock('../../services/stellar', () => ({
  stellarApi: {
    createAction: vi.fn().mockResolvedValue({}),
  },
}))

describe('ScheduleActionForm', () => {
  it('renders the cluster input', () => {
    render(<ScheduleActionForm />)
    expect(screen.getByPlaceholderText('Cluster')).toBeInTheDocument()
  })

  it('renders the action type selector', () => {
    render(<ScheduleActionForm />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders RestartDeployment as default action type', () => {
    render(<ScheduleActionForm />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('RestartDeployment')
  })

  it('renders all action type options', () => {
    render(<ScheduleActionForm />)
    expect(screen.getByRole('option', { name: 'Scale Deployment' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Restart Deployment' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Delete Pod' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cordon Node' })).toBeInTheDocument()
  })

  it('renders param inputs for RestartDeployment', () => {
    render(<ScheduleActionForm />)
    expect(screen.getByPlaceholderText('Namespace')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Deployment name')).toBeInTheDocument()
  })

  it('renders a Submit button', () => {
    render(<ScheduleActionForm />)
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
  })

  it('shows success status after submit', async () => {
    const { stellarApi } = await import('../../services/stellar')
    vi.mocked(stellarApi.createAction).mockResolvedValueOnce({} as never)

    render(<ScheduleActionForm />)
    fireEvent.change(screen.getByPlaceholderText('Cluster'), { target: { value: 'prod' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(screen.getByText(/Action created/)).toBeInTheDocument()
    })
  })

  it('shows error status when submit fails', async () => {
    const { stellarApi } = await import('../../services/stellar')
    vi.mocked(stellarApi.createAction).mockRejectedValueOnce(new Error('network error'))

    render(<ScheduleActionForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(screen.getByText('network error')).toBeInTheDocument()
    })
  })

  it('updates param inputs when action type changes to ScaleDeployment', () => {
    render(<ScheduleActionForm />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ScaleDeployment' } })
    expect(screen.getByPlaceholderText('payments')).toBeInTheDocument()
  })
})
