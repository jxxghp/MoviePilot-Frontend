import { loadModuleCatalog, useModuleCatalog } from '@/composables/useModuleCatalog'
import { getLogoUrl } from '@/utils/imageUtils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

describe('MediaVault 媒体服务器接入', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiGet.mockResolvedValue({
      modules: [
        {
          id: 'MediaVaultModule',
          name: 'MediaVault',
          name_i18n: 'MediaVault',
          type: 'mediaserver',
          subtype: 'MediaVault',
          option_value: 'mediavault',
          enabled: true,
          active: true,
        },
      ],
    })
  })

  it('从后端模块目录构造媒体服务器类型选项', async () => {
    await loadModuleCatalog(true)
    const { moduleOptions } = useModuleCatalog()

    expect(moduleOptions('mediaserver').value).toEqual([
      { moduleId: 'MediaVaultModule', title: 'MediaVault', value: 'mediavault' },
    ])
    expect(mocks.apiGet).toHaveBeenCalledWith('system/module-catalog')
  })

  it('有自己的图标，不落到通用媒体服务器图标', () => {
    const logo = getLogoUrl('mediavault')

    expect(logo).toBeTruthy()
    expect(logo).not.toBe(getLogoUrl('mediaserver'))
  })
})
