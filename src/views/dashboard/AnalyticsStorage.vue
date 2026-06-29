<script setup lang="ts">
import api from '@/api'
import type { Storage } from '@/api/types'
import storageImage from '@images/misc/storage.png'
import { formatDashboardFileSize, useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 总存储空间
const storage = ref(0)

// 已使用存储空间
const used = ref(0)

// 计算已使用存储空间百分比，精确到小数点后1位
const usedPercent = computed(() => {
  const percent = Math.round((used.value / (storage.value || 1)) * 1000) / 10

  return Math.min(Math.max(percent, 0), 100)
})

const animatedStorage = useAnimatedDashboardNumber(storage, {
  duration: 900,
})
const animatedUsed = useAnimatedDashboardNumber(used, {
  delay: 60,
  duration: 820,
})

const animatedUsedPercent = useAnimatedDashboardNumber(usedPercent, {
  delay: 80,
  duration: 780,
})

const animatedStorageText = computed(() => formatDashboardFileSize(animatedStorage.value, 2, storage.value))
const animatedUsedText = computed(() => formatDashboardFileSize(animatedUsed.value, 2, used.value))
const available = computed(() => Math.max(0, storage.value - used.value))
const availableText = computed(() => formatDashboardFileSize(available.value, 2, available.value))
const animatedUsedPercentValue = computed(() => Math.round(animatedUsedPercent.value * 10) / 10)
const animatedUsedPercentText = computed(() => animatedUsedPercentValue.value.toFixed(1))

// 调用API，查询存储空间
async function getStorage() {
  try {
    const res: Storage = await api.get('dashboard/storage')

    storage.value = Number(res.total_storage) || 0
    used.value = Number(res.used_storage) || 0
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  getStorage()
})

onActivated(() => {
  getStorage()
})
</script>

<template>
  <VCard class="dashboard-summary-card dashboard-grid-fill">
    <VCardItem class="pb-2">
      <VCardTitle>{{ t('dashboard.storage') }}</VCardTitle>
    </VCardItem>
    <VCardText class="dashboard-summary-content">
      <h5 class="animated-storage-value">
        {{ animatedStorageText }}
      </h5>
      <div class="animated-storage-meta">{{ t('storage.usedPercent', { percent: animatedUsedPercentText }) }}</div>
      <div class="animated-storage-progress-wrap">
        <VProgressLinear
          :model-value="animatedUsedPercentValue"
          class="animated-storage-progress"
          color="primary"
          height="6"
          rounded
        />
      </div>
      <div class="animated-storage-caption">
        {{
          t('dashboard.storageSummary', {
            available: availableText,
            total: animatedStorageText,
            used: animatedUsedText,
          })
        }}
      </div>
    </VCardText>
    <VImg :src="storageImage" class="storage-image" />
  </VCard>
</template>

<style lang="scss" scoped>
@use '@layouts/styles/mixins' as layoutsMixins;

.v-card .storage-image {
  position: absolute;
  filter: hue-rotate(225deg) saturate(0.72);
  inline-size: clamp(3.6rem, 18%, 4.5rem);
  inset-block-start: 2.7rem;
  inset-inline-end: 1.35rem;
}

.dashboard-summary-card {
  position: relative;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 160px;
}

.dashboard-summary-content {
  flex: 1 1 auto;
  min-block-size: 0;
  padding-block: 0 0.7rem;
}

.animated-storage-value,
.animated-storage-meta,
.animated-storage-caption {
  padding-inline-end: 4.75rem;
}

.animated-storage-value {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: clamp(1.5rem, 1.8vw, 1.75rem);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1.2;
}

.animated-storage-meta {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.2;
  margin-block-start: 0.3rem;
}

.animated-storage-progress-wrap {
  margin-block-start: 0.4rem;
}

.animated-storage-progress {
  overflow: hidden;
}

.animated-storage-caption {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.68rem;
  margin-block-start: 0.35rem;
  white-space: nowrap;
}
</style>
