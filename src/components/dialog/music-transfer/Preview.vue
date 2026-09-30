<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ManualTransferPreviewItem, MusicTransferPreview } from '@/api/types'
import { canCorrectMusicGroup, previewSourceKey, type MusicPreviewGroup } from './state'

const props = defineProps<{
  groups: MusicPreviewGroup[]
  disabled: boolean
  scopeComplete: boolean
  corrected: boolean
}>()
const emit = defineEmits<{ correct: [group: MusicPreviewGroup] }>()
const { t, te } = useI18n()
const prefix = 'dialog.reorganize.musicPreview.'
const page = ref(1)
const pages = computed(() => Math.ceil(props.groups.length / 10))
const visible = computed(() => props.groups.slice((page.value - 1) * 10, page.value * 10))
watch(
  () => props.groups,
  () => {
    page.value = Math.min(page.value, pages.value || 1)
  },
)

/** 专辑名称仅用于展示，不参与范围分组或整理身份。 */
function title(group: MusicPreviewGroup) {
  const item = group.items.find(row => row.music?.file_role === 'audio') ?? group.items[0]
  return item.music?.album || item.music?.title || item.collection_group || item.title || t(prefix + 'unknownAlbum')
}

/** 状态来自后端证据，不能由目标路径成功或存在远端ID推导在线确认。 */
function status(info?: MusicTransferPreview | null) {
  return t(prefix + 'states.' + state(info))
}

/** 旧响应或不一致摘要不能只凭 matched 文本冒充在线确认。 */
function state(info?: MusicTransferPreview | null) {
  return info?.status === 'matched' && !info.online_confirmed ? 'metadata' : (info?.status ?? 'metadata')
}

/** 为已确认、离线可用及需要处理三类结果提供辅助颜色。 */
function color(info?: MusicTransferPreview | null) {
  if (info?.status === 'matched' && info.online_confirmed) return 'success'
  if (['local_tags', 'local_cue', 'manual'].includes(info?.status ?? '')) return 'info'
  return 'warning'
}

/** 只显示认识的字段与证据来源，保留后端原始错误供纠正判断。 */
function evidence(item: ManualTransferPreviewItem) {
  return ['title', 'artists', 'album', 'album_artist', 'year', 'track_number', 'disc_number']
    .flatMap(field => {
      const source = item.music?.field_sources[field]
      return source && te(prefix + 'origins.' + source)
        ? [t(prefix + 'fields.' + field) + ': ' + t(prefix + 'origins.' + source)]
        : []
    })
    .join(' · ')
}
</script>

<template>
  <div class="music-preview">
    <VAlert type="info" variant="tonal" density="compact" class="mb-3">{{ t(prefix + 'explanation') }}</VAlert>
    <VAlert v-if="corrected" type="info" variant="tonal" density="compact" class="mb-3">{{
      t(prefix + 'frozenScope')
    }}</VAlert>
    <VAlert
      v-if="corrected && groups.some(group => group.items.some(item => item.success === false))"
      type="warning"
      variant="tonal"
      class="mb-3"
      >{{ t(prefix + 'pending') }}</VAlert
    >
    <section v-for="group in visible" :key="group.id" class="music-preview-group" :aria-label="title(group)">
      <header class="music-preview-group__header">
        <div class="music-preview-group__heading">
          <h3 class="text-subtitle-1">{{ title(group) }}</h3>
          <div class="text-caption text-medium-emphasis">
            {{
              group.items.find(item => item.music?.album_artist)?.music?.album_artist ||
              group.items[0].music?.artists?.join(' / ')
            }}
          </div>
          <div class="text-caption">
            {{ group.items[0].source_storage || group.items[0].source_item?.storage }} ·
            {{ group.items[0].music?.group_directory }}
          </div>
          <div class="d-flex flex-wrap ga-1 mt-2">
            <VChip
              v-for="state in [...new Set(group.items.map(item => state(item.music)))]"
              :key="state"
              size="small"
              variant="tonal"
            >
              {{ t(prefix + 'states.' + state) }}
            </VChip>
          </div>
        </div>
        <VBtn
          size="small"
          variant="tonal"
          color="primary"
          :disabled="disabled || !scopeComplete || !canCorrectMusicGroup(group)"
          :aria-label="t(prefix + 'correctAlbum', { album: title(group) })"
          @click="emit('correct', group)"
        >
          {{ t(prefix + 'correct') }}
        </VBtn>
      </header>
      <p v-if="!scopeComplete || !canCorrectMusicGroup(group)" class="text-caption text-medium-emphasis px-3 pb-2">
        {{ t(prefix + 'cannotCorrect') }}
      </p>
      <details :open="groups.length === 1">
        <summary class="pa-3">{{ t(prefix + 'files', { count: group.items.length }) }}</summary>
        <article v-for="item in group.items" :key="previewSourceKey(item)" class="music-preview-file">
          <div class="d-flex flex-wrap align-center ga-2">
            <VChip size="x-small" :color="color(item.music)" variant="tonal">{{ status(item.music) }}</VChip>
            <strong>{{ item.music?.title || item.title }}</strong>
            <span v-if="item.music?.disc_number || item.music?.track_number" class="text-caption">
              {{
                t(prefix + 'position', { disc: item.music?.disc_number || '-', track: item.music?.track_number || '-' })
              }}
            </span>
            <span v-if="item.music?.read_status" class="text-caption">{{
              t(prefix + 'read.' + item.music.read_status)
            }}</span>
          </div>
          <p v-if="item.music?.artists?.length" class="text-caption mt-1">{{ item.music.artists.join(' / ') }}</p>
          <p v-if="evidence(item)" class="text-caption text-medium-emphasis mt-1">{{ evidence(item) }}</p>
          <div class="music-preview-file__paths mt-2">
            <div>
              <span class="text-caption text-medium-emphasis">{{ t('dialog.reorganize.previewBeforeColumn') }}</span>
              <p>{{ item.source }}</p>
            </div>
            <div>
              <span class="text-caption text-medium-emphasis">{{ t('dialog.reorganize.previewAfterColumn') }}</span>
              <p>{{ item.target || '-' }}</p>
            </div>
          </div>
          <p v-if="item.success === false || item.message" class="text-caption text-error mt-2">{{ item.message }}</p>
          <p v-if="item.recovery_action" class="text-caption">{{ item.recovery_action }}</p>
        </article>
      </details>
    </section>
    <nav v-if="pages > 1" class="d-flex align-center justify-center ga-3 mt-3" :aria-label="t(prefix + 'albums')">
      <VBtn
        icon="mdi-chevron-left"
        variant="text"
        :disabled="page === 1"
        :aria-label="t(prefix + 'previous')"
        @click="page--"
      />
      <span>{{ page }} / {{ pages }}</span>
      <VBtn
        icon="mdi-chevron-right"
        variant="text"
        :disabled="page === pages"
        :aria-label="t(prefix + 'next')"
        @click="page++"
      />
    </nav>
  </div>
</template>

<style scoped>
.music-preview-group {
  margin-bottom: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  overflow-wrap: anywhere;
}
.music-preview-group__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  flex-wrap: wrap;
}
.music-preview-group__heading {
  flex: 1;
  min-width: 180px;
}
.music-preview-file {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 12px;
}
.music-preview-file__paths {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  font-size: 12px;
}
.music-preview-file__paths > div {
  min-width: 0;
}
@media (max-width: 600px) {
  .music-preview-file__paths {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
