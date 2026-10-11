import SubscribeLogDialog from '@/components/dialog/SubscribeLogDialog.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { createSubscribe } from '@tests/support/factories/subscribe'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 隔离流读取，保留真实的 Vuetify 弹窗和响应式布局。 */
vi.mock('@/views/system/LoggingView.vue', () => ({
  __esModule: true,
  default: {
    props: ['streamUrl', 'emptyText'],
    template: '<div data-testid="subscription-log-stream" :data-url="streamUrl">{{ emptyText }}</div>',
  },
}))

describe('SubscribeLogDialog', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  it.each([1280, 390])('shows the correct identity and log source at %s px', async width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
    window.dispatchEvent(new Event('resize'))
    const { unmount } = await renderWithProviders(SubscribeLogDialog, {
      global: {
        stubs: { VDialogCloseBtn: { template: '<button @click="$emit(\'update:modelValue\', false)">关闭</button>' } },
      },
      props: { subscription: createSubscribe({ id: 17, name: '测试订阅', year: '2026', season: 2, type: '电视剧' }) },
    })
    expect(await screen.findByText('测试订阅 · 2026 · S02')).toBeInTheDocument()
    expect(await screen.findByTestId('subscription-log-stream')).toHaveAttribute(
      'data-url',
      '/api/v1/subscribe/17/logs',
    )
    expect(screen.getByText('暂无执行日志，下一次搜索或 RSS 匹配后开始记录。')).toBeInTheDocument()
    const dialog = document.querySelector('.v-dialog')
    expect(dialog?.classList.contains('v-dialog--fullscreen')).toBe(width < 960)
    await fireEvent.click(screen.getByRole('button', { name: '下载' }))
    expect(window.open).toHaveBeenCalledWith('/api/v1/subscribe/17/logs/download', '_blank', 'noopener')
    await fireEvent.click(screen.getByRole('button', { name: '在新窗口中打开' }))
    expect(window.open).toHaveBeenCalledWith('/api/v1/subscribe/17/logs?length=-1', '_blank', 'noopener')
    unmount()
  })
})
