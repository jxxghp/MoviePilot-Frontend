<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import type { Site } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import api from '@/api'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 提示框
const $toast = useToast()

// 注册事件
const emit = defineEmits(['update:modelValue', 'import-success'])

// 界面阶段枚举
enum ImportStage {
  SELECT_FILE = 'select_file', // 选择文件阶段
  PREVIEW_FILE = 'preview_file', // 文件预览阶段
  IMPORTING = 'importing', // 正在导入阶段
  IMPORT_COMPLETE = 'import_complete', // 导入完成阶段
}

// 当前阶段
const currentStage = ref<ImportStage>(ImportStage.SELECT_FILE)

// 是否拖拽中
const isDragging = ref(false)

// 导入的文件数据
const importData = ref<Site[]>([])

// 导入进度
const importProgress = ref(0)

// 预览数据
const previewData = ref<Site[]>([])

// 选中的文件
const selectedFile = ref<File | null>(null)

// 导入错误信息
const importErrors = ref<Array<{ site: Site; error: string }>>([])

// 导入成功的站点
const importSuccesses = ref<Site[]>([])

// 是否显示错误详情
const showErrorDetails = ref(false)

// 处理拖拽事件
function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false

  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    const file = files[0]
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      selectedFile.value = file
      await processFile(file)
    } else {
      $toast.error(t('site.messages.invalidFileType'))
    }
  }
}

// 处理文件
async function processFile(file: File) {
  try {
    const text = await file.text()
    const data = JSON.parse(text)

    if (Array.isArray(data)) {
      importData.value = data
      previewData.value = data.slice(0, 5) // 只显示前5个站点作为预览
      currentStage.value = ImportStage.PREVIEW_FILE
    } else {
      $toast.error(t('site.messages.invalidFileFormat'))
    }
  } catch (error) {
    console.error('Parse file error:', error)
    $toast.error(t('site.messages.parseFileError'))
  }
}

// 验证站点数据
function validateSiteData(site: any): boolean {
  const requiredFields = ['name', 'domain', 'url']
  return requiredFields.every(field => site[field])
}

// 批量导入站点
async function importSites() {
  if (importData.value.length === 0) {
    $toast.error(t('site.messages.noDataToImport'))
    return
  }

  // 验证数据
  const validSites = importData.value.filter(validateSiteData)
  if (validSites.length === 0) {
    $toast.error(t('site.messages.noValidData'))
    return
  }

  if (validSites.length !== importData.value.length) {
    $toast.warning(t('site.messages.someInvalidData', { valid: validSites.length, total: importData.value.length }))
  }

  // 进入导入阶段
  currentStage.value = ImportStage.IMPORTING
  startNProgress()
  importProgress.value = 0

  try {
    let successCount = 0
    let failCount = 0
    importErrors.value = [] // 清空之前的错误信息
    importSuccesses.value = [] // 清空之前的成功信息

    for (let i = 0; i < validSites.length; i++) {
      const site = validSites[i]
      try {
        // 移除id字段，避免冲突
        const { id, ...siteData } = site
        const result: { success: boolean; message?: string } = await api.post('site/', siteData)
        if (result.success) {
          // 记录成功的站点
          successCount++
          importSuccesses.value.push(site)
        } else {
          failCount++
          // 记录失败信息
          importErrors.value.push({
            site,
            error: result.message || t('site.messages.importFailed'),
          })
        }
      } catch (error) {
        console.error(`Import site ${site.name} failed:`, error)
        failCount++
        // 记录错误信息
        importErrors.value.push({
          site,
          error: error instanceof Error ? error.message : t('site.messages.importFailed'),
        })
      }
      // 更新进度
      importProgress.value = Math.round(((i + 1) / validSites.length) * 100)
    }

    // 进入完成阶段
    currentStage.value = ImportStage.IMPORT_COMPLETE

    // 显示导入结果
    if (failCount === 0 && successCount > 0) {
      // 全部成功，直接关闭对话框
      $toast.success(t('site.messages.importSuccess', { count: successCount }))
      closeDialog(true)
    } else if (successCount === 0 && failCount > 0) {
      // 全部失败的情况
      $toast.error(t('site.messages.importAllFailed', { count: failCount }))
      showErrorDetails.value = true
    } else {
      // 部分成功部分失败的情况
      $toast.error(t('site.messages.importPartialFailed', { success: successCount, failed: failCount }))
      showErrorDetails.value = true
    }
  } catch (error) {
    console.error('Import sites failed:', error)
    $toast.error(t('site.messages.importFailed'))
    // 出错时回到预览阶段
    currentStage.value = ImportStage.PREVIEW_FILE
  } finally {
    doneNProgress()
  }
}

