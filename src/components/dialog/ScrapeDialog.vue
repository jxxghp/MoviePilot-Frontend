<script lang="ts" setup>
import { numberValidator } from '@/@validators'
import type { FileItem, ManualScrapeOptions, MediaDataSource, MediaInfo } from '@/api/types'
import { useGlobalSettingsStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import MediaIdSelector from '../misc/MediaIdSelector.vue'

const { t } = useI18n()

const props = defineProps({
  items: {
    type: Array as PropType<FileItem[]>,
    default: () => [],
  },
  modelValue: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'scrape', options: ManualScrapeOptions): void
  (event: 'update:modelValue', value: boolean): void
}>()

const mediaSourceItems = computed<{ title: string; value: MediaDataSource }[]>(() => [
  { title: t('setting.cache.recognitionSource.themoviedb'), value: 'themoviedb' },
  { title: t('setting.cache.recognitionSource.douban'), value: 'douban' },
  { title: t('setting.cache.recognitionSource.bangumi'), value: 'bangumi' },
  { title: t('setting.cache.recognitionSource.anilist'), value: 'anilist' },
])

const globalSettingsStore = useGlobalSettingsStore()
const mediaType = ref('')
const mediaSource = ref<MediaDataSource>(getDefaultMediaSource())
const mediaId = ref<string | null>(null)
const mediaSelectorDialog = ref(false)

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const dialogSubtitle = computed(() => {
  if (props.items.length > 1) {
    return t('dialog.reorganize.multipleItemsTitle', { count: props.items.length })
  }
  return t('dialog.reorganize.singleItemTitle', { path: props.items[0]?.path ?? '' })
})

const mediaIdLabel = computed(() => {
  const labels: Record<MediaDataSource, string> = {
    themoviedb: t('dialog.reorganize.tmdbId'),
    douban: t('dialog.reorganize.doubanId'),
    bangumi: t('dialog.reorganize.bangumiId'),
    anilist: t('dialog.reorganize.anilistId'),
  }
  return labels[mediaSource.value]
})

const canSubmit = computed(() => {
  const normalizedMediaId = mediaId.value?.trim()
  return !normalizedMediaId || /^\d+$/.test(normalizedMediaId)
})

// 获取后台设置中的默认识别数据源，未知值兼容回退到 TheMovieDb。
function getDefaultMediaSource(): MediaDataSource {
  const configuredSource = globalSettingsStore.globalSettings.RECOGNIZE_SOURCE as MediaDataSource
  return mediaSourceItems.value.some(item => item.value === configuredSource) ? configuredSource : 'themoviedb'
}

// 将搜索结果媒体类型映射为手动刮削接口接受的类型名。
function resolveMediaType(type?: string) {
  const normalizedType = type?.trim().toLowerCase()
  if (['电影', 'movie'].includes(normalizedType ?? '')) return '电影'
  if (['电视剧', 'tv', 'series'].includes(normalizedType ?? '')) return '电视剧'
  return undefined
}

// 选择搜索结果后同步媒体类型，减少手动填写出错。
function handleMediaSelected(item: Pick<MediaInfo, 'type'>) {
  mediaType.value = resolveMediaType(item.type) ?? mediaType.value
}

// 关闭弹窗并通知共享弹窗 Host 回收当前实例。
function closeDialog() {
  emit('close')
  emit('update:modelValue', false)
}

// 提交本次手动刮削的请求级识别条件。
function submitScrape() {
  const normalizedMediaId = mediaId.value?.trim()
  emit('scrape', {
    media_source: mediaSource.value,
    media_id: normalizedMediaId || undefined,
    type_name: mediaType.value || undefined,
  })
}

// 切换数据源时清空上一来源的原生 ID，避免错用同一编号。
watch(mediaSource, () => {
  mediaId.value = null
  mediaSelectorDialog.value = false
})
</script>

<template>
  <VDialog v-model="dialogVisible" max-width="45rem" scrollable>
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-auto-fix" class="me-2" />
        </template>
        <VCardTitle>{{ t('file.manualScrape') }}</VCardTitle>
        <VCardSubtitle>{{ dialogSubtitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="closeDialog" />
      <VDivider />
      <VCardText class="pt-6">
        <VRow>
          <VCol cols="12" md="4">
            <VSelect
              v-model="mediaType"
              :label="t('dialog.reorganize.mediaType')"
              :items="[
                { title: t('dialog.reorganize.auto'), value: '' },
                { title: t('dialog.reorganize.movie'), value: '电影' },
                { title: t('dialog.reorganize.tv'), value: '电视剧' },
              ]"
              :hint="t('dialog.reorganize.mediaTypeHint')"
              persistent-hint
              prepend-inner-icon="mdi-movie-open"
            />
          </VCol>
          <VCol cols="12" md="4">
            <VSelect
              v-model="mediaSource"
              :items="mediaSourceItems"
              :label="t('dialog.reorganize.mediaSource')"
              :hint="t('dialog.reorganize.mediaSourceHint')"
              persistent-hint
              prepend-inner-icon="mdi-database-search"
            />
          </VCol>
          <VCol cols="12" md="4">
            <VTextField
              v-model="mediaId"
              :disabled="mediaType === ''"
              :label="mediaIdLabel"
              :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
              :rules="[numberValidator]"
              append-inner-icon="mdi-magnify"
              :hint="t('dialog.reorganize.mediaIdHint')"
              persistent-hint
              prepend-inner-icon="mdi-identifier"
              @click:append-inner="mediaSelectorDialog = true"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          prepend-icon="mdi-auto-fix"
          class="px-5"
          :disabled="!canSubmit"
          @click="submitScrape"
        >
          {{ t('common.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>

    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector
        v-model="mediaId"
        :type="mediaSource"
        @close="mediaSelectorDialog = false"
        @select="handleMediaSelected"
      />
    </VDialog>
  </VDialog>
</template>
