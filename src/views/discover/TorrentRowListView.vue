<script lang="ts" setup>
import type { Context } from '@/api/types'

// 定义输入参数
defineProps({
  // 数据列表
  items: Array as PropType<Context[]>,
})
</script>

<template>
  <VList lines="one">
    <VListItem
      v-for="item in items"
      :key="`${item.torrent_info.title}_${item.torrent_info.site_name}_${item.torrent_info.page_url}`"
      :title="item.torrent_info.title"
      :subtitle="item.torrent_info.description"
    />
  </VList>
</template>
