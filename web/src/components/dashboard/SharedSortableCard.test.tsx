import { describe, it, expect } from 'vitest'
import * as SharedSortableCardModule from './SharedSortableCard'

describe('SharedSortableCard (SortableCard) Component', () => {
  it('exports SortableCard component', () => {
    expect(SharedSortableCardModule.SortableCard).toBeDefined()
    expect(typeof SharedSortableCardModule.SortableCard).toBe('object') // It's a memo'd component
  })

  it('exports DragPreviewCard component', () => {
    expect(SharedSortableCardModule.DragPreviewCard).toBeDefined()
    expect(typeof SharedSortableCardModule.DragPreviewCard).toBe('function')
  })
})
