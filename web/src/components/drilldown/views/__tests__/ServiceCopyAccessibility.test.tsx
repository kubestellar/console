import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InfoField, ServiceOutputPane } from '../ServiceDrillDown.parts'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: () => 'Copy' }),
}))

afterEach(cleanup)

describe('service copy button accessibility', () => {
  it.each([false, true])('labels the info copy button when copied=%s', (copied) => {
    const onCopy = vi.fn()
    render(<InfoField label="Cluster IP" value="10.0.0.1" onCopy={onCopy} copied={copied} />)
    const button = screen.getByRole('button', { name: 'Copy' })
    expect(button.getAttribute('aria-label')).toBe('Copy')
    fireEvent.click(button)
    expect(onCopy).toHaveBeenCalledOnce()
  })

  it.each([null, 'yaml'])('labels the output copy button when copiedField=%s', (copiedField) => {
    const onCopy = vi.fn()
    render(<ServiceOutputPane output="kind: Service" loading={false} loadLabel="Load"
      loadingLabel="Loading" copyField="yaml" copiedField={copiedField} onLoad={vi.fn()} onCopy={onCopy} />)
    const button = screen.getByRole('button', { name: 'Copy' })
    expect(button.getAttribute('aria-label')).toBe('Copy')
    fireEvent.click(button)
    expect(onCopy).toHaveBeenCalledWith('kind: Service', 'yaml')
  })
})
