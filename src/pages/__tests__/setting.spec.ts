import SettingPage from '@/pages/setting.vue'
import { waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { readFileSync } from 'node:fs'
import { cwd } from 'node:process'
import { resolve } from 'node:path'
import type { Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const settingPageSource = readFileSync(resolve(cwd(), 'src/pages/setting.vue'), 'utf8')

const mocks = vi.hoisted(() => ({
  registerHeaderTab: vi.fn(),
  route: null as unknown as { query: { tab: string | string[] | undefined } },
}))

vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>()
  const { reactive } = await import('vue')
  mocks.route = reactive({ query: { tab: 'directory' as string | string[] | undefined } })
  return { ...actual, useRoute: () => mocks.route }
})

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/router/i18n-menu', () => ({
  getSettingTabs: () => [
    { title: '系统', icon: 'mdi-server-network', tab: 'system' },
    { title: '目录', icon: 'mdi-folder', tab: 'directory' },
    { title: '分类', icon: 'mdi-file-tree', tab: 'classification' },
  ],
}))

/** 返回设置页注册到页头的活动标签响应式引用。 */
function registeredActiveTab(): Ref<string> {
  const registration = mocks.registerHeaderTab.mock.calls[0]?.[0] as { modelValue?: Ref<string> } | undefined
  expect(registration?.modelValue).toBeDefined()
  return registration!.modelValue!
}

/** 渲染设置页框架但不实例化各异步设置面板。 */
async function renderSettingPage() {
  return renderWithProviders(SettingPage, {
    global: {
      stubs: {
        VWindow: { template: '<div data-testid="setting-window" />' },
      },
    },
  })
}

describe('setting page', () => {
  beforeEach(() => {
    mocks.registerHeaderTab.mockReset()
    mocks.route.query.tab = 'directory'
    document.documentElement.classList.remove('settings-page-header-tabs-active')
  })

  it('响应有效的 route.query.tab 变化并忽略未知标签', async () => {
    await renderSettingPage()
    const activeTab = registeredActiveTab()
    expect(activeTab.value).toBe('directory')

    mocks.route.query.tab = 'classification'
    await waitFor(() => expect(activeTab.value).toBe('classification'))

    mocks.route.query.tab = 'missing'
    await waitFor(() => expect(activeTab.value).toBe('classification'))
  })

  it('无效初始标签回退到第一个设置页', async () => {
    mocks.route.query.tab = 'missing'
    await renderSettingPage()

    await waitFor(() => expect(registeredActiveTab().value).toBe('system'))
  })

  it('仅在设置页活动期间启用页头样式作用域', async () => {
    const { unmount } = await renderSettingPage()

    expect(document.documentElement).toHaveClass('settings-page-header-tabs-active')

    unmount()
    expect(document.documentElement).not.toHaveClass('settings-page-header-tabs-active')
  })

  it('移动端页头标签等宽并复用玻璃主题材质 token', () => {
    expect(settingPageSource).toContain('flex: 0 0 calc(100% / 3)')
    expect(settingPageSource).toContain('block-size: 44px')
    expect(settingPageSource).toContain('font-size: 0.875rem')
    expect(settingPageSource).toContain('flex: 0 0 20px')
    expect(settingPageSource).toContain('var(--glass-surface-soft)')
    expect(settingPageSource).toContain('var(--glass-border)')
    expect(settingPageSource).toContain('var(--glass-sheen)')
    expect(settingPageSource).toContain('var(--glass-control-prominent)')
  })
})
