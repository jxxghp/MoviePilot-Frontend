<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaStatistic } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'
import { mediaServerDict } from '@/api/constants'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useCardAccentColor } from '@/composables/useCardAccentColor'

const MediaServerInfoDialog = defineAsyncComponent(() => import('@/components/dialog/MediaServerInfoDialog.vue'))

// 获取i18n实例
const { t } = useI18n()
const { accentRgb, imageRef, updateAccentColor } = useCardAccentColor('#56CA00')

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
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'done', 'change'])

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
    avatar: 'mdi-account',
    title: t('common.user'),
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
    default:
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
          avatar: 'mdi-account',
          title: t('common.user'),
          amount: res.user_count.toLocaleString(),
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
    variant="tonal"
    class="app-card-shell app-card-colorful"
    :style="{ '--app-card-accent-rgb': accentRgb }"
    @click="openMediaServerInfoDialog"
  >
    <VDialogCloseBtn @click="onClose" />
    <VCardText class="app-card-summary app-card-summary--single-action">
      <div class="app-card-summary__content">
        <div class="app-card-summary__title text-h6">{{ mediaserver.name }}</div>
        <div
          v-if="mediaServerDict[mediaserver.type] && mediaserver.enabled"
          class="grid min-h-6 grid-cols-3 gap-2 text-sm text-medium-emphasis"
        >
          <span v-for="item in infoItems" :key="item.title" class="flex min-w-0 items-center">
            <VIcon rounded :icon="item.avatar" class="me-1 shrink-0" />
            <span class="truncate">{{ item.amount }}</span>
          </span>
        </div>
        <div v-else-if="!mediaServerDict[mediaserver.type]" class="app-card-summary__subtitle text-sm">
          {{ t('setting.system.custom') }}
        </div>
      </div>
      <div class="app-card-summary__media" aria-hidden="true">
        <VImg ref="imageRef" :src="getIcon" contain class="app-card-summary__image" @load="updateAccentColor" />
      </div>
    </VCardText>
  </VCard>
</template>
