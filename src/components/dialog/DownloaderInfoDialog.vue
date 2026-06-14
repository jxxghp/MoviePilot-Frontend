<script setup lang="ts">
import type { DownloaderConf } from '@/api/types'
import { storageAttributes } from '@/api/constants'
import { cloneDeep } from 'lodash-es'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 获取i18n实例
const { t } = useI18n()

// 定义输入
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  downloader: {
    type: Object as PropType<DownloaderConf>,
    required: true,
  },
  downloaders: {
    type: Array as PropType<DownloaderConf[]>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'change', 'done'])

// 提示框
const $toast = useToast()

// 表单
const downloaderForm = ref()

// 下载器详情弹窗
const downloaderInfoDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 下载器详情
const downloaderInfo = ref<DownloaderConf>({
  name: '',
  type: '',
  default: false,
  enabled: false,
  config: {},
  path_mapping: [],
})

// 路径映射行定义
interface PathMappingRow {
  id: string
  storage: string
  download: string
}

// 路径映射行数据
const pathMappingRows = ref<PathMappingRow[]>([])

// 路径前缀选项
const prefixOptions = computed(() => {
  return storageAttributes.map(item => ({
    title: t(`storage.${item.type}`),
    value: item.type,
  }))
})

/** 获取路径所属的存储类型。 */
function getStorageType(path: string) {
  if (!path) return 'local'
  const storage = storageAttributes.find(s => s.type !== 'local' && path.startsWith(`${s.type}:`))
  return storage?.type || 'local'
}

/** 将存储类型转换为路径前缀。 */
function storage2Prefix(storage: string) {
  return storage === 'local' ? '' : storage + ':'
}

/** 拆分存储路径的前缀和真实路径。 */
function parseStoragePath(path: string): [prefix: string, suffix: string] {
  if (!path) return ['', '']
  const storage = getStorageType(path)
  const prefix = storage2Prefix(storage)
  return [prefix, path.slice(prefix.length)]
}

/** 更新单行路径映射的存储前缀。 */
function updateStoragePrefix(row: PathMappingRow, storage: string) {
  const [, currentSuffix] = parseStoragePath(row.storage)
  const prefix = storage2Prefix(storage)
  row.storage = prefix + currentSuffix
}

/** 更新单行路径映射的存储路径主体。 */
function updateStorageSuffix(row: PathMappingRow, suffix: string) {
  const [currentPrefix] = parseStoragePath(row.storage)
  row.storage = currentPrefix + suffix
}

const pathValidationRules = [
  (v: string) => !!v || t('downloader.pathMappingRequired'),
  (v: string) => v.startsWith('/') || t('downloader.pathMappingError'),
]

/** 生成路径映射行使用的临时唯一 ID。 */
function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

/** 初始化下载器新增配置项的兼容默认值。 */
function initializeDownloaderConfigDefaults() {
  if (!['qbittorrent', 'transmission'].includes(downloaderInfo.value.type)) return
  if (!downloaderInfo.value.config) downloaderInfo.value.config = {}
  if (downloaderInfo.value.type === 'qbittorrent' && downloaderInfo.value.config.incomplete_files_ext === undefined)
    downloaderInfo.value.config.incomplete_files_ext = true
  if (downloaderInfo.value.type === 'transmission' && downloaderInfo.value.config.rename_partial_files === undefined)
    downloaderInfo.value.config.rename_partial_files = true
}

/** 初始化下载器编辑表单数据。 */
function initializeDownloaderInfo() {
  downloaderInfo.value = cloneDeep(props.downloader)
  initializeDownloaderConfigDefaults()
  pathMappingRows.value = (downloaderInfo.value.path_mapping || []).map(item => ({
    id: generateId(),
    storage: item[0],
    download: item[1],
  }))
}

/** 保存下载器编辑结果并通知父级刷新。 */
async function saveDownloaderInfo() {
  const { valid } = (await downloaderForm.value?.validate()) || { valid: true }
  if (!valid) return

  downloaderInfo.value.path_mapping = pathMappingRows.value.map(row => [row.storage, row.download])

  if (!downloaderInfo.value.name) {
    $toast.error(t('downloader.nameRequired'))
    return
  }
  if (props.downloaders.some(item => item.name === downloaderInfo.value.name && item !== props.downloader)) {
    $toast.error(t('downloader.nameDuplicate'))
    return
  }
  if (downloaderInfo.value.default) {
    props.downloaders.forEach(item => {
      if (item.default && item !== props.downloader) {
        item.default = false
        $toast.info(t('downloader.defaultChanged'))
      }
    })
  }
  downloaderInfoDialog.value = false
  emit('change', downloaderInfo.value, props.downloader.name)
  emit('done')
}

