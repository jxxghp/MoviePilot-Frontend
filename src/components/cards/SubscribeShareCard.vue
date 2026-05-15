<script lang="ts" setup>
import { formatDateDifference } from '@/@core/utils/formatters'
import type { SubscribeShare } from '@/api/types'
import router from '@/router'
import SubscribeEditDialog from '../dialog/SubscribeEditDialog.vue'
import ForkSubscribeDialog from '../dialog/ForkSubscribeDialog.vue'
import { useGlobalSettingsStore } from '@/stores'

// 输入参数
const props = defineProps({
  media: Object as PropType<SubscribeShare>,
})

// 定义删除事件
const emit = defineEmits(['delete'])

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 图片是否加载完成
const imageLoaded = ref(false)

// 订阅编辑弹窗
const subscribeEditDialog = ref(false)

// 复用订阅弹窗
const forkSubscribeDialog = ref(false)

// 订阅ID
const subscribeId = ref<number>()

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 分享时间
const dateText = ref(props.media && props.media?.date ? formatDateDifference(props.media.date) : '')

// 计算backdrop图片地址
const backdropUrl = computed(() => {
  const url = props.media?.backdrop || props.media?.poster
  // 使用图片缓存
  if (globalSettings.GLOBAL_IMAGE_CACHE && url)
    return `${import.meta.env.VITE_API_BASE_URL}system/cache/image?url=${encodeURIComponent(url)}`
  return url
})

// 计算海报图片地址
const posterUrl = computed(() => {
  const url = props.media?.poster
  // 使用图片缓存
  if (globalSettings.GLOBAL_IMAGE_CACHE && url)
    return `${import.meta.env.VITE_API_BASE_URL}system/cache/image?url=${encodeURIComponent(url)}`
  return url
})

// 获得mediaid
function getMediaId() {
  if (props.media?.tmdbid) return `tmdb:${props.media?.tmdbid}`
  else if (props.media?.doubanid) return `douban:${props.media?.doubanid}`
}

// 查看媒体详情
async function viewMediaDetail() {
  router.push({
    path: '/media',
    query: {
      mediaid: getMediaId(),
      title: props.media?.name,
      year: props.media?.year,
      type: props.media?.type,
    },
  })
}

// 复用订阅
function showForkSubscribe() {
  forkSubscribeDialog.value = true
}

// 完成复用订阅
function finishForkSubscribe(subid: number) {
  subscribeId.value = subid
  forkSubscribeDialog.value = false
  subscribeEditDialog.value = true
}

// 删除订阅分享时处理
function doDelete() {
  forkSubscribeDialog.value = false
  // 通知父组件刷新
  emit('delete')
}
</script>

<template>
  <div class="h-full">
    <VHover>
      <template #default="hover">
        <div
          class="w-full h-full rounded-lg overflow-hidden"
          :class="{
            'transition transform-cpu duration-300 -translate-y-1': hover.isHovering,
          }"
        >
          <VCard
            v-bind="hover.props"
            :key="props.media?.id"
            class="flex flex-col h-full"
            rounded="0"
            min-height="150"
            @click="showForkSubscribe"
          >
            <template #image>
              <VImg :src="backdropUrl || posterUrl" aspect-ratio="3/2" cover @load="imageLoadHandler" position="top">
                <template #placeholder>
                  <div class="w-full h-full">
                    <VSkeletonLoader class="object-cover aspect-w-3 aspect-h-2" />
                  </div>
                </template>
                <template #default>
                  <div class="absolute inset-0 subscribe-card-background"></div>
                </template>
              </VImg>
            </template>
            <div class="h-full flex flex-col">
              <VCardText class="flex items-center pa-3 pb-1 grow">
                <div class="h-auto w-16 flex-shrink-0 overflow-hidden rounded-md" v-if="imageLoaded">
                  <VImg :src="posterUrl" aspect-ratio="2/3" cover @click.stop="viewMediaDetail">
                    <template #placeholder>
                      <div class="w-full h-full">
                        <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                      </div>
                    </template>
                  </VImg>
                </div>
                <div class="flex flex-col justify-center pl-2 xl:pl-4">
                  <div class="mr-2 min-w-0 text-lg font-bold text-white line-clamp-2 overflow-hidden text-ellipsis ...">
                    {{ props.media?.share_title }}
                  </div>
                  <div class="text-sm font-medium text-gray-200 sm:pt-1 line-clamp-3 overflow-hidden text-ellipsis ...">
                    {{ props.media?.share_comment }}
                  </div>
                </div>
              </VCardText>
              <VCardText class="flex justify-space-between align-center flex-wrap py-2">
                <div class="flex align-center">
                  <IconBtn v-bind="props" icon="mdi-account" color="white" class="me-1" />
                  <div class="text-subtitle-2 me-4 text-white">
                    {{ props.media?.share_user }}
                  </div>
                  <IconBtn v-if="props.media?.count" icon="mdi-fire" color="white" class="me-1" />
                  <span v-if="props.media?.count" class="text-subtitle-2 me-4 text-white">
                    {{ props.media?.count.toLocaleString() }}
                  </span>
                </div>
              </VCardText>
              <VCardText class="absolute right-0 bottom-0 d-flex align-center p-2 text-gray-300">
                <VIcon icon="mdi-calcdar" class="me-1" />
                {{ dateText }}
              </VCardText>
            </div>
          </VCard>
        </div>
      </template>
    </VHover>
    <!-- 订阅编辑弹窗 -->
    <SubscribeEditDialog
      v-if="subscribeEditDialog"
      v-model="subscribeEditDialog"
      :subid="subscribeId"
      @close="subscribeEditDialog = false"
      @save="subscribeEditDialog = false"
      @remove="subscribeEditDialog = false"
    />
    <!-- 复用订阅弹窗 -->
    <ForkSubscribeDialog
      v-if="forkSubscribeDialog"
      v-model="forkSubscribeDialog"
      :media="props.media"
      @close="forkSubscribeDialog = false"
      @fork="finishForkSubscribe"
      @delete="doDelete"
    />
  </div>
</template>
<style lang="scss" scoped>
.subscribe-card-background {
  background-image: linear-gradient(180deg, rgba(31, 41, 55, 47%) 0%, rgb(31, 41, 55) 100%);
}
</style>
