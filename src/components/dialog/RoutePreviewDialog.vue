<script setup lang="ts">
import api from '@/api'
import type {
  CategoryConfig,
  DirectoryMatchMode,
  RouteDiagnosticReason,
  RouteDiagnosticWarning,
  TransferDirectoryConf,
  TransferRoutePreviewRequest,
  TransferRoutePreviewResponse,
} from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { cloneDeep } from 'lodash-es'

const props = defineProps<{
  modelValue?: boolean
  directories: TransferDirectoryConf[]
  categoryConfig: CategoryConfig
  matchMode: DirectoryMatchMode
}>()

const emit = defineEmits<{ close: [] }>()
const { t, te } = useI18n()
const display = useDisplay()

const loading = ref(false)
const error = ref('')
const result = ref<TransferRoutePreviewResponse>()
const media = reactive({
  type: '电视剧' as '电影' | '电视剧',
  title: '',
  year: '',
  category: '',
})
const genreIds = ref('')
const originalLanguage = ref('')
const countries = ref('')

const mediaTypeItems = computed(() => [
  { title: t('setting.directory.routePreview.movie'), value: '电影' },
  { title: t('setting.directory.routePreview.tv'), value: '电视剧' },
])

const allWarnings = computed(() => {
  if (!result.value) return []
  return [...result.value.category.warnings, ...result.value.route.warnings]
})

