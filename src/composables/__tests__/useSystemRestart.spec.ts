import { beforeEach, describe, expect, it } from 'vitest'
import { useSystemRestartStatus } from '@/composables/useSystemRestart'

describe('useSystemRestartStatus', () => {
  beforeEach(() => {
    // 每个用例从非重启状态开始，避免模块级状态在用例间残留。
    useSystemRestartStatus().finishSystemRestart()
  })

  it('重启状态在多个调用方之间共享', () => {
    const first = useSystemRestartStatus()
    const second = useSystemRestartStatus()

    first.startSystemRestart()
    expect(second.isRestarting.value).toBe(true)

    second.finishSystemRestart()
    expect(first.isRestarting.value).toBe(false)
  })

  it('默认处于非重启状态', () => {
    expect(useSystemRestartStatus().isRestarting.value).toBe(false)
  })
})