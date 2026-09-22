import { describe, expect, it } from 'vitest'

import type { Plugin } from '@/api/types'
import { resolvePluginInstallBlock } from '@/composables/usePluginInstallBlock'

describe('resolvePluginInstallBlock', () => {
  it('returns null when nothing blocks the install', () => {
    expect(resolvePluginInstallBlock(undefined)).toBeNull()
    expect(resolvePluginInstallBlock({ id: 'Demo' } as Plugin)).toBeNull()
    expect(
      resolvePluginInstallBlock({ id: 'Demo', runtime_compatible: true, system_version_compatible: true } as Plugin),
    ).toBeNull()
  })

  it('reports the runtime reason before the system version reason', () => {
    // v3t 上把运行时不兼容报成版本问题会把用户引向错误的处置方式
    const block = resolvePluginInstallBlock({
      id: 'Demo',
      runtime_compatible: false,
      runtime_message: '插件声明不支持 free-threaded 运行时（v3t）',
      system_version_compatible: false,
      system_version_message: '需要更高版本',
    } as Plugin)

    expect(block?.message).toBe('插件声明不支持 free-threaded 运行时（v3t）')
    expect(block?.fallbackKey).toBe('plugin.incompatibleRuntime')
  })

  it('falls back to a local message key when the backend gives no reason', () => {
    const block = resolvePluginInstallBlock({ id: 'Demo', runtime_compatible: false } as Plugin)

    expect(block?.message).toBeUndefined()
    expect(block?.fallbackKey).toBe('plugin.incompatibleRuntime')
  })

  it('still reports the system version reason on a standard runtime', () => {
    const block = resolvePluginInstallBlock({
      id: 'Demo',
      system_version_compatible: false,
      system_version_message: '需要更高版本',
    } as Plugin)

    expect(block?.message).toBe('需要更高版本')
    expect(block?.fallbackKey).toBe('plugin.incompatibleSystemVersion')
  })
})
