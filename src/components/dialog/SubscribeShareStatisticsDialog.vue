<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '@/api'
import type { SubscribeShareStatistics } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay, useTheme } from 'vuetify'

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 主题
const theme = useTheme()

// 定义事件
const emit = defineEmits(['close'])

// 统计数据
const statistics = ref<SubscribeShareStatistics[]>([])

// 是否加载中
const loading = ref(false)

// 本地统计接口是否加载失败；合法空数组仍使用空数据状态。
const loadError = ref(false)

// 获取统计数据
async function fetchStatistics() {
  try {
    loading.value = true
    loadError.value = false
    const data: SubscribeShareStatistics[] = await api.get('subscribe/share/statistics')
    statistics.value = data
  } catch (error) {
    console.error('获取分享统计数据失败:', error)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

// 计算排名
const rankedStatistics = computed(() => {
  return statistics.value
    .sort((a, b) => (b.total_reuse_count || 0) - (a.total_reuse_count || 0))
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }))
})

// 获取排名样式
function getRankStyle(rank: number) {
  if (rank === 1) {
    return {
      background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
      color: '#fff',
      fontWeight: 'bold',
    }
  } else if (rank === 2) {
    return {
      background: 'linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)',
      color: '#fff',
      fontWeight: 'bold',
    }
  } else if (rank === 3) {
    return {
      background: 'linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%)',
      color: '#fff',
      fontWeight: 'bold',
    }
  }
  return {}
}

// 获取前三名文字颜色
function getPodiumTextColor() {
  return theme.global.current.value.dark ? '#fff' : '#000'
}

