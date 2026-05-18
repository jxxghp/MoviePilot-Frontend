<script setup lang="ts">
import api from '@/api'
import { formatFileSize } from '@/@core/utils/formatters'
import type { DownloaderConf, DownloaderInfo } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'
import { downloaderDict } from '@/api/constants'
import { useBackground } from '@/composables/useBackground'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useCardAccentColor } from '@/composables/useCardAccentColor'

const DownloaderInfoDialog = defineAsyncComponent(() => import('@/components/dialog/DownloaderInfoDialog.vue'))

// 获取i18n实例
const { t } = useI18n()
const { useConditionalDataRefresh } = useBackground()
const { accentRgb, imageRef, updateAccentColor } = useCardAccentColor()

// 定义输入
const props = defineProps({
  // 单个下载器
  downloader: {
    type: Object as PropType<DownloaderConf>,
    required: true,
  },
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
  // 所有下载器
  downloaders: {
    type: Array as PropType<DownloaderConf[]>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'done', 'change'])

// 上传速率
const upload_rate = ref(0)

// 下载速度
const download_rate = ref(0)

// 下载器是否应该刷新数据的计算属性
const shouldRefresh = computed(() => props.allowRefresh && props.downloader.enabled)

/** 调用 API 查询下载器实时速率数据。 */
async function loadDownloaderInfo() {
  if (!shouldRefresh.value) {
    upload_rate.value = 0
    download_rate.value = 0
    return
  }
  try {
    const res: DownloaderInfo = await api.get('dashboard/downloader', {
      params: {
        name: props.downloader.name,
      },
    })

    if (res) {
      upload_rate.value = res.upload_speed
      download_rate.value = res.download_speed
    }
  } catch (e) {
    console.log(e)
  }
}

/** 打开共享下载器配置弹窗。 */
function openDownloaderInfoDialog() {
  openSharedDialog(
    DownloaderInfoDialog,
    {
      downloader: props.downloader,
      downloaders: props.downloaders,
    },
    {
      change: (...args: unknown[]) => emit('change', ...args),
      done: () => emit('done'),
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.downloader.type) {
    case 'qbittorrent':
      return getLogoUrl('qbittorrent')
    case 'transmission':
      return getLogoUrl('transmission')
    case 'rtorrent':
      return getLogoUrl('rtorrent')
    default:
      return getLogoUrl('downloader')
  }
})

/** 关闭下载器卡片。 */
function onClose() {
  emit('close')
}

// 使用条件性数据刷新定时器（只在下载器启用时运行）
const { stop: stopRefresh } = useConditionalDataRefresh(
  `downloader-${props.downloader.name}`,
  loadDownloaderInfo,
  shouldRefresh,
  3000,
  true,
)

onUnmounted(() => {
  stopRefresh()
})
</script>

<template>
  <VHover v-slot="hover">
    <VCard
      v-bind="hover.props"
      variant="tonal"
      class="app-card-shell app-card-colorful"
      :style="{ '--app-card-accent-rgb': accentRgb }"
      @click="openDownloaderInfoDialog"
    >
      <VDialogCloseBtn @click="onClose" />
      <span class="app-card-top-action absolute top-3 right-12">
        <IconBtn @click.stop>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
      </span>
      <VCardText class="app-card-summary app-card-summary--double-action">
        <div class="app-card-summary__content">
          <div class="app-card-summary__title-row">
            <VBadge
              v-if="props.downloader.default && props.downloader.enabled"
              dot
              inline
              color="success"
              class="me-1"
            />
            <span class="app-card-summary__title text-h6">{{ downloader.name }}</span>
          </div>
          <div v-if="downloaderDict[downloader.type] && props.downloader.enabled" class="app-card-summary__meta text-sm">
            <span class="app-card-summary__meta-item">{{ `↑ ${formatFileSize(upload_rate, 1)}/s` }}</span>
            <span class="app-card-summary__meta-item">{{ `↓ ${formatFileSize(download_rate, 1)}/s` }}</span>
          </div>
          <div v-else-if="!downloaderDict[downloader.type]" class="app-card-summary__subtitle text-sm">
            {{ t('setting.system.custom') }}
          </div>
        </div>
        <div class="app-card-summary__media" aria-hidden="true">
          <VImg ref="imageRef" :src="getIcon" contain class="app-card-summary__image" @load="updateAccentColor" />
        </div>
      </VCardText>
    </VCard>
  </VHover>
</template>
