<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { Context } from '@/api/types'
import { useI18n } from 'vue-i18n'

interface SummaryItem {
  icon: string
  label: string
  value: string
}

interface AnalysisStep {
  icon: string
  title: string
  value: string
}

// 国际化
const { t } = useI18n()

// 识别结果
const nameTestResult = ref<Context>()

// 名称识别表单
const nameTestForm = reactive({
  title: '',
  subtitle: '',
})

// 识别按钮状态
const nameTestLoading = ref(false)

// 识别按钮文本
const nameTestText = ref(t('nameTest.recognize'))

// 是否显示结果
const showResult = ref(false)

// 请求错误提示
const nameTestError = ref('')

const metaInfo = computed(() => nameTestResult.value?.meta_info)
const mediaInfo = computed(() => nameTestResult.value?.media_info)
const isRecognized = computed(() => Boolean(metaInfo.value?.name))
const resultTitle = computed(() => mediaInfo.value?.title || metaInfo.value?.name || t('nameTest.unrecognized'))
const resultSubtitle = computed(() => {
  const parts = [mediaInfo.value?.year || metaInfo.value?.year, mediaInfo.value?.type || metaInfo.value?.type]
  if (metaInfo.value?.season_episode) parts.push(metaInfo.value.season_episode)
  return parts.filter(Boolean).join(' · ') || t('nameTest.waitingResult')
})
const resourceChips = computed(() => {
  return [
    metaInfo.value?.web_source,
    metaInfo.value?.edition,
    metaInfo.value?.resource_pix,
    metaInfo.value?.video_encode,
    metaInfo.value?.audio_encode,
    metaInfo.value?.resource_team,
  ].filter(Boolean) as string[]
})
const summaryItems = computed<SummaryItem[]>(() => [
  {
    icon: 'mdi-calendar-range',
    label: t('nameTest.summary.year'),
    value: mediaInfo.value?.year || metaInfo.value?.year || '-',
  },
  {
    icon: 'mdi-format-list-numbered',
    label: t('nameTest.summary.episode'),
    value: metaInfo.value?.season_episode || metaInfo.value?.episode || '-',
  },
  {
    icon: 'mdi-shape-outline',
    label: t('nameTest.summary.type'),
    value: mediaInfo.value?.type || metaInfo.value?.type || '-',
  },
  {
    icon: 'mdi-database-search',
    label: t('nameTest.summary.source'),
    value: mediaInfo.value?.source || mediaInfo.value?.tmdb_id?.toString() || mediaInfo.value?.douban_id || '-',
  },
])
const analysisSteps = computed<AnalysisStep[]>(() => [
  {
    icon: 'mdi-file-document-outline',
    title: t('nameTest.steps.original.title'),
    value: metaInfo.value?.org_string || nameTestForm.title || '-',
  },
  {
    icon: 'mdi-puzzle-check-outline',
    title: t('nameTest.steps.meta.title'),
    value: [
      metaInfo.value?.name,
      metaInfo.value?.season_episode,
      metaInfo.value?.resource_term,
      metaInfo.value?.release_group,
    ]
      .filter(Boolean)
      .join(' · ') || '-',
  },
  {
    icon: 'mdi-movie-search-outline',
    title: t('nameTest.steps.media.title'),
    value: mediaInfo.value?.tmdb_id
      ? `TMDB ${mediaInfo.value.tmdb_id}`
      : mediaInfo.value?.douban_id
        ? `Douban ${mediaInfo.value.douban_id}`
        : mediaInfo.value?.title || '-',
  },
])

/** 将 TMDB 原始图片地址转换为弹窗内更轻量的海报缩略图。 */
function getPosterImage(url = '') {
  if (!url) return ''
  return url.replace('original', 'w500')
}

