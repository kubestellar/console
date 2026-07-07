import { describe, it, expect, vi, beforeEach } from 'vitest'
import { moveFocusByKey } from '../rovingFocus'

function createContainer(buttonCount: number): HTMLElement {
  const container = document.createElement('div')
  for (let i = 0; i < buttonCount; i++) {
    const btn = document.createElement('button')
    btn.textContent = `Button ${i}`
    btn.setAttribute('data-index', String(i))
    container.appendChild(btn)
  }
  document.body.appendChild(container)
  return container
}

function makeEvent(key: string, currentTarget: HTMLElement) {
  return {
    key,
    currentTarget,
    preventDefault: vi.fn(),
  }
}

describe('moveFocusByKey', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = createContainer(4)
    // Focus the first button
    const buttons = container.querySelectorAll('button')
    buttons[0].focus()
  })

  it('returns null for irrelevant keys', () => {
    const event = makeEvent('Tab', container)
    const result = moveFocusByKey(event)
    expect(result).toBeNull()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('moves focus forward with ArrowDown', () => {
    const event = makeEvent('ArrowDown', container)
    const result = moveFocusByKey(event)
    expect(result).toBe(container.querySelectorAll('button')[1])
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('moves focus forward with ArrowRight', () => {
    const event = makeEvent('ArrowRight', container)
    const result = moveFocusByKey(event)
    expect(result).toBe(container.querySelectorAll('button')[1])
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('moves focus backward with ArrowUp', () => {
    // Focus last button first
    const buttons = container.querySelectorAll('button')
    buttons[3].focus()
    const event = makeEvent('ArrowUp', container)
    const result = moveFocusByKey(event)
    expect(result).toBe(buttons[2])
  })

  it('moves focus backward with ArrowLeft', () => {
    const buttons = container.querySelectorAll('button')
    buttons[2].focus()
    const event = makeEvent('ArrowLeft', container)
    const result = moveFocusByKey(event)
    expect(result).toBe(buttons[1])
  })

  it('loops forward from last to first by default', () => {
    const buttons = container.querySelectorAll('button')
    buttons[3].focus()
    const event = makeEvent('ArrowDown', container)
    const result = moveFocusByKey(event)
    expect(result).toBe(buttons[0])
  })

  it('loops backward from first to last by default', () => {
    const buttons = container.querySelectorAll('button')
    buttons[0].focus()
    const event = makeEvent('ArrowUp', container)
    const result = moveFocusByKey(event)
    expect(result).toBe(buttons[3])
  })

  it('does not loop when loop=false', () => {
    const buttons = container.querySelectorAll('button')
    buttons[3].focus()
    const event = makeEvent('ArrowDown', container)
    const result = moveFocusByKey(event, { loop: false })
    expect(result).toBe(buttons[3])
  })

  it('does not loop backward when loop=false', () => {
    const buttons = container.querySelectorAll('button')
    buttons[0].focus()
    const event = makeEvent('ArrowUp', container)
    const result = moveFocusByKey(event, { loop: false })
    expect(result).toBe(buttons[0])
  })

  it('Home moves to first item', () => {
    const buttons = container.querySelectorAll('button')
    buttons[3].focus()
    const event = makeEvent('Home', container)
    const result = moveFocusByKey(event)
    expect(result).toBe(buttons[0])
  })

  it('End moves to last item', () => {
    const buttons = container.querySelectorAll('button')
    buttons[0].focus()
    const event = makeEvent('End', container)
    const result = moveFocusByKey(event)
    expect(result).toBe(buttons[3])
  })

  it('skips disabled buttons', () => {
    const buttons = container.querySelectorAll('button')
    buttons[1].setAttribute('disabled', '')
    buttons[0].focus()
    const event = makeEvent('ArrowDown', container)
    const result = moveFocusByKey(event)
    expect(result).toBe(buttons[2])
  })

  it('returns null when container is empty', () => {
    const empty = document.createElement('div')
    document.body.appendChild(empty)
    const event = makeEvent('ArrowDown', empty)
    const result = moveFocusByKey(event)
    expect(result).toBeNull()
  })

  describe('orientation', () => {
    it('horizontal ignores ArrowDown/ArrowUp', () => {
      const event = makeEvent('ArrowDown', container)
      const result = moveFocusByKey(event, { orientation: 'horizontal' })
      expect(result).toBeNull()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('horizontal responds to ArrowRight', () => {
      const event = makeEvent('ArrowRight', container)
      const result = moveFocusByKey(event, { orientation: 'horizontal' })
      expect(result).toBe(container.querySelectorAll('button')[1])
    })

    it('vertical ignores ArrowLeft/ArrowRight', () => {
      const event = makeEvent('ArrowRight', container)
      const result = moveFocusByKey(event, { orientation: 'vertical' })
      expect(result).toBeNull()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('vertical responds to ArrowDown', () => {
      const event = makeEvent('ArrowDown', container)
      const result = moveFocusByKey(event, { orientation: 'vertical' })
      expect(result).toBe(container.querySelectorAll('button')[1])
    })
  })

  it('uses custom selector', () => {
    // Add a link and use custom selector
    const link = document.createElement('a')
    link.href = '#'
    link.textContent = 'Link'
    container.appendChild(link)
    link.focus()

    const event = makeEvent('ArrowDown', container)
    const result = moveFocusByKey(event, { selector: 'a[href]' })
    // Only one link in the container, so loops to itself
    expect(result).toBe(link)
  })
})
