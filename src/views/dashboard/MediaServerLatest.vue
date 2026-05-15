<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'
import type { MediaServerConf, MediaServerPlayItem } from '@/api/types'
import PosterCard from '@/components/cards/PosterCard.vue'
import VirtualGrid from '@/components/virtual/VirtualGrid.vue'
import { useResponsiveCols } from '@/composables/virtual/useResponsiveCols'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 最近入库列表
const latestList = ref<{ [key: string]: MediaServerPlayItem[] }>({})

// 所有媒体服务器设置
const mediaServers = ref<MediaServerConf[]>([])

// 容器宽度驱动列数（dashboard 卡片宽度由布局决定，不能用视口断点）。
// 多个服务器段落共用一个 wrapRef —— 它们在 dashboard 中竖向堆叠、宽度相同。
const wrapRef = ref<HTMLElement | null>(null)
const cols = useResponsiveCols(wrapRef, { minItemWidth: 144 })

// 调用API查询媒体服务器设置
async function loadMediaServerSetting() {
  try {
    const response: { data: { value: MediaServerConf[] } } = await api.get('system/setting/MediaServers')
    mediaServers.value = response.data?.value ?? []
  } catch (error) {
    console.log(t('dashboard.errors.loadMediaServer'), error)
  }
}

// 调用API查询最近入库
async function loadLatest(server: string) {
  try {
    const response: MediaServerPlayItem[] = await api.get('mediaserver/latest', { params: { server } })
    // 仅在有数据时赋值
    if (response && response.length > 0) {
      latestList.value[server] = response
    }
  } catch (e) {
    console.log(t('dashboard.errors.loadLatest', { server }), e)
  }
}

// 加载数据
async function loadData() {
  await loadMediaServerSetting()
  const enabledServers = mediaServers.value.filter(server => server.enabled)
  for (const server of enabledServers) {
    loadLatest(server.name)
  }
}

onMounted(() => {
  loadData()
})

onActivated(() => {
  loadData()
})
</script>

<template>
  <div ref="wrapRef">
    <VHover v-for="(data, name) in latestList" :key="name">
      <template #default="hover">
        <VCard v-bind="hover.props">
          <VCardItem>
            <template #append>
              <VIcon class="cursor-move" v-if="hover.isHovering">mdi-drag</VIcon>
            </template>
            <VCardTitle>{{ t('dashboard.latest') }} - {{ name }}</VCardTitle>
          </VCardItem>

          <VirtualGrid
            :items="data"
            :columns="cols"
            :row-estimate-size="240"
            :gap="12"
            :get-item-key="(item: MediaServerPlayItem) => item.id || item.link || item.title"
            use-window-scroll
            class="mx-3 mb-3"
            tabindex="0"
          >
            <template #item="{ item }">
              <PosterCard :media="item" />
            </template>
          </VirtualGrid>
        </VCard>
      </template>
    </VHover>
  </div>
</template>
