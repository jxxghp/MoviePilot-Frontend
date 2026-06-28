<script setup lang="ts">
import { useTheme } from 'vuetify'
import api from '@/api'
import type { Storage } from '@/api/types'
import trophy from '@images/misc/storage.png'
import triangleDark from '@images/misc/triangle-dark.png'
import triangleLight from '@images/misc/triangle-light.png'
import { formatDashboardFileSize, useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

const { global } = useTheme()

const triangleBg = computed(() => (global.name.value === 'light' ? triangleLight : triangleDark))

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

const animatedUsedPercent = useAnimatedDashboardNumber(usedPercent, {
  delay: 80,
  duration: 780,
})

const animatedStorageText = computed(() => formatDashboardFileSize(animatedStorage.value, 2, storage.value))
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
    <!-- Triangle Background -->
    <VImg :src="triangleBg" class="triangle-bg flip-in-rtl" />
    <VCardItem>
      <VCardTitle>{{ t('dashboard.storage') }}</VCardTitle>
    </VCardItem>
    <VCardText class="dashboard-summary-content">
      <h5 class="animated-storage-value font-weight-medium text-primary">
        {{ animatedStorageText }}
      </h5>
      <div class="animated-storage-meta">{{ t('storage.usedPercent', { percent: animatedUsedPercentText }) }} 🚀</div>
      <div class="animated-storage-progress-wrap">
        <VProgressLinear
          :model-value="animatedUsedPercentValue"
          class="animated-storage-progress"
          color="primary"
          height="6"
          rounded
        />
      </div>
    </VCardText>
    <!-- Trophy -->
    <VImg :src="trophy" class="trophy" />
  </VCard>
</template>

<style lang="scss" scoped>
@use '@layouts/styles/mixins' as layoutsMixins;

.v-card .triangle-bg {
  position: absolute;
  inline-size: clamp(7rem, 36%, 8.75rem);
  inset-block-end: 0;
  inset-inline-end: 0;
}

.v-card .trophy {
  position: absolute;
  inline-size: clamp(3.75rem, 18%, 4.5rem);
  inset-block-end: 2.75rem;
  inset-inline-end: 2rem;
}

.dashboard-summary-card {
  position: relative;
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
  overflow: hidden;
}

.dashboard-summary-content {
  flex: 1 1 auto;
  min-block-size: 0;
  padding-block: 0.25rem 1rem;
}

.animated-storage-value {
  font-size: clamp(1.375rem, 1.8vw, 1.5rem);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.animated-storage-meta {
  margin-block-start: 0.5rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.2;
}

.animated-storage-progress-wrap {
  margin-block-start: 0.35rem;
}

.animated-storage-progress {
  overflow: hidden;
}

</style>
