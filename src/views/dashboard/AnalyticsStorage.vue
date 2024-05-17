<script setup lang="ts">
import { useTheme } from 'vuetify'
import { formatFileSize } from '@/@core/utils/formatters'
import api from '@/api'
import trophy from '@images/misc/storage.png'
import triangleDark from '@images/misc/triangle-dark.png'
import triangleLight from '@images/misc/triangle-light.png'

const { global } = useTheme()

const triangleBg = computed(() => (global.name.value === 'light' ? triangleLight : triangleDark))

// 总存储空间
const storage = ref(0)

// 已使用存储空间
const used = ref(0)

// 计算已使用存储空间百分比，精确到小数点后1位
const usedPercent = computed(() => {
  return Math.round((used.value / (storage.value || 1)) * 1000) / 10
})

// 调用API，查询存储空间
async function getStorage() {
  try {
    const res: Storage = await api.get('dashboard/storage')

    storage.value = res.total_storage
    used.value = res.used_storage
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  getStorage()
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <VCard v-bind="hover.props">
        <!-- Triangle Background -->
        <VImg :src="triangleBg" class="triangle-bg flip-in-rtl" />
        <VCardItem>
          <template #append>
            <VIcon class="cursor-move" v-if="hover.isHovering">mdi-drag</VIcon>
          </template>
          <VCardTitle>存储空间</VCardTitle>
        </VCardItem>
        <VCardText>
          <h5 class="text-2xl font-weight-medium text-primary">
            {{ formatFileSize(storage) }}
          </h5>
          <p class="mt-2">已使用 {{ usedPercent }}% 🚀</p>
          <p class="mt-1">
            <VProgressLinear :model-value="usedPercent" color="primary" />
          </p>
        </VCardText>

        <!-- Trophy -->
        <VImg :src="trophy" class="trophy" />
      </VCard>
    </template>
  </VHover>
</template>

<style lang="scss">
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
</style>
