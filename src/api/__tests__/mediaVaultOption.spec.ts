import { mediaServerDict, mediaServerOptions } from '@/api/constants'
import { getLogoUrl } from '@/utils/imageUtils'
import { describe, expect, it } from 'vitest'

describe('MediaVault 媒体服务器接入', () => {
  it('出现在媒体服务器类型选项里', () => {
    const values = mediaServerOptions.map(option => option.value)

    expect(values).toContain('mediavault')
    // 排在既有类型之后，避免打乱用户已经熟悉的顺序
    expect(values.indexOf('mediavault')).toBe(values.length - 1)
  })

  it('类型名称有对应文案，不回退成键名', () => {
    const title = mediaServerDict.mediavault

    expect(title).toBeTruthy()
    expect(title).not.toContain('setting.system')
  })

  it('有自己的图标，不落到通用媒体服务器图标', () => {
    const logo = getLogoUrl('mediavault')

    expect(logo).toBeTruthy()
    expect(logo).not.toBe(getLogoUrl('mediaserver'))
  })
})
