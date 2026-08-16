import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PieceComponent } from '../CheckersPiece'

const podPiece = { player: 'pods' as const, type: 'normal' as const }
const kingPiece = { player: 'nodes' as const, type: 'king' as const }

describe('CheckersPiece (PieceComponent)', () => {
  it('renders a pod piece', () => {
    const { container } = render(
      <PieceComponent piece={podPiece} isSelected={false} isSmall={false} />
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('bg-blue-500')
  })

  it('renders a nodes piece', () => {
    const { container } = render(
      <PieceComponent piece={kingPiece} isSelected={false} isSmall={false} />
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('bg-orange-500')
  })

  it('applies selected ring when isSelected is true', () => {
    const { container } = render(
      <PieceComponent piece={podPiece} isSelected={true} isSmall={false} />
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('ring-2')
  })

  it('applies small size when isSmall is true', () => {
    const { container } = render(
      <PieceComponent piece={podPiece} isSelected={false} isSmall={true} />
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('w-6')
  })
})
