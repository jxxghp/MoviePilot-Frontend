import { defineComponent, h, onMounted, onUnmounted, ref, resolveComponent, type App } from 'vue'
import { VBtn } from 'vuetify/components/VBtn'
import { VIcon } from 'vuetify/components/VIcon'
import { VTextField } from 'vuetify/components/VTextField'

/**
 * 极简运行时弹窗关闭按钮（免除主站 vue-i18n 依赖，完整兼容插件 `<VDialogCloseBtn>` / `<DialogCloseBtn>`）。
 */
export const ShellDialogCloseBtn = defineComponent({
  name: 'ShellDialogCloseBtn',
  props: {
    innerClass: { type: String, default: undefined },
  },
  emits: ['click', 'update:modelValue'],
  setup(props, { emit }) {
    const onClick = (event: MouseEvent) => {
      event.stopPropagation()
      emit('update:modelValue', false)
      emit('click')
    }
    return () =>
      h(
        VBtn,
        {
          'icon': true,
          'variant': 'text',
          'size': 'small',
          'data-native-dialog-close': '',
          'aria-label': '关闭',
          'class': props.innerClass ? props.innerClass : 'mp-shell-dialog-close-btn absolute right-3 top-3 z-10',
          onClick,
        },
        () => h(VIcon, { icon: 'mdi-close' }),
      )
  },
})

/**
 * 极简运行时页面标题组件（兼容插件 `<VPageContentTitle>`，零 vue-router 依赖）。
 */
export const ShellPageContentTitle = defineComponent({
  name: 'ShellPageContentTitle',
  props: {
    title: { type: String, default: '' },
  },
  setup(props) {
    return () =>
      props.title
        ? h('div', { 'class': 'my-3 mx-3 md:flex md:items-center md:justify-between', 'data-native-page-title': '' }, [
            h('div', { class: 'min-w-0 flex-1 mx-0' }, [
              h(
                'h2',
                {
                  class:
                    'ms-1 truncate text-2xl font-bold leading-7 text-high-emphasis sm:overflow-visible sm:text-3xl sm:leading-9 md:mb-0',
                },
                [h('span', { class: 'text-moviepilot' }, props.title)],
              ),
            ]),
          ])
        : null
  },
})

/**
 * 极简运行时回到顶部按钮（兼容插件 `<VScrollToTopBtn>`，零额外依赖）。
 */
export const ShellScrollToTopBtn = defineComponent({
  name: 'ShellScrollToTopBtn',
  setup() {
    const visible = ref(false)
    const onScroll = () => {
      if (typeof window !== 'undefined') {
        visible.value = window.scrollY > 200
      }
    }
    const scrollToTop = () => {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
    onMounted(() => {
      if (typeof window !== 'undefined') {
        window.addEventListener('scroll', onScroll, { passive: true })
        onScroll()
      }
    })
    onUnmounted(() => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', onScroll)
      }
    })
    return () =>
      visible.value
        ? h(
            VBtn,
            {
              'icon': true,
              'size': 'small',
              'variant': 'tonal',
              'color': 'primary',
              'aria-label': '回到顶部',
              'style': { position: 'fixed', right: '16px', bottom: 'calc(20px + var(--mp-safe-bottom))', zIndex: 100 },
              onClick: scrollToTop,
            },
            () => h(VIcon, { icon: 'mdi-chevron-up' }),
          )
        : null
  },
})

/**
 * 极简运行时 Cron 输入组件（兼容插件 `<VCronField>`，透传全部 VTextField 属性并自动享受 AppInput 移动适配）。
 */
export const ShellCronField = defineComponent({
  name: 'ShellCronField',
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: '' },
    clearable: { type: Boolean, default: true },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit, slots }) {
    return () => {
      const resolvedField = resolveComponent('VTextField')
      const FieldComponent = typeof resolvedField === 'string' ? VTextField : resolvedField
      return h(
        FieldComponent,
        {
          clearable: props.clearable,
          ...attrs,
          modelValue: props.modelValue,
          'onUpdate:modelValue': (value: string) => emit('update:modelValue', value),
        },
        slots,
      )
    }
  },
})

/**
 * 极简运行时路径输入组件（兼容插件 `<VPathField>`，免除主站 axios/Pinia/i18n 依赖）。
 */
export const ShellPathField = defineComponent({
  name: 'ShellPathField',
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: '/' },
    storage: { type: String, default: 'local' },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit, slots }) {
    return () => {
      const resolvedField = resolveComponent('VTextField')
      const FieldComponent = typeof resolvedField === 'string' ? VTextField : resolvedField
      return h(
        FieldComponent,
        {
          ...attrs,
          modelValue: props.modelValue,
          'onUpdate:modelValue': (value: string) => emit('update:modelValue', value),
        },
        slots,
      )
    }
  },
})

/**
 * 极简滚动容器垫片（兼容插件 `<PerfectScrollbar>`，移动端优先交由原生惯性滚动）。
 */
export const ShellPerfectScrollbar = defineComponent({
  name: 'ShellPerfectScrollbar',
  props: {
    tag: { type: String, default: 'div' },
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        props.tag || 'div',
        {
          ...attrs,
          class: ['mp-shell-scroll', attrs.class],
        },
        slots.default?.(),
      )
  },
})

/** 向本地联邦壳 Vue 实例注册与主站对齐的轻量全局组件。 */
export function registerPluginShellGlobalComponents(app: App): void {
  app
    .component('VDialogCloseBtn', ShellDialogCloseBtn)
    .component('DialogCloseBtn', ShellDialogCloseBtn)
    .component('VPageContentTitle', ShellPageContentTitle)
    .component('VScrollToTopBtn', ShellScrollToTopBtn)
    .component('VCronField', ShellCronField)
    .component('VPathField', ShellPathField)
    .component('PerfectScrollbar', ShellPerfectScrollbar)
}
