<script setup lang="ts">
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useGlobalOfflineStatus } from '@/composables/useOfflineStatus'

const OfflineStatusDialog = defineAsyncComponent(() => import('@/components/dialog/OfflineStatusDialog.vue'))

interface Props {
  type?: 'offline' | 'online'
}

const props = withDefaults(defineProps<Props>(), {
  type: 'offline',
})

const { canPerformNetworkAction } = useGlobalOfflineStatus()
let offlineDialogController: ReturnType<typeof openSharedDialog> | null = null

/** 打开离线状态共享弹窗。 */
function showOfflineDialog() {
  if (offlineDialogController) {
    offlineDialogController.updateProps({ type: props.type })
    return
  }

  offlineDialogController = openSharedDialog(
    OfflineStatusDialog,
    {
      type: props.type,
    },
    {},
    { closeOn: false },
  )
}

/** 关闭离线状态共享弹窗。 */
function closeOfflineDialog() {
  offlineDialogController?.close()
  offlineDialogController = null
}

watch(
  () => canPerformNetworkAction.value,
  canPerform => {
    if (canPerform) {
      closeOfflineDialog()
      return
    }

    showOfflineDialog()
  },
  { immediate: true },
)

watch(
  () => props.type,
  () => {
    offlineDialogController?.updateProps({ type: props.type })
  },
)

onUnmounted(() => {
  closeOfflineDialog()
})
</script>

<template></template>
