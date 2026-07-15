import type { Component } from 'vue'
import { defineComponent, getCurrentInstance, h, ref } from 'vue'
import { useDisplay } from 'vuetify'

type ResponsiveInputKind = 'choice' | 'field' | 'group' | 'multiline' | 'range'

const MOBILE_EMPTY_PLACEHOLDER = '-'

interface ResponsiveInputOptions {
  kind: ResponsiveInputKind
  name: string
}

interface ForwardedInputInstance {
  blur?: () => void
  focus?: () => void
  reset?: () => void
  resetValidation?: () => void
  validate?: (silent?: boolean) => unknown
}

/**
 * 判断标签或提示是否包含可展示的文本。
 */
function hasDisplayText(value: unknown): value is string | number {
  return (typeof value === 'string' && value.trim().length > 0) || typeof value === 'number'
}

/**
 * 判断录入控件模型中是否已有可展示的值。
 */
function hasInputValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0

  return value !== undefined && value !== null && value !== ''
}

/**
 * 解析包装组件尚未声明的 Vue 布尔属性值。
 */
function isBooleanAttributeEnabled(value: unknown) {
  return value === '' || value === true || value === 'true'
}

/**
 * 合并控件已有的描述引用与移动端提示、校验信息引用。
 */
function mergeDescribedBy(...values: unknown[]) {
  return [...new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .flatMap(value => value.split(/\s+/))
      .filter(Boolean),
  )].join(' ')
}

/**
 * 将移动端右栏宽度参数转换为可用的 CSS 长度。
 */
function normalizeMobileControlWidth(value: number | string | undefined) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined

    return `${Math.min(100, Math.max(0, value))}%`
  }

  if (typeof value !== 'string') return undefined

  return value.trim() || undefined
}

/**
 * 为原生 Vuetify 录入组件创建小屏两栏适配器，桌面端保持原组件渲染路径。
 */
export function createResponsiveInputAdapter(component: Component, options: ResponsiveInputOptions) {
  return defineComponent({
    name: `App${options.name}`,
    inheritAttrs: false,
    props: {
      mobileLayout: {
        type: Boolean,
        default: true,
      },
      mobileControlWidth: {
        type: [Number, String],
        default: undefined,
      },
    },
    /**
     * 根据 Vuetify 断点切换布局，并保留原生控件常用的公开方法。
     */
    setup(props, { attrs, expose, slots }) {
      const display = useDisplay()
      const instanceId = getCurrentInstance()?.uid ?? 0
      const controlRef = ref<ForwardedInputInstance>()

      /** 聚焦内部原生控件。 */
      const focus = () => controlRef.value?.focus?.()

      /** 移除内部原生控件的焦点。 */
      const blur = () => controlRef.value?.blur?.()

      /** 触发内部原生控件校验。 */
      const validate = (silent?: boolean) => controlRef.value?.validate?.(silent)

      /** 重置内部原生控件值与校验状态。 */
      const reset = () => controlRef.value?.reset?.()

      /** 仅重置内部原生控件校验状态。 */
      const resetValidation = () => controlRef.value?.resetValidation?.()

      expose({ blur, focus, reset, resetValidation, validate })

      return () => {
        const label = attrs.label
        const useMobileLayout = props.mobileLayout && display.smAndDown.value && hasDisplayText(label)

        if (!useMobileLayout) {
          return h(component, { ...attrs, ref: controlRef }, slots)
        }

        const hint = attrs.hint
        const hideDetails = attrs.hideDetails ?? attrs['hide-details']
        const showHint = hasDisplayText(hint) && !isBooleanAttributeEnabled(hideDetails)
        const controlId = String(attrs.id ?? `app-responsive-input-${instanceId}`)
        const hintId = `${controlId}-hint`
        const rootClass = attrs.class
        const rootStyle = attrs.style
        const mobileControlWidth = normalizeMobileControlWidth(props.mobileControlWidth)
        const controlAttrs: Record<string, unknown> = { ...attrs }

        for (const key of ['class', 'hint', 'label', 'persistent-hint', 'persistentHint', 'style']) {
          delete controlAttrs[key]
        }

        controlAttrs.id = controlId
        controlAttrs.ref = controlRef
        controlAttrs.class = 'app-responsive-input__native'
        controlAttrs.label = undefined
        controlAttrs.hint = undefined
        controlAttrs.persistentHint = false
        controlAttrs.density ??= 'compact'
        controlAttrs['aria-label'] ??= String(label)

        if (options.kind === 'field' || options.kind === 'multiline') {
          controlAttrs.variant = 'plain'
          controlAttrs.singleLine = true
          if (!hasDisplayText(controlAttrs.placeholder)) {
            controlAttrs.placeholder = MOBILE_EMPTY_PLACEHOLDER
          }
        }

        if (showHint) {
          controlAttrs['aria-describedby'] = mergeDescribedBy(
            controlAttrs['aria-describedby'],
            hintId,
            `${controlId}-messages`,
          )
        }

        const { label: labelSlot, ...controlSlots } = slots
        const labelContent = labelSlot?.({ label, props: { for: controlId } }) ?? String(label)
        const disabled = isBooleanAttributeEnabled(attrs.disabled)
        const isField = options.kind === 'field' || options.kind === 'multiline'
        const isEmptyWithoutPlaceholder = isField
          && !hasInputValue(attrs.modelValue ?? attrs['model-value'])
          && !hasDisplayText(attrs.placeholder)

        return h('div', {
          class: [
            'app-responsive-input',
            `app-responsive-input--${options.kind}`,
            {
              'app-responsive-input--disabled': disabled,
              'app-responsive-input--empty': isEmptyWithoutPlaceholder,
            },
            rootClass,
          ],
          style: [
            rootStyle,
            mobileControlWidth
              ? { '--app-responsive-input-control-width': mobileControlWidth }
              : undefined,
          ],
        }, [
          h('div', { class: 'app-responsive-input__meta' }, [
            h('label', { class: 'app-responsive-input__label', for: controlId }, labelContent),
            showHint
              ? h('div', { id: hintId, class: 'app-responsive-input__hint' }, String(hint))
              : null,
          ]),
          h('div', { class: 'app-responsive-input__control' }, [
            h(component, controlAttrs, controlSlots),
          ]),
        ])
      }
    },
  })
}
