import ResourceSearchEmptyState from '@/components/states/ResourceSearchEmptyState.vue'
import { screen, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('ResourceSearchEmptyState', () => {
  it('presents the result context and keeps action controls inside the status region', async () => {
    await renderWithProviders(ResourceSearchEmptyState, {
      props: {
        description: '调整筛选条件后再试。',
        query: '示例搜索词',
        title: '没有找到匹配的资源',
      },
      slots: {
        actions: '<button type="button">重新搜索</button>',
      },
    })

    const status = screen.getByRole('status', { name: '没有找到匹配的资源' })
    expect(status).toHaveTextContent('调整筛选条件后再试。')
    expect(status).toHaveTextContent('示例搜索词')
    expect(within(status).getByRole('button', { name: '重新搜索' })).toBeInTheDocument()
  })
})
