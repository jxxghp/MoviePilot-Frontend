<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaServerPlayItem } from '@/api/types'
import PlayingBackdropCard from '@/components/cards/PlayingBackdropCard.vue'
import DashboardRetryButton from '@/components/misc/DashboardRetryButton.vue'
import DashboardMediaState from '@/components/misc/DashboardMediaState.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useDashboardMediaGridCapacity } from '@/composables/useDashboardMediaGridCapacity'
import { useDashboardSnapshot } from '@/composables/useDashboardSnapshot'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 国际化
const { t } = useI18n()
const display = useDisplay()

const PLAYING_CARD_MIN_WIDTH = 240
const MEDIA_GRID_HORIZONTAL_PADDING = 40

interface DashboardPlayingItem extends MediaServerPlayItem {
  /** 媒体项所属的配置服务器名称，用于跨服务器稳定去重。 */
  dashboardServer: string
}

const { readSnapshot, writeSnapshot } = useDashboardSnapshot<DashboardPlayingItem[]>('media-playing-v1')
const currentSnapshot = readSnapshot()

// 继续播放列表
const playingList = ref<DashboardPlayingItem[]>(currentSnapshot?.value ?? [])
// 空结果同样是成功快照；刷新失败不能把已确认的空状态改写成首次加载失败。
const hasSnapshot = ref(currentSnapshot !== undefined)
const isLoading = ref(!currentSnapshot)
const loadFailed = ref(false)

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
    return true
  } catch (error) {
    console.log(error)
    return false
  }
}

/**
 * 查询指定媒体服务器的继续观看列表。
 * @param server 媒体服务器名称
 * @param count 需要返回的条目数量
 */
async function loadPlayingList(server: string, count: number) {
  try {
    const result: MediaServerPlayItem[] = await api.get('mediaserver/playing', {
      params: { count, server },
    })

    return (result ?? []).map(item => ({ ...item, dashboardServer: server }))
  } catch (e) {
    console.log(e)

    return undefined
  }
}

/**
 * 加载已启用媒体服务器的继续观看数据。
 */
async function loadData() {
  const count = playingItemCount.value
  if (count <= 0) return

  const loadId = ++playingLoadId
  if (!hasSnapshot.value) isLoading.value = true

  if (!(await loadMediaServerSetting())) {
    if (loadId === playingLoadId) {
      loadFailed.value = true
      isLoading.value = false
    }
    return
  }
  if (loadId !== playingLoadId) return

  const enabledServers = mediaServers.value.filter(server => server.enabled)
  const serverItems = await Promise.all(enabledServers.map(server => loadPlayingList(server.name, count)))

  if (loadId !== playingLoadId) return
  if (serverItems.some(items => items === undefined)) {
    loadFailed.value = true
    isLoading.value = false
    return
  }

  const itemMap = new Map<string, DashboardPlayingItem>()

  serverItems
    .flatMap(items => items ?? [])
    .forEach((item, index) => {
      const key = `${item.dashboardServer}:${item.id || item.link || item.title || index}`
      if (!itemMap.has(key)) {
        itemMap.set(key, item)
      }
    })

  const nextPlayingList = Array.from(itemMap.values()).slice(0, count)
  playingList.value = nextPlayingList
  writeSnapshot(nextPlayingList)
  hasSnapshot.value = true
  loadFailed.value = false
  isLoading.value = false
}

watch(playingItemCount, count => {
  if (count <= 0) return

  void loadData()
})

onActivated(() => {
  const previousItemCount = playingItemCount.value
  refreshCapacity()

  // 容量变化时 watcher 会加载；容量不变时仍需执行一次 SWR 刷新。
  if (playingItemCount.value === previousItemCount) void loadData()
})
</script>

<template>
  <div
    ref="mediaGridContainerRef"
    class="dashboard-media-shell"
    :class="{ 'dashboard-grid-fill': displayedPlayingList.length > 0 }"
  >
    <DashboardMediaState
      v-if="playingList.length === 0"
      :title="t('dashboard.playing')"
      :empty-text="t('dashboard.noPlaying')"
      empty-icon="mdi-play-circle-outline"
      :loading="isLoading"
      :failed="loadFailed && !hasSnapshot"
    >
      <template v-if="loadFailed" #append>
        <DashboardRetryButton
          :deferred="hasSnapshot"
          :label="hasSnapshot ? t('dashboard.staleData') : t('dashboard.mediaServerLoadFailed')"
          @retry="loadData"
        />
      </template>
    </DashboardMediaState>

    <VCard v-if="displayedPlayingList.length > 0" class="dashboard-media-card" data-glass-optical-boundary>
      <VCardItem class="dashboard-media-header">
        <VCardTitle>{{ t('dashboard.playing') }}</VCardTitle>
        <template v-if="loadFailed" #append>
          <DashboardRetryButton deferred :label="t('dashboard.staleData')" @retry="loadData" />
        </template>
      </VCardItem>

      <div class="dashboard-media-content px-5 pb-3">
        <ProgressiveCardGrid
          class="dashboard-media-grid"
          :items="displayedPlayingList"
          :get-item-key="item => `${item.dashboardServer}:${item.id || item.link || item.title}`"
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
  scrollbar-width: none;
}

@supports not (scrollbar-width: none) {
  .dashboard-media-content::-webkit-scrollbar {
    display: none;
  }
}
</style>
