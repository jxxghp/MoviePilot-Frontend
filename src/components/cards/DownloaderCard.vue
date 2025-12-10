<script setup lang="ts">
import api from '@/api'
import { formatFileSize } from '@/@core/utils/formatters'
import { DownloaderConf } from '@/api/types'
import { useToast } from 'vue-toastification'
import type { DownloaderInfo } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { cloneDeep } from 'lodash-es'
import { useI18n } from 'vue-i18n'
import { downloaderDict, storageAttributes } from '@/api/constants'
import { useDisplay } from 'vuetify'
import { useBackgroundOptimization } from '@/composables/useBackgroundOptimization'

// 显示器宽度
const display = useDisplay()

// 获取i18n实例
const { t } = useI18n()
const { useConditionalDataRefresh } = useBackgroundOptimization()

// 定义输入
const props = defineProps({
  // 单个下载器
  downloader: {
    type: Object as PropType<DownloaderConf>,
    required: true,
  },
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
  // 所有下载器
  downloaders: {
    type: Array as PropType<DownloaderConf[]>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'done', 'change'])

// 提示框
const $toast = useToast()

// 上传速率
const upload_rate = ref(0)

// 下载速度
const download_rate = ref(0)

// 下载器详情弹窗
const downloaderInfoDialog = ref(false)

// 表单
const downloaderForm = ref()

// 路径前缀选项
const prefixOptions = computed(() => {
  return storageAttributes.map(item => ({
    title: t(`storage.${item.type}`),
    value: item.type,
  }))
})

function getStorageType(path: string) {
  if (!path) return 'local'
  // 查找匹配的存储类型
  const storage = storageAttributes.find(s => s.type !== 'local' && path.startsWith(`${s.type}:`))
  return storage?.type || 'local'
}

function storage2Prefix(storage: string) {
  return storage === 'local' ? '' : storage + ':'
}

// 获取存储路径前后缀
function parseStoragePath(path: string): [prefix: string, suffix: string] {
  if (!path) return ['', '']
  const storage = getStorageType(path)
  const prefix = storage2Prefix(storage)
  return [prefix, path.slice(prefix.length)]
}

// 更新存储路径前缀
function updateStoragePrefix(row: PathMappingRow, storage: string) {
  const [, currentSuffix] = parseStoragePath(row.storage)
  const prefix = storage2Prefix(storage)
  row.storage = prefix + currentSuffix
}

// 更新存储路径后缀
function updateStorageSuffix(row: PathMappingRow, suffix: string) {
  const [currentPrefix] = parseStoragePath(row.storage)
  row.storage = currentPrefix + suffix
}

const pathValidationRules = [
  (v: string) => !!v || t('downloader.pathMappingRequired'),
  (v: string) => v.startsWith('/') || t('downloader.pathMappingError'),
]

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

// 生成随机ID
function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

// 下载器是否应该刷新数据的计算属性
const shouldRefresh = computed(() => props.allowRefresh && props.downloader.enabled)

// 调用API查询下载器数据
async function loadDownloaderInfo() {
  if (!shouldRefresh.value) {
    // 当下载器被禁用时，重置速率数据
    upload_rate.value = 0
    download_rate.value = 0
    return
  }
  try {
    const res: DownloaderInfo = await api.get('dashboard/downloader', {
      params: {
        name: props.downloader.name,
      },
    })

    if (res) {
      upload_rate.value = res.upload_speed
      download_rate.value = res.download_speed
    }
  } catch (e) {
    console.log(e)
  }
}

// 打开详情弹窗
function openDownloaderInfoDialog() {
  // 深复制
  downloaderInfo.value = cloneDeep(props.downloader)
  // 初始化路径映射行数据
  pathMappingRows.value = (downloaderInfo.value.path_mapping || []).map(item => ({
    id: generateId(),
    storage: item[0],
    download: item[1],
  }))
  downloaderInfoDialog.value = true
}

// 保存详情数据
async function saveDownloaderInfo() {
  // 表单校验
  const { valid } = await downloaderForm.value?.validate()
  if (!valid) return

  // 同步路径映射数据
  downloaderInfo.value.path_mapping = pathMappingRows.value.map(row => [row.storage, row.download])

  // 为空不保存，跳出警告框
  if (!downloaderInfo.value.name) {
    $toast.error(t('downloader.nameRequired'))
    return
  }
  // 重名判断
  if (props.downloaders.some(item => item.name === downloaderInfo.value.name && item !== props.downloader)) {
    $toast.error(t('downloader.nameDuplicate'))
    return
  }
  // 默认下载器去重
  if (downloaderInfo.value.default) {
    props.downloaders.forEach(item => {
      if (item.default && item !== props.downloader) {
        item.default = false
        $toast.info(t('downloader.defaultChanged'))
      }
    })
  }
  // 执行保存
  downloaderInfoDialog.value = false
  emit('change', downloaderInfo.value, props.downloader.name)
  emit('done')
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.downloader.type) {
    case 'qbittorrent':
      return getLogoUrl('qbittorrent')
    case 'transmission':
      return getLogoUrl('transmission')
    default:
      return getLogoUrl('downloader')
  }
})

