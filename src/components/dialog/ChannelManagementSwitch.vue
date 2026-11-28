<script setup lang="ts">
const props = defineProps<{
  /** 当前管理页面与此连接支持的用途。 */
  current: 'connection' | 'notification' | 'interaction'
  notification: boolean
  interaction: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ select: [section: 'connection' | 'notification' | 'interaction'] }>()
const { t } = useI18n()
const options = computed(() => [
  { value: 'connection' as const, title: t('channelSettings.configurationTitle'), icon: 'mdi-cog-outline' },
  ...(props.notification
    ? [{ value: 'notification' as const, title: t('channelSettings.notificationTitle'), icon: 'mdi-bell-outline' }]
    : []),
  ...(props.interaction
    ? [{ value: 'interaction' as const, title: t('channelSettings.interactionTitle'), icon: 'mdi-robot-outline' }]
    : []),
])
</script>

<template>
  <IconBtn
    :aria-label="t('channelSettings.switchManagement')"
    :title="t('channelSettings.switchManagement')"
    :disabled="disabled"
  >
    <VIcon icon="mdi-swap-horizontal" />
    <VMenu activator="parent">
      <VList>
        <VListItem
          v-for="item in options"
          :key="item.value"
          :title="item.title"
          :prepend-icon="item.icon"
          :active="current === item.value"
          @click="emit('select', item.value)"
        />
      </VList>
    </VMenu>
  </IconBtn>
</template>
