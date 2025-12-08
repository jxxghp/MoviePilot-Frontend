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

// 路径校验规则
const remotePathRules = [
  (v: string) => !!v || t('downloader.pathMappingRequired'),
  (v: string) => {
    const prefixes = storageAttributes.map(s => (s.type === 'local' ? '/' : `${s.type}:/`))
    const pattern = new RegExp(`^(${prefixes.join('|')})`)
    return pattern.test(v) || t('downloader.pathMappingFormatError')
  },
]

const localPathRules = [
  (v: string) => !!v || t('downloader.pathMappingRequired'),
  (v: string) => v.startsWith('/') || t('downloader.pathMappingLocalError'),
]

// 下载器详情
const downloaderInfo = ref<DownloaderConf>({
  name: '',
  type: '',
  default: false,
  enabled: false,
  config: {},
})

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
  downloaderInfoDialog.value = true
}

// 保存详情数据
async function saveDownloaderInfo() {
  // 表单校验
  const { valid } = await downloaderForm.value?.validate()
  if (!valid) return

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
  if (!downloaderInfo.value.path_mapping) {
    downloaderInfo.value.path_mapping = []
  }
  downloaderInfo.value.path_mapping.push(['', ''])
}

// 移除路径映射
function removePathMapping(index: number) {
  downloaderInfo.value.path_mapping?.splice(index, 1)
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

<style scoped lang="scss">
  .path-icon {
    line-height: 40px;
    height: 40px;
  }
  .path-input {
    flex: 0 0 100%;
  }
  @media (min-width: 960px) {
    .path-input {
      flex: 1 1 auto;
      max-width: 50%;
    }
  }
</style>
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
                <VLabel class="mb-2">{{ t('downloader.pathMapping') }}</VLabel>
                <div
                  v-for="(mapping, index) in downloaderInfo.path_mapping"
                  :key="index"
                  class="d-flex gap-2 mb-2 align-start flex-wrap"
                >
                  <VTextField
                    v-model="mapping[0]"
                    placeholder="/remote/path"
                    density="compact"
                    hide-details="auto"
                    :rules="remotePathRules"
                    :appendIcon="'mdi-arrow-right'"
                    class="path-input"
                  />
                  <VTextField
                    v-model="mapping[1]"
                    placeholder="/download/path"
                    density="compact"
                    hide-details="auto"
                    :rules="localPathRules"
                    :appendIcon="'mdi-close'"
                    @click:append="removePathMapping(index)"
                  />
                </div>
                <div>
                  <VBtn variant="tonal" size="small" prepend-icon="mdi-plus" @click="addPathMapping">
                    {{ t('common.add') }}
                  </VBtn>
                </div>
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
