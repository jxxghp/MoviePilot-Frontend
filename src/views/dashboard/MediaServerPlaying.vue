<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaServerPlayItem } from '@/api/types'
import PlayingBackdropCard from '@/components/cards/PlayingBackdropCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useDashboardMediaGridCapacity } from '@/composables/useDashboardMediaGridCapacity'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 国际化
const { t } = useI18n()
const display = useDisplay()

const PLAYING_CARD_MIN_WIDTH = 240
const MEDIA_GRID_HORIZONTAL_PADDING = 40

// 继续播放列表
const playingList = ref<MediaServerPlayItem[]>([])

// 所有媒体服务器设置
const mediaServers = ref<MediaServerConf[]>([])

// 小屏幕纵向空间更紧凑，展示三行；桌面端保持两行横向铺满。
const mediaGridRows = computed(() => (display.smAndDown.value ? 3 : 2))

// 继续观看网格容量
const {
  containerRef: mediaGridContainerRef,
  itemCount: playingItemCount,
  refreshCapacity,
} = useDashboardMediaGridCapacity({
  contentSelector: '.dashboard-media-content',
  horizontalPadding: MEDIA_GRID_HORIZONTAL_PADDING,
  minItemWidth: PLAYING_CARD_MIN_WIDTH,
  rows: mediaGridRows,
})

const displayedPlayingList = computed(() => playingList.value.slice(0, playingItemCount.value))

let playingLoadId = 0

/**
 * 查询媒体服务器设置。
 */
async function loadMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/MediaServers')
    mediaServers.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

/**
 * 查询指定媒体服务器的继续观看列表。
 * @param server 媒体服务器名称
 * @param count 需要返回的条目数量
 */
async function loadPlayingList(server: string, count: number) {
  try {
    const result: MediaServerPlayItem[] = await api.get('mediaserver/playing', { params: { count, server } })

    return result ?? []
  } catch (e) {
    console.log(e)

    return []
  }
}

/**
 * 加载已启用媒体服务器的继续观看数据。
 */
async function loadData() {
  const count = playingItemCount.value
  if (count <= 0) return

  const loadId = ++playingLoadId

  await loadMediaServerSetting()
  if (loadId !== playingLoadId) return

  const enabledServers = mediaServers.value.filter(server => server.enabled)
  const serverItems = await Promise.all(enabledServers.map(server => loadPlayingList(server.name, count)))

  if (loadId !== playingLoadId) return

  const itemMap = new Map<string, MediaServerPlayItem>()

  serverItems.flat().forEach((item, index) => {
    const key = String(item.id || item.link || `${item.server_type || 'server'}-${item.title}-${index}`)
    if (!itemMap.has(key)) {
      itemMap.set(key, item)
    }
  })

  playingList.value = Array.from(itemMap.values()).slice(0, count)
}

watch(playingItemCount, count => {
  if (count <= 0) return

  loadData()
})

onActivated(() => {
  refreshCapacity()
  loadData()
})
</script>

<template>
  <div
    ref="mediaGridContainerRef"
    class="dashboard-media-shell"
    :class="{ 'dashboard-grid-fill': displayedPlayingList.length > 0 }"
  >
    <VCard v-if="displayedPlayingList.length > 0" class="dashboard-media-card">
      <VCardItem class="dashboard-media-header">
        <VCardTitle>{{ t('dashboard.playing') }}</VCardTitle>
      </VCardItem>

      <div class="dashboard-media-content px-5 pb-3">
        <ProgressiveCardGrid
          class="dashboard-media-grid"
          :items="displayedPlayingList"
          :get-item-key="item => item.id || item.link || item.title"
          :min-item-width="PLAYING_CARD_MIN_WIDTH"
          :estimated-item-height="174"
          tabindex="0"
        >
          <template #default="{ item }">
            <PlayingBackdropCard :media="item" height="10.875rem" />
          </template>
        </ProgressiveCardGrid>
      </div>
    </VCard>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.dashboard-media-grid {
  flex: 1 1 auto;
  min-block-size: 0;
}

.dashboard-media-shell {
  block-size: 100%;
  min-block-size: 0;
}

.dashboard-media-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
}

.dashboard-media-header {
  padding-block-end: 0.375rem;
}

.dashboard-media-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  overflow: auto;
}

.dashboard-media-content::-webkit-scrollbar {
  display: none;
}
</style>