// 重置到文件选择阶段
function resetToFileSelection() {
  currentStage.value = ImportStage.SELECT_FILE
  importData.value = []
  previewData.value = []
  importProgress.value = 0
  isDragging.value = false
  selectedFile.value = null
  importErrors.value = []
  importSuccesses.value = []
  showErrorDetails.value = false
}

// 关闭对话框
function closeDialog(success: boolean = false) {
  if (success) {
    emit('import-success')
  }
  emit('update:modelValue', false)
}

// 监听文件选择
watch(selectedFile, async newFile => {
  if (newFile) {
    await processFile(newFile)
  }
})
</script>

<template>
  <VDialog scrollable max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-upload" class="me-2" />
        </template>
        <VCardTitle>{{ t('site.actions.import') }}</VCardTitle>
        <VCardSubtitle>{{ t('site.hints.import') }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="closeDialog" />
      <VDivider />
      <VCardText>
        <!-- 阶段1：选择文件阶段 -->
        <div v-if="currentStage === ImportStage.SELECT_FILE" class="upload-area">
          <div
            class="upload-zone app-surface-shape"
            :class="{ 'dragging': isDragging }"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
          >
            <VFileInput
              v-model="selectedFile"
              accept=".json"
              :label="t('site.fields.selectFile')"
              :hint="t('site.hints.selectFile')"
              persistent-hint
              prepend-icon="mdi-file-upload"
            />
            <div class="text-center mt-4">
              <VIcon icon="mdi-cloud-upload" size="48" color="primary" />
              <p class="text-body-1 mt-2">{{ t('site.hints.dragDropFile') }}</p>
              <p class="text-caption text-medium-emphasis">{{ t('site.hints.supportedFormat') }}</p>
            </div>
          </div>
        </div>

        <!-- 阶段2：文件预览阶段 -->
        <div v-if="currentStage === ImportStage.PREVIEW_FILE" class="preview-area">
          <VAlert
            type="info"
            variant="tonal"
            class="mb-4"
            :text="t('site.messages.previewData', { count: importData.length })"
          />

          <!-- 预览列表 -->
          <VCard variant="outlined" class="mb-4">
            <VCardTitle class="text-subtitle-1">
              {{ t('site.preview.title') }} ({{
                t('site.preview.showing', { count: previewData.length, total: importData.length })
              }})
            </VCardTitle>
            <VCardText>
              <VList>
                <VListItem
                  v-for="(site, index) in previewData"
                  :key="index"
                  :class="{ 'border-error': !validateSiteData(site) }"
                >
                  <template #prepend>
                    <VIcon
                      :icon="validateSiteData(site) ? 'mdi-check-circle' : 'mdi-alert-circle'"
                      :color="validateSiteData(site) ? 'success' : 'error'"
                    />
                  </template>
                  <VListItemTitle>{{ site.name || t('site.preview.unnamed') }}</VListItemTitle>
                  <VListItemSubtitle>{{ site.url || t('site.preview.noUrl') }}</VListItemSubtitle>
                  <template #append>
                    <VChip v-if="!validateSiteData(site)" size="small" color="error" variant="tonal">
                      {{ t('site.preview.invalid') }}
                    </VChip>
                  </template>
                </VListItem>
              </VList>
            </VCardText>
          </VCard>

          <!-- 操作按钮 -->
          <div class="d-flex justify-end gap-2">
            <VBtn variant="text" @click="resetToFileSelection">
              {{ t('common.reset') }}
            </VBtn>
            <VBtn color="primary" @click="importSites" :disabled="importData.length === 0">
              {{ t('site.actions.startImport') }}
            </VBtn>
          </div>
        </div>

        <!-- 阶段3：正在导入阶段 -->
        <div v-if="currentStage === ImportStage.IMPORTING" class="importing-area">
          <VAlert
            type="info"
            variant="tonal"
            class="mb-4"
            :text="t('site.messages.importing', { progress: importProgress })"
          />

          <!-- 导入进度 -->
          <VCard variant="outlined" class="mb-4">
            <VCardTitle class="text-subtitle-1">
              {{ t('site.messages.importing', { progress: importProgress }) }}
            </VCardTitle>
            <VCardText>
              <VProgressLinear v-model="importProgress" color="primary" height="8" rounded class="mb-2" />
              <p class="text-caption text-center">{{ importProgress }}%</p>
            </VCardText>
          </VCard>
        </div>

        <!-- 阶段4：导入完成阶段 -->
        <div v-if="currentStage === ImportStage.IMPORT_COMPLETE" class="result-area">
          <!-- 成功导入的站点 -->
          <div v-if="importSuccesses.length > 0" class="success-sites mb-4">
            <VAlert
              type="success"
              variant="tonal"
              class="mb-4"
              :text="t('site.messages.importSuccess', { count: importSuccesses.length })"
            />
          </div>

          <!-- 错误详情 -->
          <div v-if="showErrorDetails && importErrors.length > 0" class="error-details">
            <VAlert
              type="error"
              variant="tonal"
              class="mb-4"
              :text="t('site.messages.importErrors', { count: importErrors.length })"
            />

            <VCard variant="outlined" class="mb-4">
              <VCardTitle class="text-subtitle-1 d-flex align-center justify-space-between">
                {{ t('site.errors.title') }}
              </VCardTitle>
              <!-- 错误信息详情 -->
              <VExpansionPanels class="mt-4">
                <VExpansionPanel v-for="(error, index) in importErrors" :key="index">
                  <VExpansionPanelTitle>
                    {{ error.site.name || t('site.preview.unnamed') }} - {{ t('site.errors.details') }}
                  </VExpansionPanelTitle>
                  <VExpansionPanelText>
                    <VAlert type="error" variant="text" :text="error.error" class="mb-0" />
                  </VExpansionPanelText>
                </VExpansionPanel>
              </VExpansionPanels>
            </VCard>
          </div>

          <!-- 操作按钮 -->
          <div class="d-flex justify-end gap-2">
            <VBtn variant="text" @click="resetToFileSelection">
              {{ t('common.reset') }}
            </VBtn>
            <VBtn color="primary" @click="closeDialog(false)">
              {{ t('common.close') }}
            </VBtn>
          </div>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.upload-area {
  padding: 2rem;
}

.upload-zone {
  padding: 2rem;
  border: 2px dashed #ccc;
  text-align: center;
  transition: all 0.3s ease;
}

.upload-zone.dragging {
  border-color: rgb(var(--v-theme-primary));
  background-color: rgba(var(--v-theme-primary), 0.05);
}

.error-details {
  margin-block: 1rem;
  margin-inline: 0;
}

.error-details .v-expansion-panels {
  background: transparent;
}

.border-success {
  border-inline-start: 4px solid rgb(var(--v-theme-success));
}

.border-error {
  border-inline-start: 4px solid rgb(var(--v-theme-error));
}
</style>
