<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import SubscribeEditDialog from '../dialog/SubscribeEditDialog.vue'
import SubscribeFilesDialog from '../dialog/SubscribeFilesDialog.vue'
import SubscribeShareDialog from '../dialog/SubscribeShareDialog.vue'
import { formatDateDifference, formatSeason } from '@/@core/utils/formatters'
import api from '@/api'
import type { Subscribe } from '@/api/types'
import router from '@/router'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { useGlobalSettingsStore } from '@/stores'

// 显示器宽度
const display = useDisplay()

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  media: Object as PropType<Subscribe>,
  batchMode: {
    type: Boolean,
    default: false,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  sortable: {
    type: Boolean,
    default: false,
  },
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save', 'select'])

// 确认框
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 图片是否加载完成
const imageLoaded = ref(false)

// 订阅弹窗
const subscribeEditDialog = ref(false)

// 订阅文件信息弹窗
const subscribeFilesDialog = ref(false)

// 分享订阅弹窗
const subscribeShareDialog = ref(false)

// 当前的订阅状态
const subscribeState = ref<string>(props.media?.state ?? 'P')

// 上一次更新时间
const lastUpdateText = computed(() => (props.media?.last_update ? formatDateDifference(props.media.last_update) : ''))

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
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

// 切换订阅状态
async function toggleSubscribeStatus(state: 'R' | 'S') {
  try {
    // 根据传入的 state 判断对应的操作文字
    const action = state === 'S' ? t('common.pause') : t('common.enable')
    // 弹出确认框
    const isConfirmed = await createConfirm({
      title: t('common.confirmAction', { action }),
      content: t('subscribe.confirmToggle', { action, name: props.media?.name }),
    })
    if (!isConfirmed) return
    // 调用 API 更新订阅状态
    const result: { [key: string]: any } = await api.put(`subscribe/status/${props.media?.id}?state=${state}`)
    // 提示
    if (result.success) {
      $toast.success(t('subscribe.toggleSuccess', { name: props.media?.name, action }))
      subscribeState.value = state
      emit('save')
    } else {
      $toast.error(t('subscribe.toggleFailed', { action, message: result.message }))
    }
  } catch (e) {
    console.log(e)
  }
}

// 重置订阅
async function resetSubscribe() {
  // 确认
  try {
    const isConfirmed = await createConfirm({
      title: t('common.confirm'),
      content: t('subscribe.resetConfirm', { name: props.media?.name }),
    })
    if (!isConfirmed) return
    // 重置
    const result: { [key: string]: any } = await api.get(`subscribe/reset/${props.media?.id}`)
    // 提示
    if (result.success) {
      $toast.success(t('subscribe.resetSuccess', { name: props.media?.name }))
      subscribeState.value = 'R'
      emit('save')
    } else $toast.error(t('subscribe.resetFailed', { name: props.media?.name, message: result.message }))
  } catch (e) {
    console.log(e)
  }
}

//  分享订阅
async function shareSubscribe() {
  subscribeShareDialog.value = true
}

// 编辑订阅响应
async function editSubscribeDialog() {
  subscribeEditDialog.value = true
}

// 获得mediaid
function getMediaId() {
  if (props.media?.tmdbid) return `tmdb:${props.media?.tmdbid}`
  else if (props.media?.doubanid) return `douban:${props.media?.doubanid}`
  else if (props.media?.bangumiid) return `bangumi:${props.media?.bangumiid}`
  else return props.media?.mediaid
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

// 查看文件详情
async function viewSubscribeFiles() {
  subscribeFilesDialog.value = true
}

// 弹出菜单
const dropdownItems = computed(() => [
  {
    title: t('common.edit'),
    value: 1,
    props: {
      prependIcon: 'mdi-file-edit-outline',
      click: editSubscribeDialog,
    },
  },
  {
    title: t('common.search'),
    value: 2,
    props: {
      prependIcon: 'mdi-magnify',
      click: searchSubscribe,
    },
  },
  {
    title: t('common.details'),
    value: 3,
    props: {
      prependIcon: 'mdi-information-outline',
      click: viewMediaDetail,
    },
  },
  {
    title: t('common.files'),
    value: 4,
    props: {
      prependIcon: 'mdi-file-document-outline',
      click: viewSubscribeFiles,
    },
  },
  {
    title: subscribeState.value === 'S' ? t('common.enable') : t('common.pause'),
    value: 5,
    props: {
      prependIcon: subscribeState.value === 'S' ? 'mdi-play' : 'mdi-pause',
      click: () => toggleSubscribeStatus(subscribeState.value === 'S' ? 'R' : 'S'),
      color: subscribeState.value === 'S' ? 'success' : 'info',
    },
  },
  {
    title: t('common.reset'),
    value: 6,
    props: {
      prependIcon: 'mdi-restore-alert',
      click: resetSubscribe,
      color: 'warning',
    },
  },
  {
    title: t('common.share'),
    value: 7,
    props: {
      prependIcon: 'mdi-share',
      click: shareSubscribe,
      color: 'success',
    },
    show: props.media?.type === '电视剧',
  },
  {
    title: t('common.unsubscribe'),
    value: 8,
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
  { immediate: true },
)

// 监听订阅状态
watch(
  () => props.media?.state,
  newState => {
    subscribeState.value = newState ?? 'P'
  },
)

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

// 订阅编辑保存
function onSubscribeEditSave() {
  subscribeEditDialog.value = false
  emit('save')
}

// 订阅编辑取消
function onSubscribeEditRemove() {
  subscribeEditDialog.value = false
  emit('remove')
}

// 处理卡片点击事件
function handleCardClick() {
  if (props.sortable) {
    return
  }

  if (props.batchMode) {
    // 批量模式下触发选择事件
    emit('select')
  } else {
    // 非批量模式下打开编辑弹窗
    editSubscribeDialog()
  }
}
</script>

<template>
  <div>
    <VHover>
      <template #default="hover">
        <div
          class="w-full h-full rounded-lg overflow-hidden"
          :class="{
            'transition transform-cpu duration-300 -translate-y-1': hover.isHovering && !props.sortable,
            'outline-dashed outline-1': props.media?.best_version && imageLoaded,
            'outline-dotted outline-pink-500 outline-2': props.batchMode && props.selected,
          }"
        >
          <VCard
            v-bind="hover.props"
            :key="props.media?.id"
            class="flex flex-col h-full"
            :class="{
              'opacity-70': subscribeState === 'S',
              'cursor-move': props.sortable,
            }"
            rounded="0"
            min-height="150"
            @click="handleCardClick"
            :ripple="!props.batchMode && !props.sortable"
          >
            <div v-if="!props.sortable" class="me-n3 absolute top-1 right-4">
              <IconBtn>
                <VIcon icon="mdi-dots-vertical" color="white" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <template v-for="(item, i) in dropdownItems" :key="i">
                      <VListItem v-if="item.show !== false" :base-color="item.props.color" @click="item.props.click">
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
              <VImg :src="backdropUrl || posterUrl" aspect-ratio="3/2" cover @load="imageLoadHandler" position="top">
                <template #placeholder>
                  <div class="w-full h-full">
                    <VSkeletonLoader class="object-cover aspect-w-3 aspect-h-2" />
                  </div>
                </template>
                <template #default>
                  <div class="absolute inset-0 outline-none subscribe-card-background"></div>
                </template>
              </VImg>
              <div
                v-if="subscribeState === 'P'"
                class="absolute inset-0 bg-yellow-900 opacity-80 pointer-events-none"
              />
            </template>
            <div>
              <VCardText class="flex items-center pt-3 pb-2">
                <div
                  class="h-auto w-12 flex-shrink-0 overflow-hidden rounded-md"
                  v-if="imageLoaded"
                  :class="{ 'cursor-move': props.sortable && display.mdAndUp.value }"
                >
                  <VImg :src="posterUrl" aspect-ratio="2/3" cover>
                    <template #placeholder>
                      <div class="w-full h-full">
                        <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                      </div>
                    </template>
                  </VImg>
                </div>
                <div class="flex flex-col justify-center overflow-hidden pl-2 xl:pl-4">
                  <div class="text-sm font-medium text-white sm:pt-1">{{ props.media?.year }}</div>
                  <div class="mr-2 min-w-0 text-lg font-bold text-white text-ellipsis overflow-hidden line-clamp-2 ...">
                    {{ props.media?.name }}
                    {{ formatSeason(props.media?.season ? props.media?.season.toString() : '') }}
                  </div>
                </div>
              </VCardText>
              <VCardText class="flex justify-space-between align-center flex-wrap px-3">
                <div class="flex align-center">
                  <VIcon
                    v-if="props.media?.total_episode && props.sortable"
                    icon="mdi-progress-download"
                    size="small"
                    color="white"
                    class="me-1"
                  />
                  <IconBtn
                    v-else-if="props.media?.total_episode"
                    size="small"
                    v-bind="props"
                    icon="mdi-progress-download"
                    color="white"
                  />
                  <div v-if="props.media?.season" class="text-subtitle-2 me-2 text-white">
                    {{ (props.media?.total_episode || 0) - (props.media?.lack_episode || 0) }} /
                    {{ props.media?.total_episode }}
                  </div>
                  <VIcon v-if="props.media?.username && props.sortable" icon="mdi-account" size="small" color="white" class="me-1" />
                  <IconBtn v-else-if="props.media?.username" icon="mdi-account" size="small" color="white" />
                  <span v-if="props.media?.username" class="text-subtitle-2 text-white">
                    {{ props.media?.username }}
                  </span>
                </div>
              </VCardText>
              <VCardText
                v-if="lastUpdateText"
                class="absolute right-0 bottom-0 d-flex align-center p-2 text-gray-300 text-xs"
              >
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
        </div>
      </template>
    </VHover>
    <!-- 订阅编辑弹窗 -->
    <SubscribeEditDialog
      v-if="subscribeEditDialog"
      v-model="subscribeEditDialog"
      :subid="props.media?.id"
      @remove="onSubscribeEditRemove"
      @save="onSubscribeEditSave"
      @close="subscribeEditDialog = false"
    />

    <!-- 订阅文件信息弹窗 -->
    <SubscribeFilesDialog
      v-if="subscribeFilesDialog"
      v-model="subscribeFilesDialog"
      :subid="props.media?.id"
      @close="subscribeFilesDialog = false"
    />
    <!-- 分享订阅弹窗 -->
    <SubscribeShareDialog
      v-if="subscribeShareDialog"
      v-model="subscribeShareDialog"
      :sub="props.media"
      @close="subscribeShareDialog = false"
    />
  </div>
</template>
<style lang="scss" scoped>
.subscribe-card-background {
  background-image: linear-gradient(180deg, rgba(31, 41, 55, 47%) 0%, rgb(31, 41, 55) 100%);
}
</style>