// 获取前三名统计背景样式
function getPodiumStatStyle() {
  const isDark = theme.global.current.value.dark
  return {
    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}`,
    background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  }
}

// 获取前三名区域背景样式
function getPodiumAreaBackgroundStyle() {
  const isDark = theme.global.current.value.dark
  return {
    background: isDark
      ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.25) 0%, rgba(255, 69, 0, 0.2) 25%, rgba(255, 20, 147, 0.15) 50%, rgba(138, 43, 226, 0.1) 75%, rgba(0, 191, 255, 0.08) 100%), linear-gradient(to bottom, transparent 0%, transparent 70%, rgba(255, 215, 0, 0.1) 85%, transparent 100%)'
      : 'linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 69, 0, 0.15) 25%, rgba(255, 20, 147, 0.12) 50%, rgba(138, 43, 226, 0.08) 75%, rgba(0, 191, 255, 0.05) 100%), linear-gradient(to bottom, transparent 0%, transparent 70%, rgba(255, 215, 0, 0.08) 85%, transparent 100%)',
    border: 'none',
    borderRadius: '0',
    padding: '32px 24px 48px 24px',
    margin: '0 -24px 0 -',
    boxShadow: isDark
      ? '0 16px 48px rgba(255, 215, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      : '0 16px 48px rgba(255, 215, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
    position: 'relative' as const,
    overflow: 'hidden',
  }
}

// 获取排名图标
function getRankIcon(rank: number) {
  if (rank === 1) return 'mdi-trophy'
  if (rank === 2) return 'mdi-medal-outline'
  if (rank === 3) return 'mdi-medal'
  return ''
}

// 组件挂载时获取数据
onMounted(() => {
  fetchStatistics()
})
</script>

<template>
  <VDialog scrollable max-width="40rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-chart-line" class="me-2" />
        </template>
        <VCardTitle>{{ t('subscribe.shareStatistics') }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="pa-0">
        <LoadingBanner v-if="loading" class="mt-4" />
        <div v-else-if="loadError" class="text-center py-8">
          <VIcon icon="mdi-alert-circle-outline" size="64" color="error" class="mb-4" />
          <div class="text-h6 text-error mb-4">{{ t('subscribe.requestFailed') }}</div>
          <VBtn color="primary" variant="tonal" prepend-icon="mdi-refresh" @click="fetchStatistics">
            {{ t('common.retry') }}
          </VBtn>
        </div>
        <div v-else-if="rankedStatistics.length === 0" class="text-center py-8">
          <VIcon icon="mdi-chart-line" size="64" color="grey" class="mb-4" />
          <div class="text-h6 text-grey">{{ t('subscribe.noStatisticsData') }}</div>
        </div>

        <div v-else>
          <!-- 前三名特殊展示 -->
          <div class="podium-area" :style="getPodiumAreaBackgroundStyle()">
            <!-- 装饰性背景元素 -->
            <div class="podium-decoration">
              <div class="decoration-circle decoration-1"></div>
              <div class="decoration-circle decoration-2"></div>
              <div class="decoration-circle decoration-3"></div>
            </div>
            <div class="text-h6 mb-4 text-center podium-title">{{ t('subscribe.ranking') }}</div>
            <!-- 大屏幕横向排列 -->
            <div class="d-none d-md-flex justify-center align-center gap-4 flex-wrap">
              <!-- 第二名 -->
              <div v-if="rankedStatistics[1]" class="text-center">
                <div class="rank-circle mb-2" :style="getRankStyle(2)">
                  <VIcon :icon="getRankIcon(2)" size="24" />
                </div>
                <div class="text-h6 font-weight-bold" :style="{ color: getPodiumTextColor() }">
                  {{ rankedStatistics[1].share_user || '未知' }}
                </div>
                <div class="d-flex align-center justify-center gap-2 mt-1">
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-share-outline" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span class="font-weight-bold" :style="{ color: getPodiumTextColor() }">{{
                      rankedStatistics[1].share_count || 0
                    }}</span>
                  </div>
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-fire" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span class="font-weight-bold" :style="{ color: getPodiumTextColor() }">{{
                      rankedStatistics[1].total_reuse_count || 0
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- 第一名 -->
              <div v-if="rankedStatistics[0]" class="text-center">
                <div class="rank-circle mb-2 first-place" :style="getRankStyle(1)">
                  <VIcon :icon="getRankIcon(1)" size="32" />
                </div>
                <div class="text-h5 font-weight-bold" :style="{ color: getPodiumTextColor() }">
                  {{ rankedStatistics[0].share_user || '未知' }}
                </div>
                <div class="d-flex align-center justify-center gap-3 mt-1">
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-share-outline" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span class="font-weight-bold" :style="{ color: getPodiumTextColor() }">{{
                      rankedStatistics[0].share_count || 0
                    }}</span>
                  </div>
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-fire" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span class="font-weight-bold" :style="{ color: getPodiumTextColor() }">{{
                      rankedStatistics[0].total_reuse_count || 0
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- 第三名 -->
              <div v-if="rankedStatistics[2]" class="text-center">
                <div class="rank-circle mb-2" :style="getRankStyle(3)">
                  <VIcon :icon="getRankIcon(3)" size="24" />
                </div>
                <div class="text-h6 font-weight-bold" :style="{ color: getPodiumTextColor() }">
                  {{ rankedStatistics[2].share_user || '未知' }}
                </div>
                <div class="d-flex align-center justify-center gap-2 mt-1">
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-share-outline" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span class="font-weight-bold" :style="{ color: getPodiumTextColor() }">{{
                      rankedStatistics[2].share_count || 0
                    }}</span>
                  </div>
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-fire" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span class="font-weight-bold" :style="{ color: getPodiumTextColor() }">{{
                      rankedStatistics[2].total_reuse_count || 0
                    }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 小屏幕垂直排列 -->
            <div class="d-flex d-md-none flex-column align-center gap-4">
              <!-- 第一名 -->
              <div v-if="rankedStatistics[0]" class="text-center">
                <div class="rank-circle mb-2 first-place" :style="getRankStyle(1)">
                  <VIcon :icon="getRankIcon(1)" size="32" />
                </div>
                <div class="text-h5 font-weight-bold" :style="{ color: getPodiumTextColor() }">
                  {{ rankedStatistics[0].share_user || '未知' }}
                </div>
                <div class="d-flex align-center justify-center gap-3 mt-1">
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-share-outline" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span :style="{ color: getPodiumTextColor() }">{{ rankedStatistics[0].share_count || 0 }}</span>
                  </div>
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-fire" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span :style="{ color: getPodiumTextColor() }">{{
                      rankedStatistics[0].total_reuse_count || 0
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- 第二名 -->
              <div v-if="rankedStatistics[1]" class="text-center">
                <div class="rank-circle mb-2" :style="getRankStyle(2)">
                  <VIcon :icon="getRankIcon(2)" size="24" />
                </div>
                <div class="text-h6 font-weight-bold" :style="{ color: getPodiumTextColor() }">
                  {{ rankedStatistics[1].share_user || '未知' }}
                </div>
                <div class="d-flex align-center justify-center gap-2 mt-1">
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-share-outline" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span :style="{ color: getPodiumTextColor() }">{{ rankedStatistics[1].share_count || 0 }}</span>
                  </div>
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-fire" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span :style="{ color: getPodiumTextColor() }">{{
                      rankedStatistics[1].total_reuse_count || 0
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- 第三名 -->
              <div v-if="rankedStatistics[2]" class="text-center">
                <div class="rank-circle mb-2" :style="getRankStyle(3)">
                  <VIcon :icon="getRankIcon(3)" size="24" />
                </div>
                <div class="text-h6 font-weight-bold" :style="{ color: getPodiumTextColor() }">
                  {{ rankedStatistics[2].share_user || '未知' }}
                </div>
                <div class="d-flex align-center justify-center gap-2 mt-1">
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-share-outline" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span :style="{ color: getPodiumTextColor() }">
                      {{ rankedStatistics[2].share_count || 0 }}
                    </span>
                  </div>
                  <div class="d-flex align-center podium-stat" :style="getPodiumStatStyle()">
                    <VIcon icon="mdi-fire" size="14" :color="getPodiumTextColor()" class="mr-1" />
                    <span :style="{ color: getPodiumTextColor() }">
                      {{ rankedStatistics[2].total_reuse_count || 0 }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 完整排行榜 -->
          <VList class="bg-transparent px-3">
            <VListItem
              v-for="item in rankedStatistics.filter(item => item.rank > 3)"
              :key="item.share_user"
              class="mb-2 rounded-lg"
            >
              <VListItemTitle class="font-weight-bold text-h6 mb-1">
                {{ item.share_user || '未知' }}
              </VListItemTitle>

              <VListItemSubtitle class="d-flex align-center gap-3 mt-1">
                <div class="stat-badge share-badge">
                  <VIcon icon="mdi-share-outline" size="14" color="primary" class="mr-1" />
                  <span class="text-primary font-weight-bold">{{ item.share_count || 0 }}</span>
                  <span class="text-grey text-caption ml-1">{{ t('subscribe.shareCount') }}</span>
                </div>
                <div class="stat-badge reuse-badge">
                  <VIcon icon="mdi-fire" size="14" color="warning" class="mr-1" />
                  <span class="text-warning font-weight-bold">{{ item.total_reuse_count || 0 }}</span>
                  <span class="text-grey text-caption ml-1">{{ t('subscribe.totalReuseCount') }}</span>
                </div>
              </VListItemSubtitle>

              <template #append>
                <div class="text-right">
                  <div
                    class="text-h6 font-weight-bold"
                    :style="{ color: item.rank <= 3 ? 'var(--v-primary-base)' : 'inherit' }"
                  >
                    #{{ item.rank }}
                  </div>
                </div>
              </template>
            </VListItem>
          </VList>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.rank-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  block-size: 60px;
  inline-size: 60px;
  margin-block: 0;
  margin-inline: auto;
}

.first-place {
  block-size: 80px;
  box-shadow: 0 4px 12px rgba(255, 215, 0, 30%);
  inline-size: 80px;
}

.rank-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  block-size: 32px;
  inline-size: 32px;
}

.stat-badge {
  display: flex;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-outline), 0.2);
  border-radius: 6px;
  background: rgba(var(--v-theme-surface), 0.8);
  padding-block: 4px;
  padding-inline: 8px;
  transition: all 0.2s ease;
}

.share-badge {
  border-inline-start: 3px solid rgb(var(--v-theme-primary));
}

.reuse-badge {
  border-inline-start: 3px solid rgb(var(--v-theme-warning));
}

.podium-stat {
  border-radius: 6px;
  backdrop-filter: blur(4px);
  padding-block: 4px;
  padding-inline: 8px;
  transition: all 0.2s ease;
}

.podium-stat:hover {
  transform: scale(1.05);
}

/* 前三名区域样式 */
.podium-area {
  position: relative;
  z-index: 1;
}

.podium-title {
  position: relative;
  z-index: 2;
  color: #fff !important;
  font-weight: bold;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 30%);
}

/* 装饰性元素 */
.podium-decoration {
  position: absolute;
  z-index: 0;
  inset: 0;
  pointer-events: none;
}

.decoration-circle {
  position: absolute;
  border-radius: 50%;
  animation: float 6s ease-in-out infinite;
  background: radial-gradient(circle, rgba(255, 255, 255, 10%) 0%, transparent 70%);
}

.decoration-1 {
  animation-delay: 0s;
  block-size: 80px;
  inline-size: 80px;
  inset-block-start: 10%;
  inset-inline-start: 10%;
}

.decoration-2 {
  animation-delay: 2s;
  block-size: 60px;
  inline-size: 60px;
  inset-block-start: 20%;
  inset-inline-end: 15%;
}

.decoration-3 {
  animation-delay: 4s;
  block-size: 40px;
  inline-size: 40px;
  inset-block-end: 20%;
  inset-inline-start: 20%;
}

@keyframes float {
  0%,
  100% {
    opacity: 0.6;
    transform: translateY(0) rotate(0deg);
  }

  50% {
    opacity: 1;
    transform: translateY(-10px) rotate(180deg);
  }
}

/* 增强前三名文字效果 */
.podium-area .text-h6,
.podium-area .text-h5 {
  font-weight: bold;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 30%);
}

.podium-area .rank-circle {
  border: 2px solid rgba(255, 255, 255, 20%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 30%);
}

.podium-area .first-place {
  border: 3px solid rgba(255, 215, 0, 50%);
  box-shadow: 0 12px 32px rgba(255, 215, 0, 40%);
}
</style>
