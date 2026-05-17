<script lang="ts" setup>
import type { SharedDialogEntry } from '@/composables/useSharedDialog'
import { closeSharedDialog, useSharedDialog } from '@/composables/useSharedDialog'

const { dialogs } = useSharedDialog()
type ReadonlySharedDialogEntry = Readonly<SharedDialogEntry> & {
  readonly closeOn: readonly string[]
  readonly events: Readonly<SharedDialogEntry['events']>
  readonly props: Readonly<SharedDialogEntry['props']>
}

// 关闭弹窗并同步组件自身的 v-model 状态。
function closeEntry(entry: ReadonlySharedDialogEntry) {
  closeSharedDialog(entry.id)
}

// 处理弹窗内部 v-model 变化，用户点击遮罩或返回键关闭时也能释放实例。
function handleModelUpdate(entry: ReadonlySharedDialogEntry, value: boolean) {
  if (!value) closeSharedDialog(entry.id)
}

// 转发业务事件给调用方，并按配置自动关闭当前弹窗。
function handleDialogEvent(entry: ReadonlySharedDialogEntry, eventName: string, args: any[]) {
  entry.events[eventName]?.(...args)

  if (entry.closeOn.includes(eventName) && (eventName !== 'update:modelValue' || args[0] === false)) {
    closeEntry(entry)
  }
}

// 生成动态组件事件监听器，让不同业务弹窗复用同一个 Host。
function createDialogListeners(entry: ReadonlySharedDialogEntry) {
  const listeners: Record<string, (...args: any[]) => void> = {}

  listeners['update:modelValue'] = value => {
    handleModelUpdate(entry, Boolean(value))
    entry.events['update:modelValue']?.(value)
  }

  Object.keys(entry.events).forEach(eventName => {
    if (eventName === 'update:modelValue') return

    listeners[eventName] = (...args: any[]) => handleDialogEvent(entry, eventName, args)
  })

  entry.closeOn.forEach(eventName => {
    if (!listeners[eventName]) {
      listeners[eventName] = (...args: any[]) => handleDialogEvent(entry, eventName, args)
    }
  })

  return listeners
}
</script>

<template>
  <Component
    :is="entry.component"
    v-for="entry in dialogs"
    :key="entry.id"
    v-bind="{ ...entry.props, modelValue: entry.visible }"
    v-on="createDialogListeners(entry)"
  />
</template>
