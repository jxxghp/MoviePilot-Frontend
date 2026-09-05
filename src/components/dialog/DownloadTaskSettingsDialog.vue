<script lang="ts" setup>
import api, { ApiRequestError, getApiBusinessErrorMessage, isApiResponse } from '@/api'
import type {
  DownloadingInfo,
  DownloadTaskMutationResult,
  DownloadTaskUpdateData,
  DownloadTaskUpdateRequest,
} from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'

interface DownloadTaskSettingsForm {
  tags: string[]
  trackers: string
  save_path: string
  category: string
  download_limit: number | string | null
  upload_limit: number | string | null
  ratio_limit: number | string | null
  seeding_time_limit: number | string | null
}

const props = defineProps<{
  modelValue: boolean
  task: DownloadingInfo
  downloaderName?: string
  downloaderType?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
  saved: [data: DownloadTaskUpdateData]
}>()

const { t } = useI18n()
const toast = useToast()
const display = useDisplay()
const formRef = ref()
const saving = ref(false)
const results = ref<DownloadTaskMutationResult[]>([])
const initialValues = ref<DownloadTaskSettingsForm>()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const normalizedDownloaderType = computed(() =>
  String(props.downloaderType || '')
    .trim()
    .toLowerCase(),
)
const supportsTrackers = computed(() => ['qbittorrent', 'transmission'].includes(normalizedDownloaderType.value))
const supportsCategory = computed(() => normalizedDownloaderType.value === 'qbittorrent')
const supportsSeedingPolicy = computed(() => ['qbittorrent', 'transmission'].includes(normalizedDownloaderType.value))

const form = ref<DownloadTaskSettingsForm>(createInitialForm())

/** 将接口中的可选数字转换为表单可编辑值。 */
function editableNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 根据任务快照创建表单，增量标签和 Tracker 默认不重复提交现值。 */
function createInitialForm(): DownloadTaskSettingsForm {
  return {
    tags: [],
    trackers: '',
    save_path: props.task.save_path || '',
    category: props.task.category || '',
    download_limit: editableNumber(props.task.download_limit),
    upload_limit: editableNumber(props.task.upload_limit),
    ratio_limit: editableNumber(props.task.ratio_limit),
    seeding_time_limit: editableNumber(props.task.seeding_time_limit),
  }
}

/** 重置当前任务的编辑状态和上一次逐项执行结果。 */
function resetForm() {
  form.value = createInitialForm()
  initialValues.value = { ...form.value, tags: [], trackers: '' }
  results.value = []
  formRef.value?.resetValidation?.()
}

/** 清理用户输入的字符串列表。 */
function normalizeStrings(values: string[]): string[] {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))]
}

/** 将每行一个的 Tracker 文本转换为接口列表。 */
function normalizeTrackers(value: string): string[] {
  return normalizeStrings(value.split(/\r?\n/))
}

/** 将可空数字表单值转换为接口数字。 */
function normalizeNumber(value: number | string | null): number | undefined {
  if (value === null || value === '') return undefined
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : undefined
}

/** 校验非负限速值，0 表示取消单任务限速。 */
function validateLimit(value: number | string | null): true | string {
  const normalized = normalizeNumber(value)
  return normalized === undefined || normalized >= 0 || t('downloading.settings.nonNegative')
}

/** 校验普通有限数字字段。 */
function validateNumber(value: number | string | null): true | string {
  if (value === null || value === '') return true
  return normalizeNumber(value) !== undefined || t('downloading.settings.invalidNumber')
}

/** 校验做种时间为整数分钟。 */
function validateInteger(value: number | string | null): true | string {
  if (value === null || value === '') return true
  const normalized = normalizeNumber(value)
  return normalized !== undefined && Number.isInteger(normalized) ? true : t('downloading.settings.integerRequired')
}

/** 校验 Tracker 使用下载器支持的 HTTP(S) 或 UDP 地址。 */
function validateTrackers(value: string): true | string {
  const trackers = normalizeTrackers(value)
  if (!trackers.length) return true
  const valid = trackers.every(tracker => {
    try {
      return ['http:', 'https:', 'udp:'].includes(new URL(tracker).protocol)
    } catch {
      return false
    }
  })
  return valid || t('downloading.settings.invalidTracker')
}

