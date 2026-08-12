<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaServerPlayItem } from '@/api/types'
import PosterCard from '@/components/cards/PosterCard.vue'
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

const LATEST_CARD_MIN_WIDTH = 144
const MEDIA_GRID_HORIZONTAL_PADDING = 40

const { readSnapshot, writeSnapshot } = useDashboardSnapshot<{
  [key: string]: MediaServerPlayItem[]
}>('media-latest-v1')
const currentSnapshot = readSnapshot()

// 最近入库列表
const latestList = ref<{ [key: string]: MediaServerPlayItem[] }>(currentSnapshot?.value ?? {})
// 空结果同样是成功快照；刷新失败不能把已确认的空状态改写成首次加载失败。
const hasSnapshot = ref(currentSnapshot !== undefined)
const isLoading = ref(!currentSnapshot)
const loadFailed = ref(false)

// 所有媒体服务器设置
const mediaServers = ref<MediaServerConf[]>([])

// 小屏幕纵向空间更紧凑，展示三行；桌面端保持两行横向铺满。
const mediaGridRows = computed(() => (display.smAndDown.value ? 3 : 2))

// 最近入库网格容量
const {
  containerRef: mediaGridContainerRef,
  itemCount: latestItemCount,
  refreshCapacity,
} = useDashboardMediaGridCapacity({
  contentSelector: '.dashboard-media-content',
  horizontalPadding: MEDIA_GRID_HORIZONTAL_PADDING,
  minItemWidth: LATEST_CARD_MIN_WIDTH,
  rows: mediaGridRows,
})

let latestLoadId = 0

/**
 * 查询媒体服务器设置。
 */
async function loadMediaServerSetting() {
  try {
    const response = await api.get<{ value?: MediaServerConf[] }>('system/setting/MediaServers')
    mediaServers.value = response.value ?? []
    return true
  } catch (error) {
    console.log(t('dashboard.errors.loadMediaServer'), error)
    return false
  }
}

/**
 * 查询指定媒体服务器的最近入库列表。
 * @param server 媒体服务器名称
 * @param count 需要返回的条目数量
 */
async function loadLatest(server: string, count: number) {
  try {
    const response: MediaServerPlayItem[] = await api.get('mediaserver/latest', {
      params: { count, server },
    })

    return response ?? []
  } catch (e) {
    console.log(t('dashboard.errors.loadLatest', { server }), e)

    return undefined
  }
}

/**
 * 加载已启用媒体服务器的最近入库数据。
 */
async function loadData() {
  const count = latestItemCount.value
  if (count <= 0) return

  const loadId = ++latestLoadId
  if (!hasSnapshot.value) isLoading.value = true

  if (!(await loadMediaServerSetting())) {
    if (loadId === latestLoadId) {
      loadFailed.value = true
      isLoading.value = false
    }
    return
  }
  if (loadId !== latestLoadId) return

  const enabledServers = mediaServers.value.filter(server => server.enabled)
  const entries = await Promise.all(
    enabledServers.map(async server => [server.name, await loadLatest(server.name, count)] as const),
  )

  if (loadId !== latestLoadId) return

  const nextLatestList: { [key: string]: MediaServerPlayItem[] } = {}
  for (const [name, data] of entries) {
    if (data === undefined) {
      loadFailed.value = true
      isLoading.value = false
      return
    }
    if (data.length > 0) {
      nextLatestList[name] = data.slice(0, count)
    }
  }

  latestList.value = nextLatestList
  writeSnapshot(nextLatestList)
  hasSnapshot.value = true
  loadFailed.value = false
  isLoading.value = false
}

watch(latestItemCount, count => {
  if (count <= 0) return

  void loadData()
})

onActivated(() => {
  const previousItemCount = latestItemCount.value
  refreshCapacity()

  // 容量变化时 watcher 会加载；容量不变时仍需执行一次 SWR 刷新。
  if (latestItemCount.value === previousItemCount) void loadData()
})
</script>

<template>
  <div
    ref="mediaGridContainerRef"
    class="dashboard-media-stack"
    :class="{ 'dashboard-grid-fill': Object.keys(latestList).length > 0 }"
  >
    <DashboardMediaState
      v-if="Object.keys(latestList).length === 0"
      :title="t('dashboard.latest')"
      :empty-text="t('dashboard.noLatest')"
      empty-icon="mdi-movie-off-outline"
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

    <VCard
      v-for="(data, name) in latestList"
      :key="name"
      class="dashboard-work-card dashboard-media-card"
      data-glass-optical-boundary
    >
      <VCardItem class="dashboard-media-header">
        <VCardTitle>{{ t('dashboard.latest') }} - {{ name }}</VCardTitle>
        <template v-if="loadFailed" #append>
          <DashboardRetryButton deferred :label="t('dashboard.staleData')" @retry="loadData" />
        </template>
      </VCardItem>

      <div class="dashboard-media-content px-5 pb-3">
        <ProgressiveCardGrid
          class="dashboard-media-grid"
          :items="data.slice(0, latestItemCount)"
          :get-item-key="item => item.id || item.link || item.title"
          :min-item-width="LATEST_CARD_MIN_WIDTH"
          :item-aspect-ratio="1.5"
          tabindex="0"
        >
          <template #default="{ item }">
            <PosterCard :media="item" />
          </template>
        </ProgressiveCardGrid>
      </div>
    </VCard>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.dashboard-media-stack {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
}

.dashboard-media-stack > .dashboard-media-card {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  block-size: 100%;
  min-block-size: 0;
}

.dashboard-media-grid {
  flex: 1 1 auto;
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