function splitValues(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function buildRequest(): TransferRoutePreviewRequest {
  const metadata: Record<string, unknown> = {}
  const genres = splitValues(genreIds.value).map(value => (/^\d+$/.test(value) ? Number(value) : value))
  const countryValues = splitValues(countries.value).map(value => value.toUpperCase())
  const language = originalLanguage.value.trim()
  const year = media.year.trim()

  if (genres.length) metadata.genre_ids = genres
  if (language) metadata.original_language = language
  if (countryValues.length) {
    if (media.type === '电影') metadata.production_countries = countryValues.map(iso_3166_1 => ({ iso_3166_1 }))
    else metadata.origin_country = countryValues
  }
  if (year) metadata[media.type === '电影' ? 'release_date' : 'first_air_date'] = `${year}-01-01`

  return {
    media: {
      type: media.type,
      title: media.title.trim() || undefined,
      year: year || undefined,
      category: media.category.trim() || undefined,
    },
    metadata,
    category_config: cloneDeep(props.categoryConfig),
    directories: cloneDeep(props.directories),
    match_mode: props.matchMode,
  }
}

async function previewRoute() {
  loading.value = true
  error.value = ''
  try {
    result.value = await api.post<TransferRoutePreviewResponse>('transfer/route/preview', buildRequest(), {
      feedback: 'silent',
    })
  } catch (err) {
    result.value = undefined
    error.value = t('setting.directory.routePreview.requestFailed', {
      message: err instanceof Error ? err.message : t('common.error'),
    })
  } finally {
    loading.value = false
  }
}

function warningText(warning: RouteDiagnosticWarning): string {
  const key = `setting.directory.routePreview.warnings.${warning.code}`
  return te(key) ? t(key) : warning.message
}

function reasonText(reason: RouteDiagnosticReason): string {
  const key = `setting.directory.routePreview.reasons.${reason.code}`
  return te(key) ? t(key) : reason.message
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return t('setting.directory.routePreview.missingValue')
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
</script>

<template>
  <VDialog :model-value="modelValue" max-width="1180" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VDialogCloseBtn @click="emit('close')" />
      <VCardItem class="pe-14">
        <VCardTitle>{{ t('setting.directory.routePreview.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.directory.routePreview.subtitle') }}</VCardSubtitle>
      </VCardItem>

      <VDivider />
      <VCardText class="route-preview-body">
        <VRow>
          <VCol cols="12" sm="6" md="3">
            <VSelect
              v-model="media.type"
              :items="mediaTypeItems"
              :label="t('setting.directory.routePreview.mediaType')"
              prepend-inner-icon="mdi-movie-filter"
            />
          </VCol>
          <VCol cols="12" sm="6" md="5">
            <VTextField v-model="media.title" :label="t('setting.directory.routePreview.mediaTitle')" />
          </VCol>
          <VCol cols="12" sm="6" md="2">
            <VTextField v-model="media.year" :label="t('setting.directory.routePreview.year')" inputmode="numeric" />
          </VCol>
          <VCol cols="12" sm="6" md="2">
            <VTextField v-model="media.category" :label="t('setting.directory.routePreview.providedCategory')" />
          </VCol>
          <VCol cols="12" md="4">
            <VTextField
              v-model="genreIds"
              :label="t('setting.directory.routePreview.genreIds')"
              :placeholder="t('setting.directory.routePreview.genreIdsPlaceholder')"
            />
          </VCol>
          <VCol cols="12" md="4">
            <VTextField
              v-model="originalLanguage"
              :label="t('setting.directory.routePreview.originalLanguage')"
              placeholder="zh"
            />
          </VCol>
          <VCol cols="12" md="4">
            <VTextField
              v-model="countries"
              :label="t('setting.directory.routePreview.countries')"
              placeholder="CN, US"
            />
          </VCol>
        </VRow>

        <div class="d-flex justify-end mb-5">
          <VBtn color="primary" prepend-icon="mdi-routes" :loading="loading" @click="previewRoute">
            {{ t('setting.directory.routePreview.run') }}
          </VBtn>
        </div>

        <VAlert v-if="error" type="error" variant="tonal" class="mb-5" :text="error" />
        <VAlert
          v-else-if="!result"
          type="info"
          variant="tonal"
          class="mb-0"
          :text="t('setting.directory.routePreview.empty')"
        />

        <template v-else>
          <section class="route-summary mb-5" aria-labelledby="route-preview-result-title">
            <div>
              <div id="route-preview-result-title" class="text-overline text-medium-emphasis">
                {{ t('setting.directory.routePreview.result') }}
              </div>
              <div class="text-h6 mt-1" data-testid="selected-directory">
                {{ result.route.selected_directory?.name || t('setting.directory.routePreview.noRoute') }}
              </div>
              <div v-if="result.route.selected_directory?.library_path" class="text-body-2 text-medium-emphasis mt-1">
                {{ result.route.selected_directory.library_path }}
              </div>
            </div>
            <div class="route-summary__chips">
              <VChip color="primary" variant="tonal" prepend-icon="mdi-shape">
                {{ result.category.selected_category || t('setting.directory.routePreview.noCategory') }}
              </VChip>
              <VChip color="info" variant="tonal" prepend-icon="mdi-tune-variant">
                {{ t(`setting.directory.routePreview.modes.${result.route.mode}`) }}
              </VChip>
            </div>
          </section>

          <VAlert
            v-if="!result.route.selected_directory"
            type="warning"
            variant="tonal"
            class="mb-5"
            :text="t('setting.directory.routePreview.noRoute')"
          />

          <section v-if="result.comparisons.length" class="mb-5">
            <h3 class="text-subtitle-1 mb-3">{{ t('setting.directory.routePreview.comparison') }}</h3>
            <div class="route-comparison">
              <div v-for="decision in result.comparisons" :key="decision.mode" class="route-comparison__item">
                <span class="text-body-2 text-medium-emphasis">
                  {{ t(`setting.directory.routePreview.modes.${decision.mode}`) }}
                </span>
                <strong>{{
                  decision.selected_directory?.name || t('setting.directory.routePreview.noRouteShort')
                }}</strong>
              </div>
            </div>
          </section>

          <section v-if="allWarnings.length" class="mb-5">
            <h3 class="text-subtitle-1 mb-3">{{ t('setting.directory.routePreview.diagnostics') }}</h3>
            <VAlert
              v-for="(warning, index) in allWarnings"
              :key="`${warning.code}-${index}`"
              type="warning"
              variant="tonal"
              density="compact"
              class="mb-2"
              :text="warningText(warning)"
            />
          </section>

          <VExpansionPanels multiple variant="accordion" class="route-preview-panels">
            <VExpansionPanel>
              <VExpansionPanelTitle>
                <VIcon icon="mdi-shape-outline" class="me-2" />
                {{ t('setting.directory.routePreview.categoryRules') }}
                <VChip size="small" variant="tonal" class="ms-2">{{ result.category.rules.length }}</VChip>
              </VExpansionPanelTitle>
              <VExpansionPanelText>
                <VAlert
                  v-if="!result.category.rules.length"
                  type="info"
                  variant="text"
                  :text="t('setting.directory.routePreview.noCategoryRules')"
                />
                <div v-for="rule in result.category.rules" :key="rule.index" class="decision-row">
                  <div class="decision-row__header">
                    <strong>{{ rule.category }}</strong>
                    <div class="d-flex gap-2">
                      <VChip v-if="rule.selected" size="small" color="primary">
                        {{ t('setting.directory.routePreview.selected') }}
                      </VChip>
                      <VChip size="small" :color="rule.matched ? 'success' : 'default'" variant="tonal">
                        {{
                          rule.matched
                            ? t('setting.directory.routePreview.matched')
                            : t('setting.directory.routePreview.notMatched')
                        }}
                      </VChip>
                    </div>
                  </div>
                  <div v-if="rule.conditions.length" class="condition-list mt-2">
                    <div v-for="condition in rule.conditions" :key="condition.field" class="condition-list__item">
                      <code>{{ condition.field }}</code>
                      <span>{{ formatValue(condition.expected) }}</span>
                      <VIcon
                        :icon="condition.matched ? 'mdi-check' : 'mdi-close'"
                        :color="condition.matched ? 'success' : 'error'"
                        size="18"
                      />
                      <span class="text-medium-emphasis">{{ formatValue(condition.actual) }}</span>
                    </div>
                  </div>
                </div>
              </VExpansionPanelText>
            </VExpansionPanel>

            <VExpansionPanel>
              <VExpansionPanelTitle>
                <VIcon icon="mdi-folder-multiple-outline" class="me-2" />
                {{ t('setting.directory.routePreview.directoryCandidates') }}
                <VChip size="small" variant="tonal" class="ms-2">{{ result.route.candidates.length }}</VChip>
              </VExpansionPanelTitle>
              <VExpansionPanelText>
                <VAlert
                  v-if="!result.route.candidates.length"
                  type="info"
                  variant="text"
                  :text="t('setting.directory.routePreview.noCandidates')"
                />
                <div v-for="candidate in result.route.candidates" :key="candidate.index" class="decision-row">
                  <div class="decision-row__header">
                    <div>
                      <strong>{{ candidate.directory.name }}</strong>
                      <div v-if="candidate.directory.library_path" class="text-caption text-medium-emphasis">
                        {{ candidate.directory.library_path }}
                      </div>
                    </div>
                    <div class="d-flex gap-2 flex-wrap justify-end">
                      <VChip v-if="candidate.selected" size="small" color="primary">
                        {{ t('setting.directory.routePreview.selected') }}
                      </VChip>
                      <VChip size="small" variant="tonal">
                        {{ t(`setting.directory.routePreview.matchLevels.${candidate.match_level}`) }}
                      </VChip>
                    </div>
                  </div>
                  <ul v-if="candidate.reasons.length" class="text-body-2 text-medium-emphasis mt-2 mb-0 ps-5">
                    <li v-for="reason in candidate.reasons" :key="reason.code">{{ reasonText(reason) }}</li>
                  </ul>
                </div>
              </VExpansionPanelText>
            </VExpansionPanel>
          </VExpansionPanels>
        </template>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.route-preview-body {
  min-height: 320px;
}

.route-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
}

.route-summary__chips,
.decision-row__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.route-comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.route-comparison__item,
.decision-row {
  padding: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
}

.route-comparison__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.decision-row + .decision-row {
  margin-top: 10px;
}

.decision-row__header {
  justify-content: space-between;
}

.condition-list {
  display: grid;
  gap: 6px;
}

.condition-list__item {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(80px, 1fr) 20px minmax(80px, 1fr);
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
}

@media (max-width: 599px) {
  .route-summary {
    align-items: flex-start;
    flex-direction: column;
  }

  .route-comparison {
    grid-template-columns: 1fr;
  }

  .condition-list__item {
    grid-template-columns: 1fr;
  }
}
</style>
