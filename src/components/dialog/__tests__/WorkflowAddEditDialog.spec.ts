import WorkflowAddEditDialog from '@/components/dialog/WorkflowAddEditDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workflow } from '@/api/types'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  done: vi.fn(),
  start: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
  }),
}))

vi.mock('@/api/nprogress', () => ({
  doneNProgress: mocks.done,
  startNProgress: mocks.start,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const DialogStub = defineComponent({
  name: 'VDialog',
  setup(_, { slots }) {
    return () => h('div', { role: 'dialog' }, slots.default?.())
  },
})

const DialogCloseBtnStub = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_, { emit }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, '关闭')
  },
})

const TextFieldStub = defineComponent({
  name: 'VTextFieldStub',
  props: {
    label: String,
    modelValue: { type: [String, Number], default: '' },
    type: { type: String, default: 'text' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('label', [
        props.label,
        h('input', {
          'aria-label': props.label,
          type: props.type,
          value: props.modelValue ?? '',
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
      ])
  },
})

const TextareaStub = defineComponent({
  name: 'VTextareaStub',
  props: {
    label: String,
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('label', [
        props.label,
        h('textarea', {
          'aria-label': props.label,
          value: props.modelValue ?? '',
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
        }),
      ])
  },
})

const CronFieldStub = defineComponent({
  name: 'VCronFieldStub',
  props: {
    label: String,
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('label', [
        props.label,
        h('input', {
          'aria-label': props.label,
          value: props.modelValue ?? '',
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
      ])
  },
})

type SelectItem = { title: string; value: string }

const SelectStub = defineComponent({
  name: 'VSelectStub',
  props: {
    label: String,
    items: { type: Array as PropType<SelectItem[]>, default: () => [] },
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('label', [
        props.label,
        h(
          'select',
          {
            'aria-label': props.label,
            value: props.modelValue ?? '',
            onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
          },
          [
            h('option', { value: '' }, '请选择'),
            ...props.items.map(item => h('option', { key: item.value, value: item.value }, item.title)),
          ],
        ),
      ])
  },
})

const ButtonStub = defineComponent({
  name: 'VBtnStub',
  props: {
    disabled: { type: Boolean, default: false },
  },
  setup(props, { slots, attrs }) {
    return () => h('button', { ...attrs, disabled: props.disabled, type: 'button' }, slots.default?.())
  },
})

function workflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'workflow-1',
    name: '测试工作流',
    trigger_type: 'timer',
    timer: '*/5 * * * *',
    state: 'P',
    run_count: 0,
    execution_config: {},
    ...overrides,
  }
}

async function renderDialog(props: { workflow?: Workflow } = {}) {
  const events = { close: vi.fn(), save: vi.fn() }
  const result = await renderWithProviders(WorkflowAddEditDialog, {
    props: {
      ...props,
      onClose: events.close,
      onSave: events.save,
    },
    global: {
      stubs: {
        VBtn: ButtonStub,
        VDialog: DialogStub,
        VDialogCloseBtn: DialogCloseBtnStub,
        VCronField: CronFieldStub,
        VSelect: SelectStub,
        VTextField: TextFieldStub,
        VTextarea: TextareaStub,
      },
    },
  })
  return { ...result, events }
}

async function fillName(name = '新增工作流') {
  await fireEvent.update(screen.getByLabelText('名称'), name)
}

async function selectTriggerType(value: 'timer' | 'event' | 'manual') {
  await fireEvent.update(screen.getByLabelText('触发类型'), value)
}

describe('WorkflowAddEditDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.done.mockReset()
    mocks.start.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiGet.mockResolvedValue([{ title: '下载完成', value: 'download.completed' }])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does not mutate an incoming workflow when applying the timer fallback', async () => {
    const incoming = workflow({ trigger_type: undefined })

    await renderDialog({ workflow: incoming })

    expect(incoming.trigger_type).toBeUndefined()
  })

  it('loads event types and clears a selected event when switching to a manual trigger', async () => {
    await renderDialog({ workflow: workflow({ trigger_type: 'event', event_type: 'download.completed' }) })

    await selectTriggerType('manual')

    expect(screen.queryByLabelText('事件类型')).not.toBeInTheDocument()
    await selectTriggerType('event')
    expect(screen.getByLabelText('事件类型')).toHaveValue('')
    expect(screen.getByRole('option', { name: '下载完成' })).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('workflow/event_types')
  })

  it('keeps the form usable when event type loading fails', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('event types unavailable'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderDialog()
    await selectTriggerType('event')

    expect(screen.getByLabelText('事件类型')).toHaveValue('')
    expect(screen.queryByRole('option', { name: '下载完成' })).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith('Failed to load event types:', expect.any(Error))
  })

  it('validates timer and event trigger requirements before creating a workflow', async () => {
    await renderDialog()

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(mocks.toastError).toHaveBeenCalledWith('请填写完整信息！')
    expect(mocks.apiPost).not.toHaveBeenCalled()

    await fillName()

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(mocks.toastError).toHaveBeenCalledWith('请填写定时表达式！')
    expect(mocks.apiPost).not.toHaveBeenCalled()

    await selectTriggerType('event')
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(mocks.toastError).toHaveBeenCalledWith('请选择事件类型！')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('creates an event workflow with the selected event type', async () => {
    mocks.apiPost.mockResolvedValueOnce({ success: true })
    await renderDialog()
    await fillName('事件工作流')
    await selectTriggerType('event')
    await fireEvent.update(screen.getByLabelText('事件类型'), 'download.completed')

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())
    expect(mocks.apiPost).toHaveBeenCalledWith(
      'workflow/',
      expect.objectContaining({ name: '事件工作流', trigger_type: 'event', event_type: 'download.completed' }),
    )
  })

  it('allows manual workflows without timer or event fields', async () => {
    mocks.apiPost.mockResolvedValueOnce({ success: true })
    await renderDialog()
    await fillName()
    await selectTriggerType('manual')

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())
    const payload = mocks.apiPost.mock.calls[0][1] as Workflow
    expect(payload).toMatchObject({ name: '新增工作流', trigger_type: 'manual' })
    expect(payload.timer).toBeUndefined()
    expect(payload.event_type).toBeUndefined()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('创建任务成功，请编辑流程！')
  })

  it('creates a timer workflow with the normalized payload and emits save on success', async () => {
    mocks.apiPost.mockResolvedValueOnce({ success: true })
    const { events } = await renderDialog()
    await fillName('定时工作流')
    await fireEvent.update(screen.getByLabelText('定时执行'), '0 */2 * * *')
    await fireEvent.update(screen.getByLabelText('描述'), '定时执行说明')
    await fireEvent.update(screen.getByLabelText('最大并行数'), '3.9')

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())
    expect(mocks.apiPost).toHaveBeenCalledWith(
      'workflow/',
      expect.objectContaining({
        name: '定时工作流',
        timer: '0 */2 * * *',
        description: '定时执行说明',
        trigger_type: 'timer',
        execution_config: { max_workers: 3 },
      }),
    )
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(mocks.done).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('创建任务成功，请编辑流程！')
    expect(events.save).toHaveBeenCalledOnce()
  })

  it('normalizes positive integer max_workers and removes empty values while preserving other config', async () => {
    mocks.apiPut.mockResolvedValueOnce({ success: true })
    const existing = workflow({ execution_config: { max_workers: '4', keep: 'value' } })
    const { events } = await renderDialog({ workflow: existing })

    const maxWorkers = screen.getByLabelText('最大并行数')
    expect(maxWorkers).toHaveValue(4)
    await fireEvent.update(maxWorkers, '')
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledOnce())
    expect(mocks.apiPut.mock.calls[0][1]).toMatchObject({ execution_config: { keep: 'value' } })
    expect(mocks.apiPut.mock.calls[0][1].execution_config).not.toHaveProperty('max_workers')
    expect(events.save).toHaveBeenCalledOnce()
  })

  it('updates an existing workflow and emits save only after the update succeeds', async () => {
    mocks.apiPut.mockResolvedValueOnce({ success: true })
    const { events } = await renderDialog({ workflow: workflow({ name: '旧名称' }) })
    await fireEvent.update(screen.getByLabelText('名称'), '新名称')

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledOnce())
    expect(mocks.apiPut).toHaveBeenCalledWith(
      'workflow/workflow-1',
      expect.objectContaining({ id: 'workflow-1', name: '新名称', trigger_type: 'timer' }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('修改任务成功！')
    expect(events.save).toHaveBeenCalledOnce()
  })

  it.each([
    ['business', { success: false, message: '名称已存在' }],
    ['HTTP', new Error('network failure')],
  ])('does not emit save when creation %s fails', async (_kind, failure) => {
    mocks.apiPost.mockImplementationOnce(async () => {
      if (failure instanceof Error) throw failure
      return failure
    })
    const { events } = await renderDialog()
    await fillName()
    await fireEvent.update(screen.getByLabelText('定时执行'), '*/5 * * * *')

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(events.save).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it.each([
    ['business', { success: false, message: '更新被拒绝' }],
    ['HTTP', new Error('network failure')],
  ])('does not emit save when updating %s fails', async (_kind, failure) => {
    mocks.apiPut.mockImplementationOnce(async () => {
      if (failure instanceof Error) throw failure
      return failure
    })
    const { events } = await renderDialog({ workflow: workflow() })

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(events.save).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })
})
