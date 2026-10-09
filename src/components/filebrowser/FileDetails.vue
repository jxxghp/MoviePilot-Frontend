<script setup lang="ts">
import type { FileItem } from '@/api/types'
import type { FileAction } from './types'
import { formatBytes } from '@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'

const props = defineProps<{ item: FileItem; imageUrl?: string; loading?: boolean }>()
const emit = defineEmits<{ close: []; action: [action: FileAction, item: FileItem] }>()
const { t } = useI18n()
const actions: { key: FileAction; icon: string }[] = [
  { key: 'recognize', icon: 'mdi-text-recognition' },
  { key: 'scrape', icon: 'mdi-auto-fix' },
  { key: 'rename', icon: 'mdi-rename' },
  { key: 'reorganize', icon: 'mdi-folder-arrow-right' },
  { key: 'download', icon: 'mdi-download' },
  { key: 'delete', icon: 'mdi-delete-outline' },
]
const visibleActions = computed(() =>
  actions.filter(action => (action.key !== 'download' || props.item.type === 'file') && action.key !== 'reorganize'),
)

/** 从后端时间戳生成与列表一致的本地化修改时间。 */
function formatTime(timestamp?: number) {
  return timestamp ? dayjs(timestamp * 1000).format('YYYY-MM-DD HH:mm') : '—'
}
</script>

<template>
  <section class="file-details">
    <header class="file-details__header">
      <h2>{{ t(item.type === 'dir' ? 'file.folderDetails' : 'file.details') }}</h2>
      <IconBtn :aria-label="t('common.close')" @click="emit('close')"><VIcon icon="mdi-close" /></IconBtn>
    </header>
    <div class="file-details__scroll">
      <VProgressLinear v-if="loading" indeterminate color="primary" :aria-label="t('common.loading')" />
      <VImg
        v-if="imageUrl || item.thumbnail"
        :src="imageUrl || item.thumbnail"
        class="file-details__preview"
        :aspect-ratio="imageUrl ? 16 / 9 : 2.1"
        :cover="!imageUrl"
      />
      <div class="file-details__identity">
        <div>
          <h3>{{ item.name }}</h3>
        </div>
      </div>
      <dl class="file-details__metadata">
        <template v-if="item.type === 'file'">
          <dt>{{ t('file.size') }}</dt>
          <dd>
            {{
              typeof item.size === 'number' && Number.isFinite(item.size) && item.size >= 0
                ? formatBytes(item.size)
                : ''
            }}
          </dd>
        </template>
        <dt>{{ t('file.modifyTime') }}</dt>
        <dd>{{ formatTime(item.modify_time) }}</dd>
        <dt>{{ t('file.path') }}</dt>
        <dd :title="item.path">{{ item.type === 'file' ? item.path?.replace(/[^/]+$/, '') : item.path }}</dd>
      </dl>
      <VBtn
        color="primary"
        variant="flat"
        block
        class="file-details__primary"
        prepend-icon="mdi-folder-arrow-right"
        @click="emit('action', 'reorganize', item)"
        >{{ t('file.reorganize') }}</VBtn
      >
      <div class="file-details__actions">
        <VBtn
          v-for="action in visibleActions"
          :key="action.key"
          :variant="action.key === 'delete' ? 'outlined' : 'text'"
          :prepend-icon="action.icon"
          :color="action.key === 'delete' ? 'error' : action.key === 'reorganize' ? 'primary' : 'on-surface'"
          :class="{ 'file-details__delete': action.key === 'delete' }"
          @click="emit('action', action.key, item)"
          >{{ t(`file.${action.key}`) }}</VBtn
        >
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.file-details {
  display: flex;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
  block-size: 100%;
}
.file-details__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1.25rem;
}
.file-details__header h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}
.file-details__scroll {
  overflow: auto;
  overscroll-behavior: contain;
  min-block-size: 0;
  padding: 0 1.25rem 1.25rem;
}
.file-details__preview {
  overflow: hidden;
  border-radius: var(--app-surface-radius);
  margin-block: 0.5rem 1rem;
}
.file-details__identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-block: 0.5rem 1.25rem;
}
.file-details__identity h3 {
  font-size: 1.125rem;
  line-height: 1.5;
  font-weight: 600;
  overflow-wrap: anywhere;
  margin: 0;
}
.file-details__identity > div {
  min-inline-size: 0;
}
.file-details__metadata {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.75rem 1rem;
  margin-block: 0 1.25rem;
  font-size: 0.875rem;
}
.file-details__metadata dt {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.file-details__metadata dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.file-details__primary {
  margin-block-end: 0.75rem;
}
.file-details__actions {
  display: flex;
  flex-direction: column;
}
.file-details__actions :deep(.v-btn) {
  justify-content: flex-start;
  min-block-size: 2.5rem;
  letter-spacing: 0;
}
.file-details__delete {
  margin-block-start: 0.75rem;
}
</style>
