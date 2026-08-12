<script lang="ts" setup>
import api from '@/api'
import type { MediaDataSource, MediaInfo, MusicEntityType } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { isMusicMediaSource } from '@/utils/mediaId'

const { t } = useI18n()

// 定义输入变量
const props = defineProps<{
  type: MediaDataSource
  musicTypes?: MusicEntityType[]
}>()

interface MediaSelectorItem {
  // 数据源原生ID
  id: string
  // 媒体标题
  title: string
  // 媒体简介，包含类型标签
  overview: string
  // 海报地址
  poster: string
  // 媒体类型
  type?: string
  // 音乐实体类型
  music_type?: MusicEntityType
}

// update:modelValue 事件
const emit = defineEmits(['update:modelValue', 'select', 'close'])

const items = ref<MediaSelectorItem[]>([])

// 搜索词
const keyword = ref('')

// 加载中
const loading = ref(false)

// ref
const inputKeyword = ref<HTMLElement | null>(null)

// 选中条目并通知父组件同步额外媒体信息。
function selectMedia(item: MediaSelectorItem) {
  emit('update:modelValue', item.id)
  emit('select', item)
  emit('close')
}

// TMDB图片转换为w500大小
function getW500Image(url = '') {
  if (!url) return ''
  return url.replace('original', 'w500')
}

// 搜索词条
async function searchMedias() {
  const searchKeyword = keyword.value.trim()
  if (!searchKeyword) return

  // 调用API搜索词条
  try {
    loading.value = true
    const result: MediaInfo[] = await api.get('media/search', {
      params: {
        title: searchKeyword,
        type: isMusicMediaSource(props.type) ? 'music' : 'media',
        page: 1,
        count: 20,
        media_source: props.type,
      },
    })

    // 清空
    items.value = []

    // 赋值
    for (const item of result) {
      if (item.media_source !== props.type) continue
      if (props.musicTypes?.length && item.music_type && !props.musicTypes.includes(item.music_type)) {
        continue
      }
      const mediaId = item.media_id?.toString().trim()
      if (!mediaId) continue
      const musicAlbum = item.music_type === 'album' || item.album === item.title ? undefined : item.album
      items.value.push({
        id: mediaId,
        poster: getW500Image(item.cover_url || item.poster_path),
        type: item.type,
        music_type: item.music_type,
        title: item.year ? `${item.title}（${item.year}）` : item.title || '',
        overview:
          item.type === '音乐'
            ? `<span class="text-primary">${item.type}</span> ${[item.artist, musicAlbum].filter(Boolean).join(' · ')}`
            : `<span class="text-primary">${item.type}</span> ${item.overview || ''}`,
      })
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

// 加载时聚焦搜索框
onMounted(() => {
  // 500ms后聚焦
  setTimeout(() => {
    inputKeyword.value?.focus()
  }, 500)
})
</script>

<template>
  <VCard class="media-id-selector mx-auto" width="100%">
    <VCardTitle class="d-flex align-center justify-space-between">
      <span>{{ t('dialog.reorganize.mediaSearchInput') }}</span>
      <VDialogCloseBtn
        :aria-label="t('common.close')"
        inner-class="media-id-selector__close"
        @click="
          () => {
            emit('close')
          }
        "
      />
    </VCardTitle>
    <VCardText class="media-id-selector__search">
      <VTextField
        ref="inputKeyword"
        v-model="keyword"
        :mobile-layout="false"
        single-line
        :placeholder="t('dialog.reorganize.mediaSearchPlaceholder')"
        variant="outlined"
        append-inner-icon="mdi-magnify"
        flat
        hide-details
        :loading="loading"
        @click:append-inner="searchMedias"
        @keydown.enter="searchMedias"
      />
    </VCardText>
    <VDivider />
    <VList v-if="items.length > 0" class="media-id-selector__results" lines="three">
      <template v-for="item in items" :key="`${item.type || 'media'}-${item.id}`">
        <VListItem @click="selectMedia(item)">
          <template #prepend>
            <VImg
              height="75"
              width="50"
              :src="item.poster"
              aspect-ratio="2/3"
              class="object-cover rounded ring-gray-500 me-3"
              cover
            >
              <template #placeholder>
                <div class="w-full h-full">
                  <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                </div>
              </template>
            </VImg>
          </template>
          <VListItemTitle>
            {{ item.title }}
          </VListItemTitle>
          <VListItemSubtitle class="mt-2" v-html="item.overview" />
        </VListItem>
      </template>
    </VList>
  </VCard>
</template>

<style lang="scss" scoped>
.media-id-selector {
  overflow: hidden !important;
}

.media-id-selector__search {
  flex: 0 0 auto;
  overflow: visible !important;
  padding-block: 0.25rem 1rem !important;
}

.media-id-selector__close {
  position: relative;
  flex: 0 0 auto;
}

.media-id-selector__results {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow-anchor: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
</style>
