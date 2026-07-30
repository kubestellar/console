import React from 'react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@dnd-kit/core', () => ({
  DndContext: () => null,
  DragOverlay: () => null,
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: () => null,
  rectSortingStrategy: {},
}))

vi.mock('../../hooks/useDashboardHealth', () => ({
  useDashboardHealth: () => ({ health: 'healthy' }),
}))

import { DashboardGrid } from './DashboardGrid'

describe('DashboardGrid Component', () => {
  it('exports DashboardGrid component', () => {
    expect(DashboardGrid).toBeDefined()
    expect(typeof DashboardGrid).toBe('function')
  })

  it('renders with minimal props', () => {
    const props = {
      activeDragData: null,
      activeId: null,
      collisionDetection: vi.fn(),
      currentCardTypes: [],
      dashboard: null,
      dashboards: [],
      handleAddSingleCard: vi.fn(),
      handleConfigureCard: vi.fn(),
      handleCreateDashboard: vi.fn(),
      handleDragCancel: vi.fn(),
      handleDragEnd: vi.fn(),
      handleDragOver: vi.fn(),
      handleDragStart: vi.fn(),
      handleGridKeyDown: vi.fn(),
      handleHeightChange: vi.fn(),
      handleInsertAfter: vi.fn(),
      handleRegisterExpandTrigger: vi.fn(),
      handleRemoveCard: vi.fn(),
      handleWidthChange: vi.fn(),
      isCustomized: false,
      isDragging: false,
      isRefreshing: false,
      lastUpdated: null,
      localCards: [],
      openAddCardModal: vi.fn(),
      registerCardRef: vi.fn(),
      sensors: [],
      showDragHint: false,
      triggerRefresh: vi.fn(),
    }
    expect(() => {
      DashboardGrid(props as any)
    }).not.toThrow()
  })
})
