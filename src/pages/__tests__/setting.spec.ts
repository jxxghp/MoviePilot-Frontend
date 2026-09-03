import SettingPage from '@/pages/setting.vue'
import { waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import type { Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

/** 读取页头注册项中的设置标签列表。 */
function registeredSettingTabs(): Array<{ tab: string }> {
  const registration = mocks.registerHeaderTab.mock.calls[0]?.[0] as { items?: Ref<Array<{ tab: string }>> } | undefined
  expect(registration?.items).toBeDefined()
  return registration!.items!.value
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

  it('注册包含自动分类入口的设置标签，并保持标签值与窗口一致', async () => {
    await renderSettingPage()

    expect(registeredSettingTabs()).toEqual(
      expect.arrayContaining([expect.objectContaining({ tab: 'classification' })]),
    )
  })
})