/** 调用媒体识别接口并刷新解析工作台。 */
async function nameTest() {
  if (!nameTestForm.title) return

  try {
    nameTestLoading.value = true
    nameTestText.value = t('nameTest.recognizing')
    nameTestError.value = ''
    showResult.value = false
    nameTestResult.value = await api.get<Context, Context>('media/recognize', {
      params: {
        title: nameTestForm.title,
        subtitle: nameTestForm.subtitle,
      },
    })
    nameTestText.value = t('nameTest.recognizeAgain')
    showResult.value = true
  } catch (error) {
    console.error(error)
    nameTestError.value = error instanceof Error ? error.message : t('nameTest.requestFailed')
  } finally {
    nameTestLoading.value = false
  }
}
</script>

<template>
  <div class="shortcut-workbench">
    <section class="shortcut-panel shortcut-input-panel">
      <div class="panel-heading">
        <div>
          <div class="text-subtitle-1 font-weight-medium">
            {{ t('nameTest.inputTitle') }}
          </div>
          <div class="text-caption text-medium-emphasis">
            {{ t('nameTest.inputSubtitle') }}
          </div>
        </div>
        <VIcon icon="mdi-text-recognition" color="primary" />
      </div>

      <VForm validate-on="submit lazy" @submit.prevent="nameTest">
        <VRow class="shortcut-form">
          <VCol cols="12" class="shortcut-form-col">
            <VTextField
              v-model="nameTestForm.title"
              :label="t('nameTest.title')"
              :rules="[requiredValidator]"
              prepend-inner-icon="mdi-movie-open"
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VTextarea
              v-model="nameTestForm.subtitle"
              :label="t('nameTest.subtitle')"
              rows="2"
              auto-grow
              prepend-inner-icon="mdi-subtitles"
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VBtn block type="submit" :disabled="nameTestLoading" :loading="nameTestLoading">
              <template #prepend>
                <VIcon icon="mdi-movie-search-outline" />
              </template>
              {{ nameTestText }}
            </VBtn>
          </VCol>
        </VRow>
      </VForm>

      <VAlert
        v-if="nameTestError"
        class="mt-4"
        density="comfortable"
        icon="mdi-alert-circle-outline"
        type="error"
        variant="tonal"
      >
        {{ nameTestError }}
      </VAlert>
    </section>

    <section class="shortcut-panel shortcut-result-panel">
      <div v-if="showResult" class="result-stack">
        <div class="media-result-card" :class="{ 'media-result-card--failed': !isRecognized }">
          <div v-if="mediaInfo?.poster_path" class="poster-frame">
            <VImg :src="getPosterImage(mediaInfo.poster_path)" aspect-ratio="2/3" cover>
              <template #placeholder>
                <VSkeletonLoader class="h-100 w-100" />
              </template>
            </VImg>
          </div>
          <div v-else class="poster-frame poster-frame--empty">
            <VIcon :icon="isRecognized ? 'mdi-movie-open-check' : 'mdi-movie-open-remove'" size="32" />
          </div>

          <div class="min-w-0">
            <div class="result-heading">
              <VIcon :icon="isRecognized ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'" color="primary" />
              <span class="result-title-text text-subtitle-1 font-weight-medium text-truncate">{{ resultTitle }}</span>
            </div>
            <div class="text-body-2 text-medium-emphasis mt-1">
              {{ resultSubtitle }}
            </div>
            <div class="chip-row mt-3">
              <VChip
                v-for="chip in resourceChips"
                :key="chip"
                class="result-chip"
                color="primary"
                size="small"
                variant="tonal"
              >
                {{ chip }}
              </VChip>
            </div>
          </div>
        </div>

        <div class="summary-grid">
          <div v-for="item in summaryItems" :key="item.label" class="summary-tile">
            <VIcon :icon="item.icon" size="18" class="summary-icon" />
            <div class="min-w-0">
              <div class="text-caption text-medium-emphasis">
                {{ item.label }}
              </div>
              <div class="text-body-2 font-weight-medium text-truncate">
                {{ item.value }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <VIcon icon="mdi-movie-search-outline" size="36" />
        <div class="text-body-2 text-medium-emphasis">
          {{ t('nameTest.waitingResult') }}
        </div>
      </div>
    </section>
  </div>

  <section v-if="showResult" class="shortcut-panel analysis-panel mt-4">
    <div class="panel-heading">
      <div>
        <div class="text-subtitle-1 font-weight-medium">
          {{ t('nameTest.analysisTitle') }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ t('nameTest.analysisSubtitle') }}
        </div>
      </div>
    </div>

    <div class="analysis-flow">
      <div v-for="step in analysisSteps" :key="step.title" class="analysis-step">
        <VIcon :icon="step.icon" color="primary" size="20" />
        <div class="min-w-0">
          <div class="text-body-2 font-weight-medium">
            {{ step.title }}
          </div>
          <div class="text-body-2 step-value">
            {{ step.value }}
          </div>
        </div>
      </div>
    </div>

  </section>

  <section v-if="showResult && metaInfo?.apply_words?.length" class="shortcut-panel applied-words-panel mt-4">
    <div class="panel-heading">
      <div>
        <div class="text-subtitle-1 font-weight-medium">
          {{ t('nameTest.steps.words.title') }}
        </div>
      </div>
    </div>

    <div class="words-list">
      <div v-if="metaInfo.org_string" class="word-row word-row--source">
        <span class="text-caption text-medium-emphasis">{{ t('nameTest.steps.original.title') }}</span>
        <span class="word-text">{{ metaInfo.org_string }}</span>
      </div>
      <div v-for="word in metaInfo.apply_words" :key="word" class="word-row">
        <span class="word-text">{{ word }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.shortcut-workbench {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 1rem;
  padding-block-start: 0.5rem;
}

.shortcut-panel {
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  background: var(--app-grouped-list-background);
  box-shadow: var(--app-surface-shadow);
  padding: 1rem;
}

.panel-heading {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  justify-content: space-between;
  margin-block-end: 1rem;
}

.shortcut-form {
  margin: 0;
}

.shortcut-form-col {
  padding-inline: 0;
}

.shortcut-form-col:first-child {
  padding-block-start: 0;
}

.shortcut-form-col:last-child {
  padding-block-end: 0;
}

.result-stack {
  display: grid;
  gap: 0.9rem;
}

.media-result-card {
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  gap: 0.85rem;
  align-items: center;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-primary), 0.08);
  padding: 0.75rem;
}