/** 只提交相对任务快照真正变化或由用户新增的字段。 */
function createPayload(): DownloadTaskUpdateRequest {
  const initial = initialValues.value || createInitialForm()
  const payload: DownloadTaskUpdateRequest = {
    downloader: props.downloaderName || props.task.downloader,
  }
  const tags = normalizeStrings(form.value.tags)
  const trackers = normalizeTrackers(form.value.trackers)
  if (tags.length) payload.tags = tags
  if (supportsTrackers.value && trackers.length) payload.trackers = trackers

  for (const key of ['download_limit', 'upload_limit'] as const) {
    const value = normalizeNumber(form.value[key])
    const initialValue = normalizeNumber(initial[key])
    if (value !== undefined && value !== initialValue) payload[key] = value
  }
  if (supportsSeedingPolicy.value) {
    for (const key of ['ratio_limit', 'seeding_time_limit'] as const) {
      const value = normalizeNumber(form.value[key])
      const initialValue = normalizeNumber(initial[key])
      if (value !== undefined && value !== initialValue) payload[key] = value
    }
  }

  const savePath = form.value.save_path.trim()
  if (savePath && savePath !== initial.save_path.trim()) payload.save_path = savePath
  const category = form.value.category.trim()
  if (supportsCategory.value && category && category !== initial.category.trim()) payload.category = category
  return payload
}

const hasChanges = computed(() => Object.keys(createPayload()).some(key => key !== 'downloader'))

/** 从业务失败异常中保留后端返回的逐项修改结果。 */
function extractMutationData(error: unknown): DownloadTaskUpdateData | undefined {
  if (!(error instanceof ApiRequestError)) return undefined
  const payload = error.payload
  if (!isApiResponse<DownloadTaskUpdateData>(payload)) return undefined
  return payload.data || undefined
}

/** 将部分成功的字段写入本地基线，避免重试时重复执行已经生效的操作。 */
function acceptSuccessfulChanges(data: DownloadTaskUpdateData, payload: DownloadTaskUpdateRequest) {
  const initial = { ...(initialValues.value || createInitialForm()) }
  for (const result of data.results) {
    if (!result.success) continue
    if (result.operation === 'tags') form.value.tags = []
    if (result.operation === 'trackers') form.value.trackers = ''
    if (result.operation === 'save_path' && payload.save_path !== undefined) {
      initial.save_path = payload.save_path
    }
    if (result.operation === 'category' && payload.category !== undefined) {
      initial.category = payload.category
    }
    if (result.operation === 'limits') {
      for (const key of ['download_limit', 'upload_limit', 'ratio_limit', 'seeding_time_limit'] as const) {
        if (payload[key] !== undefined) initial[key] = payload[key]
      }
    }
  }
  initialValues.value = initial
}

