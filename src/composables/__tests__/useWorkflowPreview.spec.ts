import { getWorkflowPreviewActionCount } from '@/composables/useWorkflowPreview'
import { describe, expect, it } from 'vitest'

describe('getWorkflowPreviewActionCount', () => {
  it('shows every action when the complete workflow fits', () => {
    expect(getWorkflowPreviewActionCount(167, 4)).toBe(4)
    expect(getWorkflowPreviewActionCount(355, 8)).toBe(8)
  })

  it('uses available width to reveal more nodes or collapse overflow', () => {
    expect(getWorkflowPreviewActionCount(155, 8)).toBe(2)
    expect(getWorkflowPreviewActionCount(156, 8)).toBe(3)
    expect(getWorkflowPreviewActionCount(203, 8)).toBe(4)
  })

  it('reserves space for the overflow count even when no node fits', () => {
    expect(getWorkflowPreviewActionCount(31, 8)).toBe(0)
    expect(getWorkflowPreviewActionCount(32, 8)).toBe(0)
  })

  it('uses a small initial preview before the browser reports the container width', () => {
    expect(getWorkflowPreviewActionCount(0, 8)).toBe(3)
    expect(getWorkflowPreviewActionCount(0, 2)).toBe(2)
    expect(getWorkflowPreviewActionCount(100, 0)).toBe(0)
  })
})
