import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Wrench } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { CollapsibleSection, QuickActionsSection } from './UtilitySections'

describe('UtilitySections', () => {
  it('renders collapsible and quick action sections', () => {
    render(
      <>
        <CollapsibleSection title="Actions" badge={1}>
          <div>Section content</div>
        </CollapsibleSection>
        <QuickActionsSection
          actions={[
            { id: 'fix', label: 'Run fix', icon: Wrench, onClick: vi.fn() },
          ]}
        />
      </>
    )

    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.getByText('Section content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run fix' })).toBeInTheDocument()
  })
})
