<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PlayableEpisode } from '@/types/playback'

/** 详情页与媒体库搜索共用选集布局，播放标识始终由各入口的媒体服务器映射提供。 */
const props = defineProps<{
  modelValue: boolean
  season: number | null
  seasons: Array<{ value: number; title: string }>
  episodes: PlayableEpisode[]
  loading: boolean
  failed: boolean
  imageSource: (path: string) => string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:season': [value: number]
  play: [episode: PlayableEpisode]
}>()
const { t } = useI18n()
const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})
</script>

<template>
  <VDialog v-model="visible" max-width="760" scrollable>
    <VCard class="episode-picker">
      <header class="episode-picker__header" data-native-dialog-header>
        <span class="episode-picker__header-spacer" aria-hidden="true" />
        <h2 data-native-dialog-title>{{ t('media.playback.chooseEpisode') }}</h2>
        <IconBtn
          data-native-dialog-close
          :aria-label="t('common.close')"
          class="episode-picker__close"
          @click="visible = false"
        >
          <VIcon icon="mdi-close" />
        </IconBtn>
      </header>
      <VCardText class="episode-picker__content" data-native-dialog-content>
        <div class="episode-picker__season-label">{{ t('media.playback.season') }}</div>
        <div class="episode-picker__seasons" role="tablist" :aria-label="t('media.playback.season')">
          <VBtn
            v-for="season in props.seasons"
            :key="season.value"
            :variant="props.season === season.value ? 'flat' : 'text'"
            :color="props.season === season.value ? 'primary' : undefined"
            :aria-pressed="props.season === season.value"
            size="small"
            @click="emit('update:season', season.value)"
          >
            {{ season.title }}
          </VBtn>
        </div>
        <VProgressLinear v-if="props.loading" class="episode-picker__loading" color="primary" indeterminate />
        <VAlert v-else-if="props.failed" class="mt-5" type="info" variant="tonal">
          {{ t('media.playback.noPlayableEpisodes') }}
        </VAlert>
        <VList v-else class="episode-picker__episodes" lines="three">
          <VListItem
            v-for="item in props.episodes"
            :key="item.episode"
            class="episode-picker__episode"
            :aria-label="`播放 S${String(props.season || 0).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}${item.name ? ` · ${item.name}` : ''}`"
            @click="emit('play', item)"
          >
            <template #prepend>
              <VImg
                v-if="item.stillPath"
                :src="props.imageSource(item.stillPath)"
                class="episode-picker__thumbnail"
                cover
                alt=""
              />
              <div v-else class="episode-picker__thumbnail episode-picker__thumbnail--empty" aria-hidden="true">
                <VIcon icon="mdi-filmstrip-box" />
              </div>
            </template>
            <div class="episode-picker__details">
              <VListItemTitle class="episode-picker__title">
                <span class="episode-picker__number"
                  >S{{ String(props.season || 0).padStart(2, '0') }}E{{ String(item.episode).padStart(2, '0') }}</span
                >
                <span v-if="item.name" class="episode-picker__name">{{ item.name }}</span>
              </VListItemTitle>
              <VListItemSubtitle v-if="item.airDate || item.runtime" class="episode-picker__metadata">
                <span v-if="item.airDate" class="episode-picker__date">{{ item.airDate }}</span>
                <span v-if="item.runtime" class="episode-picker__runtime">{{ item.runtime }} min</span>
              </VListItemSubtitle>
            </div>
            <p v-if="item.overview" class="episode-picker__overview">{{ item.overview }}</p>
            <template #append>
              <VIcon icon="mdi-play-circle-outline" color="success" size="24" />
            </template>
          </VListItem>
        </VList>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.episode-picker {
  display: flex;
  flex-direction: column;
  block-size: min(88vh, 760px);
  max-block-size: calc(100vh - 24px);
  overflow: hidden;
}

@supports (height: 100dvh) {
  .episode-picker {
    block-size: min(88dvh, 760px);
    max-block-size: calc(100dvh - 24px);
  }
}

