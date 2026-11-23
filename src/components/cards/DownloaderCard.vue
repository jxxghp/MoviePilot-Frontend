<script setup lang="ts">
defineOptions({ inheritAttrs: false })

import api from '@/api'
import { formatFileSize } from '@/@core/utils/formatters'
import type { DownloaderConf, DownloaderInfo } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useCardAccentColor } from '@/composables/useCardAccentColor'
import { useModuleCatalog } from '@/composables/useModuleCatalog'

const DownloaderInfoDialog = defineAsyncComponent(() => import('@/components/dialog/DownloaderInfoDialog.vue'))

// 获取i18n实例
const { t } = useI18n()
const { catalog, isRegisteredModuleOption, loadModuleCatalog } = useModuleCatalog()
void loadModuleCatalog()
const { useConditionalDataRefresh } = useBackground()
const { accentRgb, imageRef, updateAccentColor } = useCardAccentColor()

// 下载器内置类型回退展示名。
const DOWNLOADER_TYPE_LABELS: Record<string, string> = {
  qbittorrent: 'qBittorrent',
  transmission: 'Transmission',
  rtorrent: 'rTorrent',
}

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
const isRegisteredDownloader = computed(() => isRegisteredModuleOption('downloader', props.downloader.type))

// 解析下载器类型展示名，优先读取模块目录的本地化名称。
const downloaderTypeLabel = computed(() => {
  if (!isRegisteredDownloader.value) return t('setting.system.custom')
  const matched = catalog?.value?.find(
    item => item.type === 'downloader' && item.option_value === props.downloader.type,
  )
  return matched?.name_i18n || matched?.name || DOWNLOADER_TYPE_LABELS[props.downloader.type] || props.downloader.type
})

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
  <VCard
    v-bind="$attrs"
    variant="flat"
    class="app-card-shell app-card-colorful mp-setting-card mp-setting-card--interactive"
    :class="{ 'mp-setting-card--inactive': !props.downloader.enabled }"
    :style="{ '--app-card-accent-rgb': accentRgb }"
    @click="openDownloaderInfoDialog"
  >
    <!-- vuedraggable 要求拖拽项映射到单个真实 DOM 元素，避免 Fragment 锚点丢失上下文。 -->
    <div class="mp-setting-card__header">
      <div class="mp-setting-card__icon mp-setting-card__icon--logo" aria-hidden="true">
        <VImg ref="imageRef" :src="getIcon" contain class="mp-setting-card__logo" @load="updateAccentColor" />
      </div>
      <div class="mp-setting-card__heading">
        <div class="mp-setting-card__title-row">
          <span class="mp-setting-card__title" :title="downloader.name">{{ downloader.name }}</span>
          <span
            v-if="props.downloader.default && props.downloader.enabled"
            class="mp-setting-card__badge mp-setting-card__badge--primary"
          >
            {{ t('common.default') }}
          </span>
        </div>
        <div class="mp-setting-card__subtitle">
          <span class="mp-setting-card__subtitle-text">{{ downloaderTypeLabel }}</span>
          <span
            class="mp-setting-card__status"
            :class="props.downloader.enabled ? 'mp-setting-card__status--active' : 'mp-setting-card__status--inactive'"
          >
            <span
              class="mp-setting-card__status-dot"
              :class="
                props.downloader.enabled
                  ? 'mp-setting-card__status-dot--active'
                  : 'mp-setting-card__status-dot--inactive'
              "
            />
            {{ props.downloader.enabled ? t('settingCard.enabled') : t('settingCard.disabled') }}
          </span>
        </div>
      </div>
      <div class="mp-setting-card__actions">
        <IconBtn class="mp-setting-card__action cursor-move" :aria-label="t('settingCard.dragSort')" @click.stop>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
        <VDialogCloseBtn inner-class="mp-setting-card__action mp-setting-card__action--danger" @click="onClose" />
      </div>
    </div>

    <div class="mp-setting-card__dock">
      <div v-if="isRegisteredDownloader && props.downloader.enabled" class="mp-setting-card__stats">
        <span class="mp-setting-card__stat mp-setting-card__stat--up">
          <VIcon icon="mdi-arrow-up" size="14" class="shrink-0" />
          <span class="mp-setting-card__stat-value">{{ `${formatFileSize(upload_rate, 1)}/s` }}</span>
        </span>
        <span class="mp-setting-card__stat mp-setting-card__stat--down">
          <VIcon icon="mdi-arrow-down" size="14" class="shrink-0" />
          <span class="mp-setting-card__stat-value">{{ `${formatFileSize(download_rate, 1)}/s` }}</span>
        </span>
      </div>
      <span v-else class="mp-setting-card__muted">
        {{ !props.downloader.enabled ? t('settingCard.disabled') : t('setting.system.custom') }}
      </span>
      <VIcon class="mp-setting-card__chevron" icon="mdi-chevron-right" size="16" />
    </div>
  </VCard>
</template>