/** 提交高级设置，并准确呈现下载器不支持导致的部分失败。 */
async function saveSettings() {
  const validation = await formRef.value?.validate?.()
  if (validation && !validation.valid) return
  const payload = createPayload()
  if (!hasChanges.value || !props.task.hash || saving.value) return

  saving.value = true
  results.value = []
  try {
    const data = await api.patch<DownloadTaskUpdateData>(`download/${props.task.hash}`, payload, {
      feedback: 'silent',
    })
    results.value = data.results
    toast.success(t('downloading.settings.saveSuccess'))
    emit('saved', data)
    visible.value = false
  } catch (error) {
    const partialData = extractMutationData(error)
    if (partialData?.results.length) {
      results.value = partialData.results
      acceptSuccessfulChanges(partialData, payload)
      emit('saved', partialData)
      toast.warning(t('downloading.settings.partialFailure'))
    } else {
      console.error('保存下载任务高级设置失败:', error)
      toast.error(getApiBusinessErrorMessage(error) || t('downloading.settings.saveFailed'))
    }
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  value => {
    if (value) resetForm()
  },
  { immediate: true },
)
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="48rem" scrollable :fullscreen="display.smAndDown.value">
    <VCard class="download-task-settings-dialog">
      <VCardItem class="download-task-settings-dialog__header">
        <template #prepend>
          <VIcon icon="mdi-tune-variant" class="me-2" />
        </template>
        <VCardTitle>{{ t('downloading.settings.title') }}</VCardTitle>
        <VCardSubtitle>{{ task.title || task.name || t('common.unknown') }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />

      <VCardText class="download-task-settings-dialog__content">
        <VForm ref="formRef" @submit.prevent="saveSettings">
          <section class="download-task-settings-dialog__section">
            <div class="download-task-settings-dialog__section-title">
              {{ t('downloading.settings.speedAndSeeding') }}
            </div>
            <VRow>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model.number="form.download_limit"
                  type="number"
                  min="0"
                  step="1"
                  :label="t('downloading.settings.downloadLimit')"
                  :suffix="t('downloading.settings.kilobytesPerSecond')"
                  :rules="[validateLimit]"
                  prepend-inner-icon="mdi-download-outline"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model.number="form.upload_limit"
                  type="number"
                  min="0"
                  step="1"
                  :label="t('downloading.settings.uploadLimit')"
                  :suffix="t('downloading.settings.kilobytesPerSecond')"
                  :rules="[validateLimit]"
                  prepend-inner-icon="mdi-upload-outline"
                />
              </VCol>
              <VCol v-if="supportsSeedingPolicy" cols="12" sm="6">
                <VTextField
                  v-model.number="form.ratio_limit"
                  type="number"
                  step="0.1"
                  :label="t('downloading.settings.ratioLimit')"
                  :rules="[validateNumber]"
                  prepend-inner-icon="mdi-chart-donut"
                />
              </VCol>
              <VCol v-if="supportsSeedingPolicy" cols="12" sm="6">
                <VTextField
                  v-model.number="form.seeding_time_limit"
                  type="number"
                  step="1"
                  :label="t('downloading.settings.seedingTimeLimit')"
                  :suffix="t('downloading.settings.minutes')"
                  :rules="[validateInteger]"
                  prepend-inner-icon="mdi-timer-outline"
                />
              </VCol>
            </VRow>
          </section>

          <section class="download-task-settings-dialog__section">
            <div class="download-task-settings-dialog__section-title">
              {{ t('downloading.settings.locationAndCategory') }}
            </div>
            <VRow>
              <VCol cols="12" :sm="supportsCategory ? 8 : 12">
                <VTextField
                  v-model="form.save_path"
                  :label="t('downloading.settings.savePath')"
                  prepend-inner-icon="mdi-folder-move-outline"
                />
              </VCol>
              <VCol v-if="supportsCategory" cols="12" sm="4">
                <VTextField
                  v-model="form.category"
                  :label="t('downloading.settings.category')"
                  prepend-inner-icon="mdi-shape-outline"
                />
              </VCol>
            </VRow>
          </section>

          <section class="download-task-settings-dialog__section">
            <div class="download-task-settings-dialog__section-title">
              {{ t('downloading.settings.tagsAndTrackers') }}
            </div>
            <VRow>
              <VCol cols="12">
                <VCombobox
                  v-model="form.tags"
                  multiple
                  chips
                  closable-chips
                  clearable
                  :label="t('downloading.settings.addTags')"
                  prepend-inner-icon="mdi-tag-plus-outline"
                />
              </VCol>
              <VCol v-if="supportsTrackers" cols="12">
                <VTextarea
                  v-model="form.trackers"
                  rows="3"
                  auto-grow
                  :label="t('downloading.settings.trackers')"
                  :placeholder="t('downloading.settings.trackersPlaceholder')"
                  :rules="[validateTrackers]"
                  prepend-inner-icon="mdi-access-point-network"
                />
              </VCol>
            </VRow>
          </section>
        </VForm>

        <VAlert
          v-if="results.length"
          class="download-task-settings-dialog__results"
          :type="results.every(item => item.success) ? 'success' : 'warning'"
          variant="tonal"
          density="compact"
        >
          <div v-for="item in results" :key="item.operation" class="download-task-settings-dialog__result">
            <VIcon :icon="item.success ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'" size="18" />
            <span>{{ item.message }}</span>
          </div>
        </VAlert>
      </VCardText>

      <VDivider />
      <VCardActions class="app-dialog-actions">
        <VBtn variant="text" :disabled="saving" @click="visible = false">{{ t('common.cancel') }}</VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          prepend-icon="mdi-content-save-outline"
          :loading="saving"
          :disabled="!hasChanges || !task.hash"
          @click="saveSettings"
        >
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.download-task-settings-dialog__header {
  padding-inline-end: 4rem !important;
}

.download-task-settings-dialog__content {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem !important;
}

.download-task-settings-dialog__section + .download-task-settings-dialog__section {
  margin-block-start: 0.5rem;
}

.download-task-settings-dialog__section-title {
  margin-block-end: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.875rem;
  font-weight: 650;
}

.download-task-settings-dialog__results {
  border-radius: var(--app-control-radius);
}

.download-task-settings-dialog__result {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.download-task-settings-dialog__result + .download-task-settings-dialog__result {
  margin-block-start: 0.4rem;
}

@media (width <= 600px) {
  .download-task-settings-dialog__content {
    padding: 1rem !important;
  }
}
</style>
