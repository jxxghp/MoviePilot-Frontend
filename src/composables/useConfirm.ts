import { ref } from 'vue'
import { createApp } from 'vue'
import i18n from '@/plugins/i18n'
import vuetify from '@/plugins/vuetify'
import ConfirmDialog from '@/@core/components/ConfirmDialog.vue'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'

/** 主应用确认弹窗支持的配置项。 */
export interface ConfirmOptions {
  type?: 'info' | 'warn' | 'error'
  title?: string
  content?: string
  confirmText?: string
  cancelText?: string
  width?: string | number
}

/** 可注入到联邦插件中的确认弹窗调用入口。 */
export type ConfirmDialogFn = (options?: ConfirmOptions) => Promise<boolean>

let resolvePromise: ((value: boolean) => void) | null = null

/** 创建主应用确认弹窗并等待用户选择结果。 */
async function createConfirmDialog(options: ConfirmOptions = {}) {
  return new Promise<boolean>(resolve => {
    resolvePromise = resolve

    // 创建容器
    const container = document.createElement('div')
    document.body.appendChild(container)

    // 处理国际化
    const i18nOptions = {
      ...options,
      title: options.title || i18n.global.t('common.confirm'),
      confirmText: options.confirmText || i18n.global.t('common.confirm'),
      cancelText: options.cancelText || i18n.global.t('common.cancel'),
    }

    // 创建应用实例
    const app = createApp(ConfirmDialog, {
      modelValue: true,
      ...i18nOptions,
      'onUpdate:modelValue': (val: boolean) => {
        if (!val) {
          cleanup()
        }
      },
      onConfirm: () => {
        resolvePromise?.(true)
        cleanup()
      },
      onCancel: () => {
        resolvePromise?.(false)
        cleanup()
      },
    })

    // 注册必要的组件
    app.component('VDialogCloseBtn', DialogCloseBtn)

    // 使用插件
    app.use(vuetify)
    app.use(i18n)

    // 挂载应用
    app.mount(container)

    // 清理函数
    const cleanup = () => {
      app.unmount()
      document.body.removeChild(container)
    }
  })
}

// 创建一个函数对象，同时支持直接调用和解构
const confirmFunction = Object.assign(createConfirmDialog, {
  createConfirm: createConfirmDialog,
}) as ConfirmDialogFn & { createConfirm: ConfirmDialogFn }

/** 返回可复用的主应用确认弹窗调用入口。 */
export function useConfirm() {
  return confirmFunction
}

// 插件
export default {
  install: (app: any) => {
    app.provide('confirm', { createConfirm: createConfirmDialog })
  },
}
