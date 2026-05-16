import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}))

const mockShowToast = vi.hoisted(() => vi.fn())
vi.mock('../Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

import { FileAttachmentButton } from '../FileAttachmentButton'

describe('FileAttachmentButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    const { container } = render(<FileAttachmentButton />)
    expect(container).toBeTruthy()
  })

  it('renders the attachment button with correct test id', () => {
    render(<FileAttachmentButton />)
    expect(screen.getByTestId('file-attachment-button')).toBeInTheDocument()
  })

  it('is not disabled by default', () => {
    render(<FileAttachmentButton />)
    expect(screen.getByTestId('file-attachment-button')).not.toBeDisabled()
  })

  it('disables the button when disabled prop is true', () => {
    render(<FileAttachmentButton disabled />)
    expect(screen.getByTestId('file-attachment-button')).toBeDisabled()
  })

  it('does not show a file indicator initially', () => {
    render(<FileAttachmentButton />)
    expect(screen.queryByRole('button', { name: /clear file/i })).not.toBeInTheDocument()
  })

  it('shows file indicator and calls onFileSelected after a file is chosen', () => {
    const onFileSelected = vi.fn()
    const { container } = render(<FileAttachmentButton onFileSelected={onFileSelected} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' })

    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    expect(onFileSelected).toHaveBeenCalledWith(file)
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('test.txt'),
      'info',
    )
    expect(screen.getByText('test.txt')).toBeInTheDocument()
  })

  it('clears the file indicator when the clear button is clicked', () => {
    const { container } = render(<FileAttachmentButton />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['data'], 'report.pdf', { type: 'application/pdf' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    expect(screen.getByText('report.pdf')).toBeInTheDocument()

    const clearBtn = screen.getByTitle('Clear file')
    fireEvent.click(clearBtn)

    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument()
  })

  it('does not call onFileSelected when no file is present in the event', () => {
    const onFileSelected = vi.fn()
    const { container } = render(<FileAttachmentButton onFileSelected={onFileSelected} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [], configurable: true })
    fireEvent.change(input)

    expect(onFileSelected).not.toHaveBeenCalled()
  })

  it('applies compact sizing classes when compact prop is true', () => {
    render(<FileAttachmentButton compact />)
    const btn = screen.getByTestId('file-attachment-button')
    expect(btn.className).toContain('h-10')
    expect(btn.className).toContain('w-10')
  })

  it('applies default (non-compact) sizing class when compact is false', () => {
    render(<FileAttachmentButton compact={false} />)
    const btn = screen.getByTestId('file-attachment-button')
    expect(btn.className).toContain('p-3')
  })

  it('has a hidden file input element accepting all file types', () => {
    const { container } = render(<FileAttachmentButton />)
    const input = container.querySelector('input[type="file"]')
    expect(input).toBeInTheDocument()
    expect(input).toHaveClass('hidden')
    expect(input).toHaveAttribute('accept', '*/*')
  })
})
