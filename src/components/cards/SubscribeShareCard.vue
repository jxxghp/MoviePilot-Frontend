<script lang="ts" setup>
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type { SubscribeShare } from '@/api/types'
import router from '@/router'
import { useToast } from 'vue-toast-notification'
import { useConfirm } from 'vuetify-use-dialog'

// 输入参数
const props = defineProps({
  media: Object as PropType<SubscribeShare>,
})

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 从 provide 中获取全局设置
const globalSettings: any = inject('globalSettings')

// 图片是否加载完成
const imageLoaded = ref(false)

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

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

// 查看媒体详情
async function viewMediaDetail() {
  router.push({
    path: '/media',
    query: {
      mediaid: `${props.media?.tmdbid ? `tmdb:${props.media?.tmdbid}` : `douban:${props.media?.doubanid}`}`,
      type: props.media?.type,
    },
  })
}

// 复用订阅
async function forkSubscribe() {
  // 开始处理
  startNProgress()
  try {
    // 确认
    const isConfirmed = await createConfirm({
      title: '确认',
      content: `是否确认添加来自 ${props.media?.share_user} 分享的订阅：${props.media?.share_title}？`,
    })
    if (!isConfirmed) return

    // 请求API
    const result: { [key: string]: any } = await api.post('subscribe/fork', props.media)

    // 订阅状态
    if (result.success) {
      $toast.success(`${props.media?.share_title} 添加订阅成功！`)
    } else {
      $toast.error(`${props.media?.share_title} 添加订阅失败：${result.message}！`)
    }
  } catch (error) {
    console.error(error)
  } finally {
    doneNProgress()
  }
}
</script>

<template>
  <VHover>
    <template #default="hover">
      <VCard
        v-bind="hover.props"
        :key="props.media?.id"
        class="flex flex-col rounded-lg"
        :class="{
          'transition transform-cpu duration-300 scale-105 shadow-lg': hover.isHovering,
        }"
        min-height="170"
        @click="forkSubscribe"
      >
        <template #image>
          <VImg :src="backdropUrl || posterUrl" aspect-ratio="3/2" cover @load="imageLoadHandler" position="top">
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-3 aspect-h-2" />
              </div>
            </template>
            <div class="absolute inset-0 subscribe-card-background"></div>
          </VImg>
        </template>
        <div>
          <VCardText class="flex items-center">
            <div class="h-auto w-12 flex-shrink-0 overflow-hidden rounded-md shadow-lg" v-if="imageLoaded">
              <VImg :src="posterUrl" aspect-ratio="2/3" cover @click.stop="viewMediaDetail">
                <template #placeholder>
                  <div class="w-full h-full">
                    <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                  </div>
                </template>
              </VImg>
            </div>
            <div class="flex flex-col justify-center overflow-hidden pl-2 xl:pl-4">
              <div class="text-sm font-medium text-white sm:pt-1">{{ props.media?.year }}</div>
              <div class="mr-2 min-w-0 text-lg font-bold text-white">
                {{ props.media?.share_title }}
              </div>
            </div>
          </VCardText>
          <VCardText class="flex justify-space-between align-center flex-wrap">
            {{ props.media?.share_comment }}
          </VCardText>
          <VCardText class="absolute right-0 bottom-0 d-flex align-center p-2 text-gray-300">
            <VIcon icon="mdi-account" class="me-1" />
            {{ props.media?.share_user }}
          </VCardText>
        </div>
      </VCard>
    </template>
  </VHover>
</template>
<style lang="scss">
.subscribe-card-background {
  background-image: linear-gradient(90deg, rgba(31, 41, 55, 47%) 0%, rgb(31, 41, 55) 100%);
}
</style>
