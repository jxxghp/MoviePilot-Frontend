import { markRaw, shallowRef, type Component } from 'vue'

export type SharedDialogEventHandler = (...args: any[]) => unknown

export interface SharedDialogOpenOptions {
  closeOn?: string[] | false
  events?: Record<string, SharedDialogEventHandler>
  props?: Record<string, unknown>
  replace?: boolean
}

export interface SharedDialogEntry {
  closeOn: string[]
  component: Component
  events: Record<string, SharedDialogEventHandler>
  id: number
  props: Record<string, unknown>
  visible: boolean
}

const DEFAULT_CLOSE_EVENTS = ['close']
const dialogStack = shallowRef<SharedDialogEntry[]>([])
let dialogSeed = 0

// 规范化弹窗关闭事件，避免每个调用方重复处理关闭约定。
function normalizeCloseEvents(closeOn: SharedDialogOpenOptions['closeOn']) {
  if (closeOn === false) return []
  return closeOn ?? DEFAULT_CLOSE_EVENTS
}

// 更新弹窗栈引用，确保 Host 能响应数组内容变化。
function setDialogStack(entries: SharedDialogEntry[]) {
  dialogStack.value = entries
}

// 打开一个共享弹窗，并返回当前弹窗的控制器。
export function openSharedDialog(
  component: Component,
  props: Record<string, unknown> = {},
  events: Record<string, SharedDialogEventHandler> = {},
  options: Omit<SharedDialogOpenOptions, 'props' | 'events'> = {},
) {
  const id = ++dialogSeed
  const entry: SharedDialogEntry = {
    closeOn: normalizeCloseEvents(options.closeOn),
    component: markRaw(component),
    events,
    id,
    props,
    visible: true,
  }

  setDialogStack(options.replace ? [entry] : [...dialogStack.value, entry])

  return {
    id,
    close: () => closeSharedDialog(id),
    updateProps: (nextProps: Record<string, unknown>) => updateSharedDialogProps(id, nextProps),
  }
}

// 使用对象参数打开共享弹窗，适合调用方需要传入更多选项的场景。
export function openSharedDialogWithOptions(component: Component, options: SharedDialogOpenOptions = {}) {
  return openSharedDialog(component, options.props ?? {}, options.events ?? {}, {
    closeOn: options.closeOn,
    replace: options.replace,
  })
}

// 关闭指定弹窗；未传 id 时关闭最上层弹窗。
export function closeSharedDialog(id?: number) {
  if (id === undefined) {
    setDialogStack(dialogStack.value.slice(0, -1))
    return
  }

  setDialogStack(dialogStack.value.filter(entry => entry.id !== id))
}

// 合并更新指定弹窗的 props，供进度弹窗等需要刷新内容的场景使用。
export function updateSharedDialogProps(id: number, props: Record<string, unknown>) {
  setDialogStack(
    dialogStack.value.map(entry => (entry.id === id ? { ...entry, props: { ...entry.props, ...props } } : entry)),
  )
}

// 提供共享弹窗的响应式状态和命令式操作方法。
export function useSharedDialog() {
  return {
    dialogs: dialogStack,
    openDialog: openSharedDialog,
    openDialogWithOptions: openSharedDialogWithOptions,
    closeDialog: closeSharedDialog,
    updateDialogProps: updateSharedDialogProps,
  }
}
