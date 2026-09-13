import { ApiRequestError } from '@/api/client'
import {
  createPluginClone,
  getPluginCloneFieldIssues,
  getPluginClonePartialOutcome,
  getPluginRestorableInstances,
} from '@/api/pluginClone'
import type { PluginRestorableInstance } from '@/api/types'
import { AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
}))

/** 构造带 HTTP 状态与原始载荷的请求错误，用于校验错误解析路径。 */
function createHttpError(status: number, payload: unknown): ApiRequestError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  const response: AxiosResponse = {
    config,
    data: payload,
    headers: new AxiosHeaders(),
    status,
    statusText: String(status),
  }
  return new ApiRequestError('Request failed', { payload, response })
}

const restorable: PluginRestorableInstance[] = [
  {
    instance_id: 'DemoPlugin2',
    suffix: '2',
    plugin_name: '演示插件 分身',
    plugin_desc: '停用前登记的描述',
    has_config: true,
  },
]

describe('plugin clone API adapters', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
  })

  it('创建分身时把表单原样送到克隆端点，实例 ID 从回执取', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, message: '', data: { instance_id: 'DemoPlugin3' } })

    const outcome = await createPluginClone('DemoPlugin', {
      suffix: null,
      name: '',
      description: '',
      icon: '',
      restore_previous: true,
    })

    expect(mocks.apiPost).toHaveBeenCalledWith('plugin/clone/DemoPlugin', {
      suffix: null,
      name: '',
      description: '',
      icon: '',
      restore_previous: true,
    })
    expect(outcome.instance_id).toBe('DemoPlugin3')
  })

  it('插件 ID 里的特殊字符不会改变克隆与可恢复清单的请求路径层级', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, message: '', data: { instance_id: 'x' } })
    mocks.apiGet.mockResolvedValue([])

    await createPluginClone('Demo/Plugin', {})
    await getPluginRestorableInstances('Demo Plugin')

    expect(mocks.apiPost).toHaveBeenCalledWith('plugin/clone/Demo%2FPlugin', {})
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/clone/Demo%20Plugin/restorable')
  })

  it('可恢复清单不带分页参数，一次取回完整清单', async () => {
    mocks.apiGet.mockResolvedValue(restorable)

    const items = await getPluginRestorableInstances('DemoPlugin')

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/clone/DemoPlugin/restorable')
    expect(items).toEqual(restorable)
  })

  it('分身已建成但补挂失败时，从业务失败里读回实例 ID', async () => {
    // success 为假但 data.instance_id 有值：那个实例真的存在，重试创建只会撞「已存在」
    mocks.apiPost.mockResolvedValue({
      success: false,
      message: '分身已创建，但注册定时任务失败',
      data: { instance_id: 'DemoPlugin2' },
    })

    const error = await createPluginClone('DemoPlugin', {}).catch(reason => reason)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(getPluginClonePartialOutcome(error)).toEqual({ instance_id: 'DemoPlugin2' })
  })

  it('没建成的业务失败不会被当成已建成', async () => {
    mocks.apiPost.mockResolvedValue({ success: false, message: '后缀已被占用', data: null })

    const error = await createPluginClone('DemoPlugin', {}).catch(reason => reason)

    expect(getPluginClonePartialOutcome(error)).toBeNull()
  })

  it('422 的 pydantic 明细被解成字段级结论，而不是只剩一句请求失败', () => {
    const error = createHttpError(422, {
      detail: [
        { loc: ['body', 'suffix'], msg: '后缀只能包含英文字母和数字', type: 'string_pattern_mismatch' },
        { loc: ['body', 'suffix'], msg: '   ', type: 'ignored' },
      ],
    })

    expect(getPluginCloneFieldIssues(error)).toEqual([{ field: 'suffix', message: '后缀只能包含英文字母和数字' }])
  })

  it('非 422 的失败不产出字段级结论，避免把业务失败画到输入框上', () => {
    const businessFailure = new ApiRequestError('后缀已被占用', {
      businessFailure: true,
      payload: { success: false, message: '后缀已被占用', data: null },
    })

    expect(getPluginCloneFieldIssues(businessFailure)).toEqual([])
    expect(getPluginCloneFieldIssues(createHttpError(500, { detail: [{ loc: ['body'], msg: '崩了' }] }))).toEqual([])
  })
})