/** 新增一行路径映射。 */
function addPathMapping() {
  pathMappingRows.value.push({
    id: generateId(),
    storage: '',
    download: '',
  })
}

/** 移除指定位置的路径映射。 */
function removePathMapping(index: number) {
  pathMappingRows.value.splice(index, 1)
}

onMounted(() => {
  initializeDownloaderInfo()
})
</script>

<template>
  <VDialog
      v-if="downloaderInfoDialog"
      v-model="downloaderInfoDialog"
      scrollable
      max-width="40rem"
      :fullscreen="!display.mdAndUp.value"
    >
      <VCard>
        <VCardItem class="py-2">
          <template #prepend>
            <VIcon icon="mdi-download" class="me-2" />
          </template>
          <VCardTitle>{{ t('common.config') }}</VCardTitle>
          <VCardSubtitle>{{ props.downloader.name }}</VCardSubtitle>
        </VCardItem>
        <VDialogCloseBtn v-model="downloaderInfoDialog" />
        <VDivider />
        <VCardText>
          <VForm ref="downloaderForm">
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch v-model="downloaderInfo.enabled" :label="t('downloader.enabled')" />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.default"
                  :label="t('downloader.default')"
                  :disabled="!downloaderInfo.enabled"
                />
              </VCol>
            </VRow>
            <VRow v-if="downloaderInfo.type == 'qbittorrent'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.name"
                  :label="t('downloader.name')"
                  :placeholder="t('downloader.nameRequired')"
                  :hint="t('downloader.name')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.host"
                  :label="t('downloader.host')"
                  placeholder="http(s)://ip:port"
                  :hint="t('downloader.host')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12">
                <VTextField
                  v-model="downloaderInfo.config.apikey"
                  type="password"
                  :label="t('downloader.apiKey')"
                  :hint="t('downloader.qbittorrentApiKeyHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-key-variant"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.username"
                  :label="t('downloader.username')"
                  :hint="t('downloader.username')"
                  :disabled="!!downloaderInfo.config.apikey"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.password"
                  type="password"
                  :label="t('downloader.password')"
                  :hint="t('downloader.password')"
                  :disabled="!!downloaderInfo.config.apikey"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-lock"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.config.category"
                  :label="t('downloader.category')"
                  :hint="t('downloader.category')"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.config.sequentail"
                  :label="t('downloader.sequentail')"
                  :hint="t('downloader.sequentail')"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.config.force_resume"
                  :label="t('downloader.force_resume')"
                  :hint="t('downloader.force_resume')"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.config.first_last_piece"
                  :label="t('downloader.first_last_piece')"
                  :hint="t('downloader.first_last_piece')"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.config.incomplete_files_ext"
                  :label="t('downloader.incomplete_files_ext')"
                  :hint="t('downloader.incomplete_files_extHint')"
                  persistent-hint
                  active
                />
              </VCol>
            </VRow>
            <VRow v-else-if="downloaderInfo.type == 'transmission'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.name"
                  :label="t('downloader.name')"
                  :placeholder="t('downloader.nameRequired')"
                  :hint="t('downloader.name')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.host"
                  :label="t('downloader.host')"
                  placeholder="http(s)://ip:port"
                  :hint="t('downloader.host')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.username"
                  :label="t('downloader.username')"
                  :hint="t('downloader.username')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.password"
                  type="password"
                  :label="t('downloader.password')"
                  :hint="t('downloader.password')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-lock"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.config.rename_partial_files"
                  :label="t('downloader.rename_partial_files')"
                  :hint="t('downloader.rename_partial_filesHint')"
                  persistent-hint
                  active
                />
              </VCol>
            </VRow>
            <VRow v-else-if="downloaderInfo.type == 'rtorrent'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.name"
                  :label="t('downloader.name')"
                  :placeholder="t('downloader.nameRequired')"
                  :hint="t('downloader.name')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.host"
                  :label="t('downloader.host')"
                  placeholder="http(s)://ip:port/RPC2"
                  :hint="t('downloader.rtorrentHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.username"
                  :label="t('downloader.username')"
                  :hint="t('downloader.username')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.password"
                  type="password"
                  :label="t('downloader.password')"
                  :hint="t('downloader.password')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-lock"
                />
              </VCol>
            </VRow>
            <VRow v-else>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.type"
                  :label="t('downloader.type')"
                  :hint="t('downloader.customTypeHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-cog"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.name"
                  :label="t('downloader.name')"
                  :hint="t('downloader.nameRequired')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12">
                <VDivider class="my-2">
                  <span class="text-body-1 font-weight-medium">{{ t('downloader.pathMapping') }}</span>
                </VDivider>

                <div v-if="pathMappingRows.length === 0" class="text-center py-2">
                  <VIcon icon="mdi-folder-network" size="48" class="text-disabled mb-1" />
                  <div class="text-body-2 text-disabled">{{ t('common.noData') }}</div>
                </div>

                <VCard
                  v-for="(row, index) in pathMappingRows"
                  :key="row.id"
                  variant="outlined"
                  class="path-mapping-card my-2"
                >
                  <VCardText class="pa-3">
                    <VRow align="center" no-gutters>
                      <VCol cols="12" class="mb-2">
                        <div class="d-flex align-center mb-1">
                          <VIcon icon="mdi-folder-outline" size="18" class="me-1 text-primary" />
                          <span class="text-caption text-medium-emphasis">{{ t('downloader.storagePath') }}</span>
                        </div>
                        <VRow no-gutters>
                          <VCol cols="12" sm="4" class="path-storage-select-col pe-sm-2">
                            <VSelect
                              :model-value="getStorageType(row.storage)"
                              :items="prefixOptions"
                              density="compact"
                              variant="outlined"
                              hide-details
                              @update:model-value="v => updateStoragePrefix(row, v)"
                            />
                          </VCol>
                          <VCol cols="12" sm="8">
                            <VTextField
                              :model-value="parseStoragePath(row.storage)[1]"
                              :placeholder="'/path/to/storage'"
                              density="compact"
                              variant="outlined"
                              hide-details="auto"
                              :rules="pathValidationRules"
                              @update:model-value="v => updateStorageSuffix(row, v)"
                            />
                          </VCol>
                        </VRow>
                      </VCol>

                      <VCol cols="12" class="mb-1">
                        <div class="d-flex align-center justify-center my-1">
                          <VIcon icon="mdi-arrow-down" size="18" class="text-medium-emphasis" />
                        </div>
                        <div class="d-flex align-center mb-1">
                          <VIcon icon="mdi-download-outline" size="18" class="me-1 text-success" />
                          <span class="text-caption text-medium-emphasis">{{ t('downloader.downloadPath') }}</span>
                        </div>
                        <VRow no-gutters>
                          <VCol cols="12" sm="4" class="d-none d-sm-block" />
                          <VCol cols="12" sm="8">
                            <VTextField
                              v-model="row.download"
                              :placeholder="'/path/to/download'"
                              density="compact"
                              variant="outlined"
                              hide-details="auto"
                              :rules="pathValidationRules"
                            />
                          </VCol>
                        </VRow>
                      </VCol>

                      <VCol cols="12" class="d-flex justify-end pt-1">
                        <IconBtn variant="text" color="error" size="small" @click="removePathMapping(index)">
                          <VIcon icon="mdi-delete-outline" />
                        </IconBtn>
                      </VCol>
                    </VRow>
                  </VCardText>
                </VCard>

                <VBtn
                  variant="tonal"
                  color="primary"
                  prepend-icon="mdi-plus-circle-outline"
                  @click="addPathMapping"
                  class="mt-1"
                  size="small"
                >
                  {{ t('common.add') }} {{ t('downloader.pathMapping') }}
                </VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardActions class="app-dialog-actions">
          <VSpacer />
          <VBtn color="primary" variant="flat" @click="saveDownloaderInfo" prepend-icon="mdi-content-save" class="px-5">
            {{ t('common.save') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
</template>

<style scoped>
.path-mapping-card {
  border-color: rgba(var(--v-border-color), 0.08) !important;
}

@media (max-width: 599.98px) {
  .path-storage-select-col {
    margin-block-end: 8px;
  }
}
</style>