.episode-picker__header {
  position: relative;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  min-block-size: 56px;
  padding-inline: 12px;
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.episode-picker__header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
}

.episode-picker__close {
  grid-column: 3;
  justify-self: end;
}

.episode-picker__content {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 18px 20px;
}

.episode-picker__season-label {
  margin-block-end: 8px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8rem;
  font-weight: 600;
}

.episode-picker__seasons {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-block-end: 8px;
  scrollbar-width: none;
}

.episode-picker__seasons::-webkit-scrollbar {
  display: none;
}

.episode-picker__episodes {
  flex: 0 0 auto;
  overflow: visible;
  padding: 0;
}

.episode-picker__episode {
  align-items: flex-start;
  min-block-size: 0;
  margin-block: 4px;
  padding-block: 10px;
  border-radius: 6px;
}

.episode-picker__episode :deep(.v-list-item__content) {
  min-inline-size: 0;
  align-self: flex-start;
}

.episode-picker__episode.v-list-item :deep(.v-list-item__prepend) {
  align-self: flex-start;
  padding-block-start: 0;
}

.episode-picker__episode :deep(.v-list-item__append) {
  align-self: flex-start;
  margin-block-start: 2px;
}

.episode-picker__thumbnail {
  inline-size: 112px;
  block-size: 64px;
  flex: 0 0 auto;
  margin-inline-end: 12px;
  overflow: hidden;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.episode-picker__thumbnail--empty {
  display: grid;
  place-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 1.5rem;
}

.episode-picker__number {
  flex: 0 0 auto;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.episode-picker__details {
  min-inline-size: 0;
}

.episode-picker__title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px 0;
  min-inline-size: 0;
  line-height: 1.35;
  white-space: normal;
}

.episode-picker__name {
  min-inline-size: 0;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.episode-picker__episode :deep(.v-list-item-subtitle.episode-picker__metadata) {
  display: grid;
  grid-template-columns: 11ch minmax(0, 1fr);
  align-items: start;
  gap: 4px 8px;
  min-inline-size: 0;
  margin-block-start: 4px;
  overflow: visible;
  white-space: normal;
  -webkit-line-clamp: unset;
  -webkit-box-orient: unset;
  line-height: 1.4;
}

.episode-picker__date,
.episode-picker__runtime {
  white-space: nowrap;
}

.episode-picker__date {
  grid-column: 1;
}

.episode-picker__runtime {
  grid-column: 2;
  font-size: 0.75rem;
}

.episode-picker__overview {
  min-inline-size: 0;
  margin-block: 4px 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .episode-picker__content {
    padding-inline: 12px;
  }

  .episode-picker__thumbnail {
    inline-size: 88px;
    block-size: 56px;
  }

  .episode-picker__episode {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr) 28px;
    column-gap: 12px;
    padding-inline: 8px;
  }

  .episode-picker__episode :deep(.v-list-item__prepend) {
    grid-column: 1;
    grid-row: 1;
    align-self: flex-start;
  }

  .episode-picker__episode :deep(.v-list-item__content) {
    display: contents;
  }

  .episode-picker__episode :deep(.v-list-item__append) {
    grid-column: 3;
    grid-row: 1;
    align-self: flex-start;
  }

  .episode-picker__episode :deep(.v-list-item__spacer) {
    display: none;
  }

  .episode-picker__details {
    grid-column: 2;
    grid-row: 1;
    align-self: flex-start;
  }

  .episode-picker__date {
    display: none;
  }

  .episode-picker__episode :deep(.v-list-item-subtitle.episode-picker__metadata) {
    grid-template-columns: minmax(0, 1fr);
  }

  .episode-picker__runtime {
    grid-column: 1;
  }

  .episode-picker__overview {
    grid-column: 1 / -1;
    grid-row: 2;
    margin-block-start: 8px;
  }
}

@media (max-width: 360px) {
  .episode-picker__episode {
    grid-template-columns: 72px minmax(0, 1fr) 24px;
    column-gap: 10px;
  }

  .episode-picker__thumbnail {
    inline-size: 72px;
    block-size: 46px;
  }
}
</style>