.media-result-card--failed {
  background: rgba(var(--v-theme-error), 0.08);
}

.poster-frame {
  overflow: hidden;
  border: var(--app-surface-border);
  border-radius: var(--app-control-radius);
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-theme-surface-variant), 0.35);
}

.poster-frame--empty {
  display: grid;
  place-items: center;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.result-chip {
  max-inline-size: 100%;
}

.result-heading {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.result-title-text {
  min-inline-size: 0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.summary-tile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.5rem;
  align-items: center;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface-variant), 0.22);
  padding: 0.65rem;
}

.summary-icon {
  color: rgb(var(--v-theme-primary));
}

.empty-state {
  display: grid;
  min-block-size: 14rem;
  place-items: center;
  align-content: center;
  gap: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-align: center;
}

.analysis-flow {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
}

.analysis-step {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.55rem;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface-variant), 0.2);
  padding: 0.7rem;
}

.step-value {
  overflow: hidden;
  margin-block-start: 0.35rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.words-list {
  display: grid;
  gap: 0.5rem;
}

.word-row {
  display: grid;
  gap: 0.25rem;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface-variant), 0.2);
  padding: 0.65rem;
}

.word-row--source {
  background: rgba(var(--v-theme-primary), 0.08);
}

.word-text {
  overflow-wrap: anywhere;
  word-break: break-word;
}

@media (max-width: 760px) {
  .shortcut-workbench,
  .analysis-flow {
    grid-template-columns: minmax(0, 1fr);
  }

  .summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .result-heading {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.35rem;
    align-items: start;
  }

  .result-title-text {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
}

@media (max-width: 420px) {
  .shortcut-panel {
    padding: 0.8rem;
  }

  .media-result-card {
    grid-template-columns: 4.25rem minmax(0, 1fr);
  }
}
</style>
