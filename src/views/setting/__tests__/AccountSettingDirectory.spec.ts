import AccountSettingDirectory from '@/views/setting/AccountSettingDirectory.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/components/cards/DirectoryCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return { default: defineComponent({ name: 'DirectoryCardStub', template: '<div />' }) }
})

vi.mock('@/components/cards/StorageCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return { default: defineComponent({ name: 'StorageCardStub', template: '<div />' }) }
})

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'DraggableStub',
      setup(_props, { slots }) {
        return () => h('div', slots.default?.())
      },
    }),
  }
})

const AceEditorStub = defineComponent({
  name: 'VAceEditor',
  props: {
    value: { type: String, default: '' },
  },
  template: '<div />',
})

function mockSettings(settingValue: boolean | null) {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'system/setting/public/Directories') return { data: { value: [] } }
    if (endpoint === 'system/setting/public/Storages') return { data: { value: [] } }
    if (endpoint === 'media/category') return {}
    if (endpoint === 'system/env') return { data: {}, success: true }
    if (endpoint === 'system/setting/MountedLocalDiskDeleteEmptyDirs') {
      return { data: { value: settingValue }, success: true }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
  mocks.apiPost.mockResolvedValue({ success: true })
}

async function renderDirectorySettings() {
  return renderWithProviders(AccountSettingDirectory, {
    global: {
      stubs: {
        VAceEditor: AceEditorStub,
      },
    },
  })
}

describe('mounted local disk empty directory cleanup setting', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('defaults to enabled when no saved value exists', async () => {
    mockSettings(null)

    await renderDirectorySettings()

    expect(await screen.findByRole('checkbox', { name: '挂载盘删除空目录' })).toBeChecked()
  })

  it('saves the disabled value with the organization settings', async () => {
    mockSettings(true)
    await renderDirectorySettings()
    const cleanupSwitch = await screen.findByRole('checkbox', { name: '挂载盘删除空目录' })
    await fireEvent.click(cleanupSwitch)

    const organizeCard = screen.getByText('整理 & 刮削').closest('.v-card')
    expect(organizeCard).not.toBeNull()
    await fireEvent.click(within(organizeCard as HTMLElement).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/MountedLocalDiskDeleteEmptyDirs', false)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('整理选项设置保存成功')
  })
})
