<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { useConfirm } from 'vuetify-use-dialog'
import SubscribeEditDialog from '../dialog/SubscribeEditDialog.vue'
import { formatDateDifference } from '@/@core/utils/formatters'
import { formatSeason } from '@/@core/utils/formatters'
import api from '@/api'
import type { Subscribe } from '@/api/types'
import router from '@/router'

// 输入参数
const props = defineProps({
  media: Object as PropType<Subscribe>,
})

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save'])

// 确认框
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 图片是否加载完成
const imageLoaded = ref(false)

// 订阅弹窗
const subscribeEditDialog = ref(false)

// 上一次更新时间
const lastUpdateText = ref(props.media && props.media.last_update ? formatDateDifference(props.media.last_update) : '')

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 根据 type 返回不同的图标
function getIcon() {
  if (props.media?.type === '电影') return 'mdi-movie-open'
  else if (props.media?.type === '电视剧') return 'mdi-television-play'
  else return 'mdi-help-circle'
}

// 计算百分比
function getPercentage() {
  if (props.media?.total_episode === 0) return 0

  return Math.round(
    (((props.media?.total_episode ?? 0) - (props.media?.lack_episode ?? 0)) / (props.media?.total_episode ?? 1)) * 100,
  )
}

// 删除订阅
async function removeSubscribe() {
  try {
    const result: { [key: string]: any } = await api.delete(`subscribe/${props.media?.id}`)

    if (result.success) {
      // 通知父组件刷新
      emit('remove')
    }
  } catch (e) {
    console.log(e)
  }
}

// 搜索订阅
async function searchSubscribe() {
  try {
    const result: { [key: string]: any } = await api.get(`subscribe/search/${props.media?.id}`)

    // 提示
    if (result.success) $toast.success(`${props.media?.name} 提交搜索请求成功！`)
  } catch (e) {
    console.log(e)
  }
}

// 重置订阅
async function resetSubscribe() {
  // 确认
  try {
    const isConfirmed = await createConfirm({
      title: '确认',
      content: `重置后 ${props.media?.name} 已下载记录将被清除，未入库的剧集将会重新下载，是否确认？`,
    })
    if (!isConfirmed) return
    // 重置
    const result: { [key: string]: any } = await api.get(`subscribe/reset/${props.media?.id}`)
    // 提示
    if (result.success) {
      $toast.success(`${props.media?.name} 重置成功！`)
      emit('save')
    } else $toast.error(`${props.media?.name} 重置失败：${result.message}`)
  } catch (e) {
    console.log(e)
  }
}

// 编辑订阅响应
async function editSubscribeDialog() {
  subscribeEditDialog.value = true
}

// 查看详情
async function viewMediaDetail() {
  router.push({
    path: '/media',
    query: {
      mediaid: `${props.media?.tmdbid ? `tmdb:${props.media?.tmdbid}` : `douban:${props.media?.doubanid}`}`,
      type: props.media?.type,
    },
  })
}

// 弹出菜单
const dropdownItems = ref([
  {
    title: '编辑',
    value: 1,
    props: {
      prependIcon: 'mdi-file-edit-outline',
      click: editSubscribeDialog,
    },
  },
  {
    title: '搜索',
    value: 2,
    props: {
      prependIcon: 'mdi-magnify',
      click: searchSubscribe,
    },
  },
  {
    title: '查看详情',
    value: 3,
    props: {
      prependIcon: 'mdi-open-in-new',
      click: viewMediaDetail,
    },
  },
  {
    title: '重置',
    value: 4,
    props: {
      prependIcon: 'mdi-restore-alert',
      click: resetSubscribe,
      color: 'warning',
    },
    show: props.media?.type === '电视剧',
  },
  {
    title: '取消订阅',
    value: 5,
    props: {
      prependIcon: 'mdi-trash-can-outline',
      color: 'error',
      click: removeSubscribe,
    },
  },
])

// 监听插件窗口状态变化
watch(
  () => props.media?.page_open,
  (newOpenState, _) => {
    if (newOpenState) editSubscribeDialog()
  },
)
</script>

<template>
  <VHover>
    <template #default="hover">
      <VCard
        v-bind="hover.props"
        :key="props.media?.id"
        class="flex flex-col rounded-lg"
        :class="{
          'outline-dashed outline-1': props.media?.best_version && imageLoaded,
          'transition transform-cpu duration-300 scale-105 shadow-lg': hover.isHovering,
        }"
        min-height="170"
        @click="editSubscribeDialog"
      >
        <div class="me-n3 absolute top-1 right-2">
          <IconBtn>
            <VIcon icon="mdi-dots-vertical" color="white" />
            <VMenu activator="parent" close-on-content-click>
              <VList>
                <template v-for="(item, i) in dropdownItems" :key="i">
                  <VListItem
                    v-if="item.show !== false"
                    variant="plain"
                    :base-color="item.props.color"
                    @click="item.props.click"
                  >
                    <template #prepend>
                      <VIcon :icon="item.props.prependIcon" />
                    </template>
                    <VListItemTitle v-text="item.title" />
                  </VListItem>
                </template>
              </VList>
            </VMenu>
          </IconBtn>
        </div>
        <template #image>
          <VImg
            :src="props.media?.backdrop || props.media?.poster"
            aspect-ratio="3/2"
            cover
            @load="imageLoadHandler"
            position="top"
          >
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
              <VImg :src="props.media?.poster" aspect-ratio="2/3" cover @click.stop="viewMediaDetail">
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
                {{ props.media?.name }}
                {{ formatSeason(props.media?.season ? props.media?.season.toString() : '') }}
              </div>
            </div>
          </VCardText>
          <VCardText class="flex justify-space-between align-center flex-wrap">
            <div class="flex align-center">
              <IconBtn
                v-if="props.media?.total_episode"
                v-bind="props"
                icon="mdi-progress-download"
                color="white"
                class="me-1"
              />
              <div v-if="props.media?.season" class="text-subtitle-2 me-4 text-white">
                {{ (props.media?.total_episode || 0) - (props.media?.lack_episode || 0) }} /
                {{ props.media?.total_episode }}
              </div>
              <IconBtn v-if="props.media?.username" icon="mdi-account" color="white" class="me-1" />
              <span v-if="props.media?.username" class="text-subtitle-2 me-4 text-white">
                {{ props.media?.username }}
              </span>
            </div>
          </VCardText>
          <VCardText v-if="lastUpdateText" class="absolute right-0 bottom-0 d-flex align-center p-2 text-gray-300">
            <VIcon icon="mdi-download" class="me-1" />
            {{ lastUpdateText }}
          </VCardText>
          <div class="w-full absolute bottom-0">
            <VProgressLinear
              v-if="getPercentage() > 0"
              :model-value="getPercentage()"
              bg-color="success"
              color="success"
            />
          </div>
        </div>
      </VCard>
    </template>
  </VHover>
  <!-- 订阅编辑弹窗 -->
  <SubscribeEditDialog
    v-if="subscribeEditDialog"
    v-model="subscribeEditDialog"
    :subid="props.media?.id"
    @remove="
      () => {
        emit('remove')
        subscribeEditDialog = false
      }
    "
    @save="
      () => {
        emit('save')
        subscribeEditDialog = false
      }
    "
    @close="subscribeEditDialog = false"
  />
</template>
<style lang="scss">
.subscribe-card-background {
  background-image: linear-gradient(90deg, rgba(31, 41, 55, 47%) 0%, rgb(31, 41, 55) 100%);
}
</style>
