<script lang="ts" setup>
import { nextTick } from 'vue'
import type { SharedDialogEntry } from '@/composables/useSharedDialog'
import { closeSharedDialog, isSharedDialogActive, useSharedDialog } from '@/composables/useSharedDialog'

const { dialogs } = useSharedDialog()
type ReadonlySharedDialogEntry = Readonly<SharedDialogEntry> & {
  readonly closeOn: readonly string[]
  readonly events: Readonly<SharedDialogEntry['events']>
  readonly props: Readonly<SharedDialogEntry['props']>
}

/** 等待当前同步保存事件发完再释放实例，避免先关闭的弹窗丢失 change/done。 */
function closeEntry(entry: ReadonlySharedDialogEntry) {
  void nextTick(() => closeSharedDialog(entry.id))
}

/** 模型关闭沿用延迟释放；身份切换仍由 clearSharedDialogs 同步撤销回调。 */
function handleModelUpdate(entry: ReadonlySharedDialogEntry, value: boolean) {
  if (!value) closeEntry(entry)
}

/** 仅转发有效弹窗的业务事件，并按配置调度关闭。 */
function handleDialogEvent(entry: ReadonlySharedDialogEntry, eventName: string, args: any[]) {
  if (!isSharedDialogActive(entry.id)) return

  entry.events[eventName]?.(...args)

  if (entry.closeOn.includes(eventName) && (eventName !== 'update:modelValue' || args[0] === false)) {
    closeEntry(entry)
  }
}

/** 生成动态组件事件监听器，统一模型关闭和业务事件的生命周期。 */
function createDialogListeners(entry: ReadonlySharedDialogEntry) {
  const listeners: Record<string, (...args: any[]) => void> = {}

  listeners['update:modelValue'] = value => {
    if (!isSharedDialogActive(entry.id)) return

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
