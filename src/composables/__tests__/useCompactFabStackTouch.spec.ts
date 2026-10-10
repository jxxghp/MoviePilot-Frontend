import { handleCompactFabStackClick } from '@/composables/useCompactFabStackTouch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 构造一个右下角操作栈，按钮点击计入对应的 spy。 */
function createStack(count: number) {
  const stack = document.createElement('div')
  stack.className = 'compact-fab-stack'
  const actions = Array.from({ length: count }, (_, index) => {
    const action = vi.fn()
    const button = document.createElement('button')
    button.textContent = `action-${index}`
    button.addEventListener('click', action)
    stack.appendChild(button)
    return { action, button }
  })
  document.body.appendChild(stack)
  return { actions, stack }
}

/** 模拟当前设备是否具备悬停与精确指针。 */
function mockFinePointer(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches })),
  )
}

describe('useCompactFabStackTouch', () => {
  beforeEach(() => {
    document.addEventListener('click', handleCompactFabStackClick, true)
  })

  afterEach(() => {
    document.removeEventListener('click', handleCompactFabStackClick, true)
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('expands a folded stack on the first tap without running the tapped action', () => {
    mockFinePointer(false)
    const { actions, stack } = createStack(3)

    actions[2].button.click()
    expect(stack.classList.contains('is-expanded')).toBe(true)
    expect(actions[2].action).not.toHaveBeenCalled()

    actions[0].button.click()
    expect(actions[0].action).toHaveBeenCalledOnce()
    expect(stack.classList.contains('is-expanded')).toBe(true)
  })

  it('collapses the stack when tapping elsewhere and lets that tap through', () => {
    mockFinePointer(false)
    const { actions, stack } = createStack(2)
    const outside = document.createElement('button')
    const outsideAction = vi.fn()
    outside.addEventListener('click', outsideAction)
    document.body.appendChild(outside)

    actions[1].button.click()
    outside.click()

    expect(stack.classList.contains('is-expanded')).toBe(false)
    expect(outsideAction).toHaveBeenCalledOnce()
  })

  it('runs a single-button stack immediately', () => {
    mockFinePointer(false)
    const { actions, stack } = createStack(1)

    actions[0].button.click()

    expect(actions[0].action).toHaveBeenCalledOnce()
    expect(stack.classList.contains('is-expanded')).toBe(false)
  })

  it('leaves mouse devices to the hover styles', () => {
    mockFinePointer(true)
    const { actions, stack } = createStack(3)

    actions[2].button.click()

    expect(actions[2].action).toHaveBeenCalledOnce()
    expect(stack.classList.contains('is-expanded')).toBe(false)
  })
})
