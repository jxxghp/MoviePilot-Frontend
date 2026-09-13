import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { Plugin, PluginRestorableInstance } from '@/api/types'
import PluginCloneDialog from '@/components/dialog/PluginCloneDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPluginRestorableInstances: vi.fn(),
}))

vi.mock('@/api/pluginClone', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/pluginClone')>()
  return { ...actual, getPluginRestorableInstances: mocks.getPluginRestorableInstances }
})

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_desc: '用于测试插件生命周期',
  plugin_icon: 'demo.png',
  installed: true,
}

const restorable: PluginRestorableInstance[] = [
  {
    instance_id: 'DemoPlugin2',
    suffix: '2',
    plugin_name: '工作分身',
    plugin_desc: '停用前登记的描述',
    has_config: true,
  },
]

/** 渲染分身弹窗并注册真实关闭按钮。 */
async function renderDialog(props: Record<string, unknown> = {}) {
  return renderWithProviders(PluginCloneDialog, {
    props: { modelValue: true, plugin, ...props },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

/** 取出最后一次提交的载荷。 */
function lastSubmission(emitted: Record<string, unknown[]>) {
  const events = emitted.clone as unknown[][]
  return events.at(-1)?.[0] as { request: Record<string, unknown>; restoring: boolean }
}

/** 填写后缀输入框。 */
async function fillSuffix(value: string) {
  await fireEvent.update(screen.getByLabelText('分身后缀（可选）'), value)
}

describe('PluginCloneDialog', () => {
  beforeEach(() => {
    mocks.getPluginRestorableInstances.mockReset().mockResolvedValue(restorable)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('后缀留空时说清会发生什么，并把后缀送成 null 交给服务端分配', async () => {
    const { emitted } = await renderDialog()

    expect(await screen.findByText('留空提交即请求服务端自动分配一个未被占用的后缀。')).toBeInTheDocument()
    expect(
      screen.getByText(
        '号段从 2 起（本体算第 1 个）；已装插件、已停用的分身、磁盘上留存的插件包目录都算占号，所以号码可能跳。',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('自动分配不会挑中下面清单里的任何一个号：不主动点恢复，就不会凭空继承到别人的配置。'),
    ).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '创建分身' }))

    expect(lastSubmission(emitted())).toEqual({
      request: {
        suffix: null,
        name: '演示插件 分身',
        description: '用于测试插件生命周期 (分身版本)',
        icon: 'demo.png',
        restore_previous: true,
      },
      restoring: false,
    })
  })

  it('后缀不合规时当场标红并挡住提交', async () => {
    const { emitted } = await renderDialog()
    await fillSuffix('工作-1')

    expect(await screen.findByText('只能包含英文字母和数字')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '创建分身' }))

    expect(emitted().clone).toBeUndefined()
  })

  it('超长后缀按长度规则挡住，而不是等服务端 422', async () => {
    await renderDialog()
    await fillSuffix('a'.repeat(21))

    expect(await screen.findByText('长度不能超过20个字符')).toBeInTheDocument()
  })

  it('前端放行的后缀仍然明说以服务端为准', async () => {
    await renderDialog()
    await fillSuffix('Work')

    expect(
      await screen.findByText('这里的校验只是即时提醒；后缀能否使用以服务端为准，例如这个号已被占用。'),
    ).toBeInTheDocument()
  })

  it('可恢复清单只列已停用的分身，并说明它与新建是同一个入口', async () => {
    await renderDialog()

    expect(await screen.findByText('工作分身')).toBeInTheDocument()
    expect(mocks.getPluginRestorableInstances).toHaveBeenCalledWith('DemoPlugin')
    expect(screen.getByText('这里只列已停用的分身；启用中的分身配置正被使用，恢复它没有意义。')).toBeInTheDocument()
    expect(
      screen.getByText('恢复和新建是同一个入口：点一行即把它的后缀填进上面的输入框，提交就是恢复那一行。'),
    ).toBeInTheDocument()
    expect(screen.getByText('留有业务参数')).toBeInTheDocument()
  })

  it('点选一行即把后缀填进输入框，并清空展示信息以沿用停用前登记的那份', async () => {
    const { emitted } = await renderDialog()

    await fireEvent.click(await screen.findByTestId('clone-restorable-DemoPlugin2'))

    expect(screen.getByLabelText('分身后缀（可选）')).toHaveValue('2')
    expect(
      screen.getByText('名称、描述、图标留空表示沿用这个分身停用前登记的那份；填了就以填的为准，会覆盖掉原来的。'),
    ).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '恢复分身' }))

    expect(lastSubmission(emitted())).toEqual({
      request: { suffix: '2', name: '', description: '', icon: '', restore_previous: true },
      restoring: true,
    })
  })

  it('手填的后缀命中已停用分身时同样转成恢复，大小写不影响判定', async () => {
    mocks.getPluginRestorableInstances.mockResolvedValue([{ ...restorable[0], suffix: 'Work' }])
    await renderDialog()
    await screen.findByText('工作分身')

    await fillSuffix('work')

    expect(
      await screen.findByText('这个后缀名下有一个已停用的分身「工作分身」：提交即是恢复它，而不是新建。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '恢复分身' })).toBeInTheDocument()
  })

  it('取舍旧配置的开关置假后按模板重建，提交里如实带上 restore_previous', async () => {
    const { emitted } = await renderDialog()
    await fireEvent.click(await screen.findByTestId('clone-restorable-DemoPlugin2'))

    const toggle = screen.getByLabelText('沿用停用前留存的业务参数')
    await fireEvent.click(toggle)

    expect(await screen.findByText('丢弃留存的旧配置，按插件模板重建一份空的。')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '恢复分身' }))

    expect(lastSubmission(emitted()).request.restore_previous).toBe(false)
  })

  it('没有已停用的分身时明说只能新建', async () => {
    mocks.getPluginRestorableInstances.mockResolvedValue([])
    await renderDialog()

    expect(await screen.findByTestId('clone-restorable-empty')).toHaveTextContent(
      '该插件没有已停用的分身，当前只能新建。',
    )
  })

  it('清单读取失败不挡住新建，但明说判断不出后缀名下是否留有旧配置', async () => {
    mocks.getPluginRestorableInstances.mockRejectedValue(new Error('network unavailable'))
    const { emitted } = await renderDialog()

    expect(
      await screen.findByText('可恢复分身清单读取失败：仍可新建，但判断不出填写的后缀名下是否留有旧配置。'),
    ).toBeInTheDocument()

    // 判断不出是否留有旧配置时保持服务端默认值，宁可沿用也不悄悄丢掉用户配好的参数
    await fillSuffix('Work')
    await fireEvent.click(screen.getByRole('button', { name: '创建分身' }))

    expect(lastSubmission(emitted()).request).toMatchObject({ suffix: 'Work', restore_previous: true })
  })

  it('把服务端 422 的字段级结论画到后缀输入框上，改动后缀即作废', async () => {
    const { rerender } = await renderDialog()
    await fillSuffix('Work')
    await rerender({ modelValue: true, plugin, fieldErrors: { suffix: ['该后缀已被占用'] } })

    expect(await screen.findByText('该后缀已被占用')).toBeInTheDocument()

    await fillSuffix('Work2')

    await waitFor(() => expect(screen.queryByText('该后缀已被占用')).toBeNull())
  })

  it('分身不能再建分身，直接指出该回到哪个源插件', async () => {
    const { emitted } = await renderDialog({
      plugin: { ...plugin, id: 'DemoPlugin2', is_instance: true, source_plugin_id: 'DemoPlugin' },
    })

    expect(await screen.findByTestId('clone-of-clone-notice')).toHaveTextContent(
      '这是一个分身，分身不能再建分身。请回到源插件 DemoPlugin 上创建。',
    )
    expect(mocks.getPluginRestorableInstances).not.toHaveBeenCalled()

    await fireEvent.click(screen.getByRole('button', { name: '创建分身' }))
    expect(emitted().clone).toBeUndefined()
  })

  it('手填的后缀命中恢复项时同样清空展示信息，此后用户填写的值不再被冲掉', async () => {
    // 点清单行与手填同一个后缀必须等效：否则新建用的默认名称会被当成用户意图送出去，
    // 把这个分身停用前登记的展示信息盖掉
    const { emitted } = await renderDialog()
    await screen.findByText('工作分身')

    await fillSuffix('2')

    expect(screen.getByLabelText('分身名称')).toHaveValue('')
    expect(screen.getByLabelText('分身描述')).toHaveValue('')
    expect(screen.getByLabelText('图标URL')).toHaveValue('')

    // 命中之后用户主动填写的覆盖值要留住，不能因为他继续敲后缀就被反复清掉
    await fireEvent.update(screen.getByLabelText('分身名称'), '我改过的名字')
    await fillSuffix('2')

    expect(screen.getByLabelText('分身名称')).toHaveValue('我改过的名字')

    await fireEvent.click(screen.getByRole('button', { name: '恢复分身' }))

    expect(lastSubmission(emitted()).request).toMatchObject({ suffix: '2', name: '我改过的名字' })
  })

  it('恢复模式下底部提示换成恢复文案，不再讲创建流程', async () => {
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('clone-restorable-DemoPlugin2'))

    expect(screen.getByTestId('clone-notice')).toHaveTextContent(
      '恢复出来的分身同样默认为禁用状态，需要手动启用。它用的还是原来那个实例 ID，是同一个分身，不是新建的一个。',
    )
    expect(screen.getByTestId('clone-notice')).not.toHaveTextContent('分身后缀一旦确定无法修改')
  })

  it('服务端把校验结论落在非后缀字段上时，同样画到对应的输入框', async () => {
    const { rerender } = await renderDialog()

    await rerender({
      modelValue: true,
      plugin,
      fieldErrors: { name: ['名称过长'], description: ['描述含有非法字符'], icon: ['图标地址不合法'] },
    })

    expect(await screen.findByText('名称过长')).toBeInTheDocument()
    expect(screen.getByText('描述含有非法字符')).toBeInTheDocument()
    expect(screen.getByText('图标地址不合法')).toBeInTheDocument()
  })

  it('对不上任何输入框的校验结论单独列出，不被悄悄丢掉', async () => {
    const { rerender } = await renderDialog()

    await rerender({ modelValue: true, plugin, fieldErrors: { form: ['请求体不合法'] } })

    expect(await screen.findByTestId('clone-form-errors')).toHaveTextContent('请求体不合法')
  })

  it('改动某个字段只作废它自己的旧结论，别的字段仍标着红', async () => {
    const { rerender } = await renderDialog()
    await rerender({ modelValue: true, plugin, fieldErrors: { suffix: ['该后缀已被占用'], name: ['名称过长'] } })
    await screen.findByText('该后缀已被占用')

    await fillSuffix('Work2')

    await waitFor(() => expect(screen.queryByText('该后缀已被占用')).toBeNull())
    expect(screen.getByText('名称过长')).toBeInTheDocument()
  })

  it('通过 modelValue 契约关闭', async () => {
    const { emitted } = await renderDialog()

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const closeButton = document.querySelector<HTMLButtonElement>('.absolute.right-3.top-3')
    expect(closeButton).not.toBeNull()
    await fireEvent.click(closeButton!)

    expect(emitted()['update:modelValue']).toContainEqual([false])
    expect(emitted().close).toHaveLength(1)
  })
})
