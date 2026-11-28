<script setup lang="ts">
import ChannelFeatureSettings from '@/views/setting/ChannelFeatureSettings.vue'

defineProps<{
  /** 顶层页面激活时加载唯一的消息渠道卡片组。 */
  active: boolean
}>()
</script>

<template>
  <ChannelFeatureSettings feature="connection" :active="active" />
</template>
