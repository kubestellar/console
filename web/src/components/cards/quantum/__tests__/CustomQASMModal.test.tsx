import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CustomQASMModal } from '../CustomQASMModal'

const VALID_QASM = `OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
measure q -> c;`

const INVALID_QASM_NO_PREFIX = 'this is not valid qasm code'

describe('CustomQASMModal', () => {
  let onSubmit: ReturnType<typeof vi.fn>
  let onCancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    onSubmit = vi.fn()
    onCancel = vi.fn()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CustomQASMModal isOpen={false} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('renders modal when isOpen is true', () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    expect(screen.getByText('Custom QASM Circuit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('submit button is disabled when content is empty', () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    const submitBtn = screen.getByRole('button', { name: /submit/i })
    expect(submitBtn).toBeDisabled()
  })

  it('calls onCancel when Cancel button is clicked', async () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape key is pressed', () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when clicking the backdrop', async () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    // The backdrop is the outermost fixed overlay div
    const backdrop = screen.getByText('Custom QASM Circuit').closest('.fixed')
    if (backdrop) {
      fireEvent.click(backdrop)
    }
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onSubmit with valid QASM content', async () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    const textarea = screen.getByPlaceholderText(/OPENQASM 2\.0/i)
    fireEvent.change(textarea, { target: { value: VALID_QASM } })

    await userEvent.click(screen.getByRole('button', { name: /submit/i }))
    expect(onSubmit).toHaveBeenCalledWith(VALID_QASM)
  })

  it('shows validation error for invalid QASM prefix', async () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    const textarea = screen.getByPlaceholderText(/OPENQASM 2\.0/i)
    fireEvent.change(textarea, { target: { value: INVALID_QASM_NO_PREFIX } })

    await userEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(onSubmit).not.toHaveBeenCalled()
    // Error banner uses red styling — select specifically
    const errorBanner = document.querySelector('.bg-red-50, [class*="bg-red"]')
    expect(errorBanner).not.toBeNull()
    expect(errorBanner!.textContent).toMatch(/QASM must start with/i)
  })

  it('shows validation error for oversized QASM content', async () => {
    const oversizedContent = 'OPENQASM 2.0;\n' + 'x'.repeat(51 * 1024)

    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    const textarea = screen.getByPlaceholderText(/OPENQASM 2\.0/i)
    fireEvent.change(textarea, { target: { value: oversizedContent } })

    await userEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/exceeds.*50KB/i)).toBeInTheDocument()
  })

  it('switches between paste and upload tabs', async () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    // Should start in paste mode
    expect(screen.getByPlaceholderText(/OPENQASM 2\.0/i)).toBeInTheDocument()

    // Switch to upload mode
    await userEvent.click(screen.getByText('Upload File'))
    expect(screen.getByText(/select a \.qasm file/i)).toBeInTheDocument()

    // Switch back to paste mode
    await userEvent.click(screen.getByText('Paste Code'))
    expect(screen.getByPlaceholderText(/OPENQASM 2\.0/i)).toBeInTheDocument()
  })

  it('clears error when switching tabs', async () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    // Trigger a validation error
    const textarea = screen.getByPlaceholderText(/OPENQASM 2\.0/i)
    fireEvent.change(textarea, { target: { value: INVALID_QASM_NO_PREFIX } })
    await userEvent.click(screen.getByRole('button', { name: /submit/i }))
    const errorBanner = document.querySelector('.bg-red-50, [class*="bg-red-50"]')
    expect(errorBanner).not.toBeNull()

    // Switch tab — error should be cleared
    await userEvent.click(screen.getByText('Upload File'))
    const errorAfterSwitch = document.querySelector('.bg-red-50, [class*="bg-red-50"]')
    expect(errorAfterSwitch).toBeNull()
  })

  it('populates textarea with initialContent', () => {
    render(
      <CustomQASMModal
        isOpen={true}
        onSubmit={onSubmit}
        onCancel={onCancel}
        initialContent={VALID_QASM}
      />,
    )

    const textarea = screen.getByPlaceholderText(/OPENQASM 2\.0/i)
    expect(textarea).toHaveValue(VALID_QASM)
  })

  it('rejects non-.qasm file uploads', async () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    await userEvent.click(screen.getByText('Upload File'))

    const file = new File(['not qasm'], 'test.txt', { type: 'text/plain' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/please select a \.qasm file/i)).toBeInTheDocument()
    })
  })

  it('accepts valid .qasm file upload', async () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    await userEvent.click(screen.getByText('Upload File'))

    const file = new File([VALID_QASM], 'circuit.qasm', { type: 'text/plain' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/file loaded/i)).toBeInTheDocument()
    })
  })

  it('displays byte counter when content is entered', () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    const textarea = screen.getByPlaceholderText(/OPENQASM 2\.0/i)
    fireEvent.change(textarea, { target: { value: VALID_QASM } })

    expect(screen.getByText(new RegExp(`${VALID_QASM.length}`))).toBeInTheDocument()
  })

  it('clears content after successful submit', async () => {
    render(
      <CustomQASMModal isOpen={true} onSubmit={onSubmit} onCancel={onCancel} />,
    )

    const textarea = screen.getByPlaceholderText(/OPENQASM 2\.0/i)
    fireEvent.change(textarea, { target: { value: VALID_QASM } })

    await userEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(onSubmit).toHaveBeenCalledWith(VALID_QASM)
    // After submit, content is cleared
    expect(textarea).toHaveValue('')
  })
})
