<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaStatistic } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useCardAccentColor } from '@/composables/useCardAccentColor'
import { useModuleCatalog } from '@/composables/useModuleCatalog'

const MediaServerInfoDialog = defineAsyncComponent(() => import('@/components/dialog/MediaServerInfoDialog.vue'))

// 获取i18n实例
const { t } = useI18n()
const { catalog, isRegisteredModuleOption, loadModuleCatalog } = useModuleCatalog()
void loadModuleCatalog()
const { accentRgb, imageRef, updateAccentColor } = useCardAccentColor('#56CA00')

// 媒体服务器内置类型回退展示名，避免模块目录尚未返回时只显示英文标识。
const MEDIA_SERVER_TYPE_LABELS: Record<string, string> = {
  emby: 'Emby',
  jellyfin: 'Jellyfin',
  plex: 'Plex',
  zspace: '极空间',
  trimemedia: '飞牛影视',
  ugreen: '绿联影视',
  mediavault: 'MediaVault',
  navidrome: 'Navidrome',
}

// 定义输入
const props = defineProps({
  // 单个媒体服务器
  mediaserver: {
    type: Object as PropType<MediaServerConf>,
    required: true,
  },
  // 所有媒体服务器
  mediaservers: {
    type: Array as PropType<MediaServerConf[]>,
    required: true,
  },
  // 旧版全局同步间隔，用作服务器未单独设置时的默认值
  defaultSyncInterval: {
    type: Number,
    default: null,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'done', 'change'])
const isRegisteredMediaServer = computed(() => isRegisteredModuleOption('mediaserver', props.mediaserver.type))

// 解析媒体服务器类型展示名，优先读取模块目录的本地化名称。
const mediaServerTypeLabel = computed(() => {
  if (!isRegisteredMediaServer.value) return t('setting.system.custom')
  const matched = catalog?.value?.find(
    item => item.type === 'mediaserver' && item.option_value === props.mediaserver.type,
  )
  return (
    matched?.name_i18n || matched?.name || MEDIA_SERVER_TYPE_LABELS[props.mediaserver.type] || props.mediaserver.type
  )
})

// 媒体统计数据
const infoItems = ref([
  {
    avatar: 'mdi-movie-roll',
    title: t('mediaType.movie'),
    amount: '0',
  },
  {
    avatar: 'mdi-television-box',
    title: t('mediaType.tv'),
    amount: '0',
  },
  {
    avatar: 'mdi-music-box-multiple',
    title: t('mediaType.music'),
    amount: '0',
  },
])

/** 打开共享媒体服务器配置弹窗。 */
function openMediaServerInfoDialog() {
  openSharedDialog(
    MediaServerInfoDialog,
    {
      mediaserver: props.mediaserver,
      mediaservers: props.mediaservers,
      defaultSyncInterval: props.defaultSyncInterval,
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
  switch (props.mediaserver.type) {
    case 'emby':
      return getLogoUrl('emby')
    case 'zspace':
      return getLogoUrl('zspace')
    case 'jellyfin':
      return getLogoUrl('jellyfin')
    case 'trimemedia':
      return getLogoUrl('trimemedia')
    case 'ugreen':
      return getLogoUrl('ugreen')
    case 'plex':
      return getLogoUrl('plex')
    case 'mediavault':
      return getLogoUrl('mediavault')
    default:
      // Navidrome 等未内置图标的服务器统一回退到通用媒体服务器图标
      return getLogoUrl('mediaserver')
  }
})

/** 关闭媒体服务器卡片。 */
function onClose() {
  emit('close')
}

/** 调用 API 加载媒体服务器统计数据。 */
async function loadMediaStatistic() {
  try {
    const res: MediaStatistic = await api.get('dashboard/statistic', {
      params: {
        name: props.mediaserver.name,
      },
    })

    if (res) {
      infoItems.value = [
        {
          avatar: 'mdi-movie-roll',
          title: t('mediaType.movie'),
          amount: res.movie_count.toLocaleString(),
        },
        {
          avatar: 'mdi-television-box',
          title: t('mediaType.tv'),
          amount: res.tv_count.toLocaleString(),
        },
        {
          avatar: 'mdi-music-box-multiple',
          title: t('mediaType.music'),
          amount: (res.music_count || 0).toLocaleString(),
        },
      ]
    }
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadMediaStatistic()
})
</script>

<template>
  <VCard
    variant="flat"
    class="app-card-shell app-card-colorful mp-setting-card mp-setting-card--interactive"
    :class="{ 'mp-setting-card--inactive': !mediaserver.enabled }"
    :style="{ '--app-card-accent-rgb': accentRgb }"
    @click="openMediaServerInfoDialog"
  >
    <div class="mp-setting-card__header">
      <div class="mp-setting-card__icon mp-setting-card__icon--logo" aria-hidden="true">
        <VImg ref="imageRef" :src="getIcon" contain class="mp-setting-card__logo" @load="updateAccentColor" />
      </div>
      <div class="mp-setting-card__heading">
        <div class="mp-setting-card__title-row">
          <span class="mp-setting-card__title" :title="mediaserver.name">{{ mediaserver.name }}</span>
        </div>
        <div class="mp-setting-card__subtitle">
          <span class="mp-setting-card__subtitle-text">{{ mediaServerTypeLabel }}</span>
          <span
            class="mp-setting-card__status"
            :class="mediaserver.enabled ? 'mp-setting-card__status--active' : 'mp-setting-card__status--inactive'"
          >
            <span
              class="mp-setting-card__status-dot"
              :class="
                mediaserver.enabled ? 'mp-setting-card__status-dot--active' : 'mp-setting-card__status-dot--inactive'
              "
            />
            {{ mediaserver.enabled ? t('settingCard.enabled') : t('settingCard.disabled') }}
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
      <div
        v-if="isRegisteredMediaServer && mediaserver.enabled"
        class="mp-setting-card__stats mp-setting-card__stats--grid-3"
      >
        <span
          v-for="item in infoItems"
          :key="item.title"
          class="mp-setting-card__stat"
          :title="`${item.title}: ${item.amount}`"
        >
          <VIcon :icon="item.avatar" size="14" class="shrink-0" />
          <span class="mp-setting-card__stat-value">{{ item.amount }}</span>
        </span>
      </div>
      <span v-else class="mp-setting-card__muted">
        {{ !mediaserver.enabled ? t('settingCard.disabled') : t('setting.system.custom') }}
      </span>
      <VIcon class="mp-setting-card__chevron" icon="mdi-chevron-right" size="16" />
    </div>
  </VCard>
</template>
