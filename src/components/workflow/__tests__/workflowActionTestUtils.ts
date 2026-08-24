import { defineComponent, h } from 'vue'

/** 将布局和连接器替换为可预测的容器，测试只观察动作配置数据。 */
export const BoxStub = defineComponent({
  name: 'WorkflowActionBoxStub',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.())
  },
})

/** 暴露 VSelect 的 items，避免测试依赖 Vuetify 菜单和 Teleport 实现。 */
export const SelectStub = defineComponent({
  name: 'WorkflowActionSelectStub',
  inheritAttrs: false,
  props: {
    label: {
      type: String,
      default: '',
    },
    items: {
      type: Array,
      default: () => [],
    },
  },
  setup(props) {
    return () =>
      h('div', {
        'data-select-label': props.label,
        'data-select-items': JSON.stringify(props.items),
      })
  },
})

/** 输入控件仅保留可渲染形状；v-model 和 Vuetify 内部行为不属于本组契约。 */
export const InputStub = defineComponent({
  name: 'WorkflowActionInputStub',
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h('input', { 'aria-label': typeof attrs.label === 'string' ? attrs.label : undefined })
  },
})

export const workflowActionStubs = {
  Handle: BoxStub,
  VAvatar: BoxStub,
  VCard: BoxStub,
  VCardItem: BoxStub,
  VCardSubtitle: BoxStub,
  VCardText: BoxStub,
  VCardTitle: BoxStub,
  VCol: BoxStub,
  VDivider: BoxStub,
  VIcon: BoxStub,
  VPathField: InputStub,
  VRow: BoxStub,
  VSelect: SelectStub,
  VSwitch: InputStub,
  VTextField: InputStub,
}

/** 按业务字段读取稳定 stub 暴露的选项。 */
export function getSelectItems(container: ParentNode, label: string): unknown[] {
  const element = [...container.querySelectorAll<HTMLElement>('[data-select-items]')].find(
    item => item.dataset.selectLabel === label,
  )
  if (!element) throw new Error(`Select stub not found: ${label}`)
  return JSON.parse(element.dataset.selectItems ?? '[]') as unknown[]
}
