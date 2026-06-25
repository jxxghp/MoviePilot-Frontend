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
  <VCard class="dashboard-summary-card">
    <!-- Triangle Background -->
    <VImg :src="triangleBg" class="triangle-bg flip-in-rtl" />
    <VCardItem>
      <VCardTitle>{{ t('dashboard.storage') }}</VCardTitle>
    </VCardItem>
    <VCardText>
      <h5 class="animated-storage-value text-2xl font-weight-medium text-primary">
        {{ animatedStorageText }}
      </h5>
      <p class="mt-2">{{ t('storage.usedPercent', { percent: animatedUsedPercentText }) }} 🚀</p>
      <p class="mt-1">
        <VProgressLinear
          :model-value="animatedUsedPercentValue"
          class="animated-storage-progress"
          color="primary"
          height="6"
          rounded
        />
      </p>
    </VCardText>
    <!-- Trophy -->
    <VImg :src="trophy" class="trophy" />
  </VCard>
</template>

<style lang="scss" scoped>
@use '@layouts/styles/mixins' as layoutsMixins;

.v-card .triangle-bg {
  position: absolute;
  inline-size: 8.75rem;
  inset-block-end: 0;
  inset-inline-end: 0;
}

.v-card .trophy {
  position: absolute;
  inline-size: 4.9375rem;
  inset-block-end: 2rem;
  inset-inline-end: 2rem;
}

.animated-storage-value {
  font-variant-numeric: tabular-nums;
}

.animated-storage-progress {
  overflow: hidden;
}

</style>
