import { type MaybeRefOrGetter, toValue } from 'vue'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'

type RefreshHandler = (context?: KeepAliveRefreshContext) => void | Promise<void>

interface SilentSettingRefreshOptions {
  active?: MaybeRefOrGetter<boolean>
}

function isEditingFormField() {
  if (typeof document === 'undefined') return false

  const element = document.activeElement
  if (!(element instanceof HTMLElement)) return false

  // 设置页大多是可编辑表单，正在输入时跳过静默刷新，避免覆盖用户未保存内容。
  return Boolean(element.closest('input, textarea, select, [contenteditable="true"], .ace_text-input'))
}

/**
 * 设置面板重新可见时静默刷新数据；如果用户正在编辑表单，则本轮刷新让路给输入体验。
 */
export function useSilentSettingRefresh(refresh: RefreshHandler, options: SilentSettingRefreshOptions = {}) {
  return useKeepAliveRefresh(
    async context => {
      if (context?.silent && isEditingFormField()) return
      await refresh(context)
    },
    {
      active: options.active === undefined ? undefined : () => Boolean(toValue(options.active)),
    },
  )
}
