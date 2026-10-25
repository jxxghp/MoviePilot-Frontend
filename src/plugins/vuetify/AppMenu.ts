import { defineComponent, h, onBeforeUnmount, ref, shallowRef, watch, watchPostEffect, type PropType } from 'vue'
import { VMenu } from 'vuetify/components/VMenu'
import { nativeChromeActive } from '@/native/layout'
import { registerNativeMenuClose } from '@/native/menu'
import { nativeStandaloneMenus, type NativeStandaloneMenuBinding } from '@/native/standalone'

/** 复用 Vuetify 菜单及业务模型，只在原生 Sheet 接管时同步关闭旧菜单。 */
export default defineComponent({
  name: 'AppMenu',
  inheritAttrs: false,
  props: {
    modelValue: { type: Boolean, default: undefined },
    nativeMenu: { type: Object as PropType<NativeStandaloneMenuBinding>, default: undefined },
  },
  emits: ['update:modelValue'],
  /** 保存受控或内部展开状态，宿主接管关闭时取消网页退出动画以完成绘制交接。 */
  setup(props, { attrs, slots, emit }) {
    const menuToken = {}
    const menu = shallowRef<{ activatorEl?: HTMLElement }>()
    watch(
      [() => props.nativeMenu, () => props.nativeMenu?.key],
      ([binding]) => nativeStandaloneMenus.bind(menuToken, binding, () => menu.value?.activatorEl),
      { immediate: true },
    )
    watchPostEffect(() => {
      void nativeStandaloneMenus.revision.value
      void props.nativeMenu
      nativeStandaloneMenus.track(menuToken)
    })
    const expanded = ref(props.modelValue ?? false)
    const closingForSheet = ref(false)
    watch(
      () => props.modelValue,
      value => {
        if (value !== undefined) expanded.value = value
        if (value) closingForSheet.value = false
      },
    )
    /** 用户点击或业务 v-model 仍沿用原 update 事件，不替换菜单项回调。 */
    const update = (value: boolean) => {
      expanded.value = value
      if (value) closingForSheet.value = false
      emit('update:modelValue', value)
    }
    const unregister = registerNativeMenuClose(() => {
      if (!expanded.value) return
      closingForSheet.value = true
      update(false)
    })
    onBeforeUnmount(() => {
      unregister()
      nativeStandaloneMenus.unbind(menuToken)
    })
    return () => {
      const native = nativeChromeActive.value && window.MoviePilotNative?.sheetsVersion === 1
      return h(
        VMenu,
        {
          ...attrs,
          ref: menu,
          // 普通网页未绑定模型时必须省略该属性，显式 undefined 会让 Vuetify 误判为受控菜单。
          ...(native || props.modelValue !== undefined
            ? { modelValue: native ? expanded.value : props.modelValue }
            : {}),
          'onUpdate:modelValue': update,
          ...(native && closingForSheet.value ? { transition: false } : {}),
        },
        slots,
      )
    }
  },
})
