import PathField from '@/components/field/PathField.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { server } from '@tests/support/msw/server'
import { apiJson } from '@tests/support/msw/response'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'

describe('PathInput bounded directory tree', () => {
  it('keeps later directories reachable through a load-more node without selecting its synthetic path', async () => {
    const pages: number[] = []
    const items = Array.from({ length: 201 }, (_, index) => ({
      type: 'dir',
      storage: 'local',
      name: `dir-${index}`,
      path: `/dir-${index}/`,
      children: [],
    }))
    server.use(
      http.post('http://localhost/api/v1/storage/list', async ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get('page'))
        expect(url.searchParams.get('count')).toBe('200')
        pages.push(page)
        return apiJson(items.slice((page - 1) * 200, page * 200))
      }),
    )
    const result = await renderWithProviders(PathField, { props: { label: '目录', modelValue: '/' } })
    await fireEvent.click(screen.getByLabelText('目录'))
    await screen.findByText('dir-0')
    expect(pages).toEqual([1])
    expect(screen.queryByText('dir-200')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByText('加载更多'))
    await waitFor(() => expect(pages).toEqual([1, 2]))
    expect(await screen.findByText('dir-200')).toBeInTheDocument()
    expect(screen.getByLabelText('目录')).toHaveValue('/')
    expect(result.emitted()['update:modelValue'] ?? []).not.toContainEqual([expect.stringContaining('__more__')])
  })
})
