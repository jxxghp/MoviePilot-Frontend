<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MediaDataSource, MusicEntityType } from '@/api/types'
import { isMediaDataSource, isMusicMediaSource } from '@/utils/mediaId'
import { useMediaSources } from '@/composables/useMediaSources'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    itemTitle?: string
    loading?: boolean
    modelValue?: boolean
    recognizeSource?: string
    musicType?: Exclude<MusicEntityType, 'artist'>
  }>(),
  {
    itemTitle: '',
    loading: false,
    modelValue: true,
    recognizeSource: '',
    musicType: 'recording',
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (
    event: 'confirm',
    payload: {
      mediaSource?: MediaDataSource
      mediaId?: string
      musicType?: Exclude<MusicEntityType, 'artist'>
    },
  ): void
  (event: 'update:modelValue', value: boolean): void
}>()

const mediaSource = ref<MediaDataSource>(
  isMediaDataSource(props.recognizeSource) ? props.recognizeSource : 'themoviedb',
)
const mediaId = ref<string>()
const musicType = ref<Exclude<MusicEntityType, 'artist'>>(props.musicType)
const isMusicSelection = computed(() => isMusicMediaSource(mediaSource.value))
const { mediaSourceItems: getMediaSourceItems } = useMediaSources()
const customMediaSourceItems = getMediaSourceItems('media')
const customMusicSourceItems = getMediaSourceItems('music')
const musicEntityItems = computed(() => [
  { title: t('setting.cache.musicType.recording'), value: 'recording' },
  { title: t('setting.cache.musicType.album'), value: 'album' },
])
const mediaSourceItems = computed<{ title: string; value: MediaDataSource }[]>(() => [
  { title: t('setting.cache.recognitionSource.themoviedb'), value: 'themoviedb' },
  { title: t('setting.cache.recognitionSource.douban'), value: 'douban' },
  { title: t('setting.cache.recognitionSource.bangumi'), value: 'bangumi' },
  { title: t('setting.cache.recognitionSource.anilist'), value: 'anilist' },
  { title: t('setting.cache.recognitionSource.musicbrainz'), value: 'musicbrainz' },
  { title: t('setting.cache.recognitionSource.theaudiodb'), value: 'theaudiodb' },
  { title: t('setting.cache.recognitionSource.doubanmusic'), value: 'doubanmusic' },
  ...customMediaSourceItems.value,
  ...customMusicSourceItems.value,
])

const mediaIdLabel = computed(() => {
  const labels: Record<string, string> = {
    themoviedb: t('setting.cache.reidentifyDialog.tmdbId'),
    douban: t('setting.cache.reidentifyDialog.doubanId'),
    bangumi: t('setting.cache.reidentifyDialog.bangumiId'),
    anilist: t('setting.cache.reidentifyDialog.anilistId'),
    musicbrainz: 'MusicBrainz ID',
    theaudiodb: 'TheAudioDB ID',
    doubanmusic: t('setting.cache.reidentifyDialog.doubanId'),
  }
  return labels[mediaSource.value] || t('setting.cache.reidentifyDialog.mediaId')
})

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 提交重新识别参数给缓存页执行接口调用。
function submitReidentify() {
  const normalizedMediaId = mediaId.value?.trim() || undefined
  emit('confirm', {
    mediaSource: normalizedMediaId ? mediaSource.value : undefined,
    mediaId: normalizedMediaId,
    musicType: isMusicSelection.value ? musicType.value : undefined,
  })
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" scrollable max-width="35rem">
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon>mdi-text-recognition</VIcon>
        </template>
        <VCardTitle>{{ t('setting.cache.reidentifyDialog.title') }}</VCardTitle>
        <VCardSubtitle>{{ props.itemTitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VSelect
              v-model="mediaSource"
              :items="mediaSourceItems"
              :label="t('setting.cache.reidentifyDialog.mediaSource')"
              :hint="t('setting.cache.reidentifyDialog.mediaSourceHint')"
              prepend-inner-icon="mdi-database-search"
              persistent-hint
            />
          </VCol>
          <VCol v-if="isMusicSelection" cols="12">
            <VSelect
              v-model="musicType"
              :items="musicEntityItems"
              :label="t('dialog.reorganize.musicEntity')"
              prepend-inner-icon="mdi-music-box-multiple-outline"
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="mediaId"
              :label="mediaIdLabel"
              :hint="t('setting.cache.reidentifyDialog.mediaIdHint')"
              clearable
              prepend-inner-icon="mdi-id-card"
              persistent-hint
            />
          </VCol>
        </VRow>
        <VAlert type="info" variant="tonal" class="mt-4">
          {{ t('setting.cache.reidentifyDialog.autoHint') }}
        </VAlert>
      </VCardText>

      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          :loading="props.loading"
          prepend-icon="mdi-check"
          class="px-5"
          @click="submitReidentify"
        >
          {{ t('setting.cache.reidentifyDialog.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