// 添加路径映射
function addPathMapping() {
  pathMappingRows.value.push({
    id: generateId(),
    storage: '',
    download: '',
  })
}

// 移除路径映射
function removePathMapping(index: number) {
  pathMappingRows.value.splice(index, 1)
}

// 按钮点击
function onClose() {
  emit('close')
}

// 使用条件性数据刷新定时器（只在下载器启用时运行）
const { stop: stopRefresh } = useConditionalDataRefresh(
  `downloader-${props.downloader.name}`,
  loadDownloaderInfo,
  shouldRefresh, // 响应式条件：只有当allowRefresh为true且downloader启用时才运行
  3000, // 3秒间隔
  true, // 立即执行一次
)

onUnmounted(() => {
  stopRefresh()
})
</script>

<template>
  <div>
    <VHover v-slot="hover">
      <VCard
        v-bind="hover.props"
        variant="tonal"
        @click="openDownloaderInfoDialog"
        :class="{ 'transition transform-cpu duration-300 -translate-y-1': hover.isHovering }"
      >
        <VDialogCloseBtn @click="onClose" />
        <span class="absolute top-3 right-12">
          <IconBtn>
            <VIcon class="cursor-move" icon="mdi-drag" />
          </IconBtn>
        </span>
        <VCardText class="flex justify-space-between align-center gap-4">
          <div class="align-self-start flex-1">
            <div class="flex items-center">
              <VBadge
                v-if="props.downloader.default && props.downloader.enabled"
                dot
                inline
                color="success"
                class="me-1"
              />
              <span class="text-h6">{{ downloader.name }}</span>
            </div>
            <div v-if="downloaderDict[downloader.type] && props.downloader.enabled" class="mt-1 flex flex-wrap text-sm">
              <span class="me-2">{{ `↑ ${formatFileSize(upload_rate, 1)}/s ` }}</span>
              <span>{{ `↓ ${formatFileSize(download_rate, 1)}/s` }}</span>
            </div>
            <div v-else-if="!downloaderDict[downloader.type]" class="mt-1 flex flex-wrap text-sm">
              <span class="me-2">自定义下载器</span>
            </div>
          </div>
          <div class="h-20">
            <VImg :src="getIcon" cover class="mt-8 me-3" max-width="3rem" min-width="3rem" />
          </div>
        </VCardText>
      </VCard>
    </VHover>

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

                <VCard v-for="(row, index) in pathMappingRows" :key="row.id" variant="outlined" class="my-2">
                  <VCardText class="pa-3">
                    <VRow align="center" no-gutters>
                      <VCol cols="12" class="mb-2">
                        <div class="d-flex align-center mb-1">
                          <VIcon icon="mdi-folder-outline" size="18" class="me-1 text-primary" />
                          <span class="text-caption text-medium-emphasis">{{ t('downloader.storagePath') }}</span>
                        </div>
                        <VRow no-gutters>
                          <VCol cols="12" sm="4" class="pe-2">
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
                        <VTextField
                          v-model="row.download"
                          :placeholder="'/path/to/download'"
                          density="compact"
                          variant="outlined"
                          hide-details="auto"
                          :rules="pathValidationRules"
                        />
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
        <VCardActions class="pt-3">
          <VBtn @click="saveDownloaderInfo" prepend-icon="mdi-content-save" class="px-5">
            {{ t('common.save') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
