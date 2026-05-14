<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import api from '@/api'
import type { Plugin } from '@/api/types'
import { isNullOrEmptyObject } from '@core/utils'
import { getLogoUrl } from '@/utils/imageUtils'
import { getDominantColor } from '@/@core/utils/image'
import { formatDownloadCount } from '@/@core/utils/formatters'
import VersionHistory from '@/components/misc/VersionHistory.vue'
import ProgressDialog from '../dialog/ProgressDialog.vue'
import PluginConfigDialog from '../dialog/PluginConfigDialog.vue'
import PluginDataDialog from '../dialog/PluginDataDialog.vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 插件日志面板只有点击“查看日志”时才需要，延后加载可减轻插件列表首屏。
const LoggingView = defineAsyncComponent(() => import('@/views/system/LoggingView.vue'))

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  count: Number, // 下载次数
  action: Boolean, // 动作标识
  width: String,
  height: String,
  sortable: {
    type: Boolean,
    default: false,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save', 'actionDone'])

// 多语言
const { t } = useI18n()

// 背景颜色
const backgroundColor = ref('#28A9E1')

// 图片对象
const imageRef = ref<any>()

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 本身是否可见
const isVisible = ref(true)

// 插件配置页面
const pluginConfigDialog = ref(false)

// 菜单显示状态
const menuVisible = ref(false)

// 进度框
const progressDialog = ref(false)

// 插件数据页面
const pluginInfoDialog = ref(false)

// 实时日志弹窗
const loggingDialog = ref(false)

// 进度框文本
const progressText = ref('正在更新插件...')

// 用户头像是否加载完成
const isAvatarLoaded = ref(false)

// 图片是否加载完成
const isImageLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

// 更新日志弹窗
const releaseDialog = ref(false)

// 插件分身对话框
const pluginCloneDialog = ref(false)

// 插件分身表单
const cloneForm = ref({
  suffix: '',
  name: '',
  description: '',
  version: '',
  icon: '',
})

// 监听动作标识，如为true则打开详情
watch(
  () => props.action,
  (newAction, oldAction) => {
    if (newAction && !oldAction) {
      openPluginDetail()
      emit('actionDone')
    }
  },
)

// 图片加载完成
async function imageLoaded() {
  isImageLoaded.value = true
  const imageElement = imageRef.value?.$el.querySelector('img') as HTMLImageElement
  // 从图片中提取背景色
  backgroundColor.value = await getDominantColor(imageElement)
}

// 显示更新日志
function showUpdateHistory() {
  // 检查当前版本是否有更新日志
  if (isNullOrEmptyObject(props.plugin?.history)) {
    updatePlugin()
  } else {
    releaseDialog.value = true
  }
}

// 调用API卸载插件
async function uninstallPlugin() {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('plugin.confirmUninstall', { name: props.plugin?.plugin_name }),
  })

  if (!isConfirmed) return

  try {
    // 显示等待提示框
    progressDialog.value = true
    progressText.value = t('plugin.uninstalling', { name: props.plugin?.plugin_name })
    const result: { [key: string]: any } = await api.delete(`plugin/${props.plugin?.id}`)
    // 隐藏等待提示框
    progressDialog.value = false
    if (result.success) {
      $toast.success(t('plugin.uninstallSuccess', { name: props.plugin?.plugin_name }))

      // 通知父组件刷新
      emit('remove')
    } else {
      $toast.error(
        t('plugin.uninstallFailed', {
          name: props.plugin?.plugin_name,
          message: result.message,
        }),
      )
    }
  } catch (error) {
    console.error(error)
  }
}

// 显示插件数据
async function showPluginInfo() {
  pluginConfigDialog.value = false
  pluginInfoDialog.value = true
}

// 显示插件配置
async function showPluginConfig() {
  // 显示对话框
  pluginInfoDialog.value = false
  pluginConfigDialog.value = true
}

// 计算图标路径
const iconPath: Ref<string> = computed(() => {
  if (imageLoadError.value) return getLogoUrl('plugin')
  // 如果是网络图片则使用代理后返回
  if (props.plugin?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(
      props.plugin?.plugin_icon,
    )}&cache=true`

  return `./plugin_icon/${props.plugin?.plugin_icon}`
})

// 插件作者头像路径
const authorPath: Ref<string> = computed(() => {
  // 网络图片则使用代理后返回
  return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(
    props.plugin?.author_url + '.png',
  )}&cache=true`
})

// 重置插件
async function resetPlugin() {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('plugin.confirmReset', { name: props.plugin?.plugin_name }),
  })

  if (!isConfirmed) return

  try {
    const result: { [key: string]: any } = await api.get(`plugin/reset/${props.plugin?.id}`)
    if (result.success) {
      $toast.success(t('plugin.resetSuccess', { name: props.plugin?.plugin_name }))
      // 通知父组件刷新
      emit('save')
    } else {
      $toast.error(
        t('plugin.resetFailed', {
          name: props.plugin?.plugin_name,
          message: result.message,
        }),
      )
    }
  } catch (error) {
    console.error(error)
  }
}

// 更新插件
async function updatePlugin() {
  try {
    releaseDialog.value = false
    // 显示等待提示框
    progressDialog.value = true
    progressText.value = t('plugin.updating', { name: props.plugin?.plugin_name })

    const result: { [key: string]: any } = await api.get(`plugin/install/${props.plugin?.id}`, {
      params: {
        repo_url: props.plugin?.repo_url,
        force: true,
      },
    })

    // 隐藏等待提示框
    progressDialog.value = false

    if (result.success) {
      $toast.success(t('plugin.updateSuccess', { name: props.plugin?.plugin_name }))

      // 通知父组件刷新
      emit('save')
    } else {
      $toast.error(
        t('plugin.updateFailed', {
          name: props.plugin?.plugin_name,
          message: result.message,
        }),
      )
    }
  } catch (error) {
    console.error(error)
  }
}

// 访问作者主页
function visitAuthorPage() {
  window.open(props.plugin?.author_url, '_blank')
}

// 查看日志URL
function openLoggerWindow() {
  const url = `${
    import.meta.env.VITE_API_BASE_URL
  }system/logging?length=-1&logfile=plugins/${props.plugin?.id?.toLowerCase()}.log`
  window.open(url, '_blank')
}

// 打开插件详情
function openPluginDetail() {
  if (props.plugin?.has_page) showPluginInfo()
  else showPluginConfig()
}

function handleCardClick() {
  if (props.sortable) {
    return
  }

  openPluginDetail()
}

// 配置完成
function configDone() {
  pluginConfigDialog.value = false
  emit('save')
}

// 显示插件分身对话框
function showPluginClone() {
  cloneForm.value = {
    suffix: '',
    name: t('plugin.cloneDefaultName', { name: props.plugin?.plugin_name }),
    description: t('plugin.cloneDefaultDescription', { description: props.plugin?.plugin_desc }),
    version: props.plugin?.plugin_version || '1.0',
    icon: props.plugin?.plugin_icon || '',
  }
  pluginCloneDialog.value = true
}

// 执行插件分身
async function executePluginClone() {
  if (!cloneForm.value.suffix.trim()) {
    $toast.error(t('plugin.suffixRequired'))
    return
  }

  try {
    progressDialog.value = true
    progressText.value = t('plugin.cloning', { name: props.plugin?.plugin_name })

    const result: { [key: string]: any } = await api.post(`plugin/clone/${props.plugin?.id}`, {
      suffix: cloneForm.value.suffix.trim(),
      name: cloneForm.value.name.trim(),
      description: cloneForm.value.description.trim(),
      version: cloneForm.value.version.trim(),
      icon: cloneForm.value.icon.trim(),
    })

    progressDialog.value = false

    if (result.success) {
      $toast.success(t('plugin.cloneSuccess', { name: cloneForm.value.name }))
      pluginCloneDialog.value = false
      // 通知父组件刷新
      emit('remove')
    } else {
      $toast.error(t('plugin.cloneFailed', { message: result.message }))
    }
  } catch (error) {
    progressDialog.value = false
    $toast.error(t('plugin.cloneFailedGeneral'))
    console.error(error)
  }
}

// 弹出菜单
const dropdownItems = ref([
  {
    title: t('plugin.viewData'),
    value: 1,
    show: props.plugin?.has_page,
    props: {
      prependIcon: 'mdi-information-outline',
      click: showPluginInfo,
    },
  },
  {
    title: t('plugin.settings'),
    value: 2,
    show: true,
    props: {
      prependIcon: 'mdi-cog-outline',
      click: showPluginConfig,
    },
  },
  {
    title: t('plugin.clone'),
    value: 8,
    show: true,
    props: {
      prependIcon: 'mdi-content-copy',
      color: 'info',
      click: showPluginClone,
    },
  },
  {
    title: t('plugin.update'),
    value: 3,
    show: props.plugin?.has_update,
    props: {
      prependIcon: 'mdi-arrow-up-circle-outline',
      color: 'success',
      click: showUpdateHistory,
    },
  },
  {
    title: t('plugin.reset'),
    value: 4,
    show: true,
    props: {
      prependIcon: 'mdi-cancel',
      color: 'warning',
      click: resetPlugin,
    },
  },
  {
    title: t('plugin.uninstall'),
    value: 5,
    show: true,
    props: {
      prependIcon: 'mdi-trash-can-outline',
      color: 'error',
      click: uninstallPlugin,
    },
  },
  {
    title: t('plugin.viewLogs'),
    value: 6,
    show: true,
    props: {
      prependIcon: 'mdi-file-document-outline',
      click: () => {
        loggingDialog.value = true
      },
    },
  },
  {
    title: t('plugin.authorHome'),
    value: 7,
    show: true,
    props: {
      prependIcon: 'mdi-home-circle-outline',
      click: visitAuthorPage,
    },
  },
])

// 监听插件状态变化
watch(
  () => props.plugin?.has_update,
  (newHasUpdate, _) => {
    const updateItemIndex = dropdownItems.value.findIndex(item => item.value === 3)
    if (updateItemIndex !== -1) dropdownItems.value[updateItemIndex].show = newHasUpdate
  },
)

// 监听插件窗口状态变化
watch(
  () => props.plugin?.page_open,
  (newOpenState, _) => {
    if (newOpenState) openPluginDetail()
  },
  { immediate: true },
)
</script>

<template>
  <div class="h-full">
    <!-- 插件卡片 -->
    <VHover>
      <template #default="hover">
        <VCard
          v-if="isVisible"
          v-bind="hover.props"
          :width="props.width"
          :height="props.height"
          @click="handleCardClick"
          class="flex flex-col h-full"
          :class="{
            'transition transform-cpu duration-300 -translate-y-1': hover.isHovering && !props.sortable,
            'cursor-move': props.sortable,
          }"
          :ripple="!props.sortable"
        >
          <div
            class="flex-grow"
            :style="`background: linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.5) 100%), linear-gradient(${backgroundColor} 0%, ${backgroundColor} 100%)`"
          >
            <VCardText class="px-2 pt-2 pb-0">
              <VCardTitle
                class="text-white px-2 pb-0 text-lg text-shadow whitespace-nowrap overflow-hidden text-ellipsis"
              >
                <VBadge dot inline :color="props.plugin?.state ? 'success' : 'secondary'" />
                {{ props.plugin?.plugin_name }}
                <span class="text-sm mt-1 text-gray-200"> v{{ props.plugin?.plugin_version }} </span>
              </VCardTitle>
            </VCardText>
            <div class="relative flex flex-row items-start px-2 justify-between grow">
              <div class="relative flex-1 min-w-0">
                <div class="px-2 py-1 text-white text-sm text-shadow overflow-hidden line-clamp-3 ...">
                  {{ props.plugin?.plugin_desc }}
                </div>
              </div>
              <div class="relative flex-shrink-0 self-center pb-3" :class="{ 'cursor-move': props.sortable && display.mdAndUp.value }">
                <VAvatar size="48">
                  <VImg
                    ref="imageRef"
                    :src="iconPath"
                    aspect-ratio="4/3"
                    cover
                    @load="imageLoaded"
                    @error="imageLoadError = true"
                  />
                </VAvatar>
              </div>
            </div>
          </div>
          <VCardText
            class="flex flex-col align-self-baseline justify-between px-2 py-2 w-full overflow-hidden max-h-10 min-h-10"
          >
            <div class="flex flex-nowrap items-center w-full pe-10">
              <div class="flex flex-nowrap max-w-40 items-center align-middle">
                <VImg :src="authorPath" class="author-avatar" @load="isAvatarLoaded = true">
                  <template #default>
                    <VIcon v-if="!isAvatarLoaded" size="small" icon="mdi-github" class="me-1" />
                  </template>
                </VImg>
                <span v-if="props.sortable" class="overflow-hidden text-ellipsis whitespace-nowrap">
                  {{ props.plugin?.plugin_author }}
                </span>
                <a
                  v-else
                  :href="props.plugin?.author_url"
                  target="_blank"
                  @click.stop
                  class="overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {{ props.plugin?.plugin_author }}
                </a>
              </div>
              <span v-if="props.count" class="ms-2 flex-shrink-0 download-count items-center align-middle">
                <VIcon size="small" icon="mdi-download" />
                <span class="text-sm">{{ formatDownloadCount(props.count) }}</span>
              </span>
            </div>
            <div v-if="!props.sortable" class="absolute bottom-0 right-0">
              <IconBtn>
                <VIcon icon="mdi-dots-vertical" />
                <VMenu v-model="menuVisible" activator="parent" close-on-content-click>
                  <VList>
                    <VListItem
                      v-for="(item, i) in dropdownItems"
                      v-show="item.show"
                      :key="i"
                      :base-color="item.props.color"
                      @click="item.props.click"
                    >
                      <template #prepend>
                        <VIcon :icon="item.props.prependIcon" />
                      </template>
                      <VListItemTitle v-text="item.title" />
                    </VListItem>
                  </VList>
                </VMenu>
              </IconBtn>
            </div>
          </VCardText>
          <div v-if="props.plugin?.has_update" class="me-n3 absolute top-0 right-5">
            <VIcon icon="mdi-new-box" class="text-white" />
          </div>
        </VCard>
      </template>
    </VHover>

    <!-- 插件配置页面 -->
    <PluginConfigDialog
      v-if="pluginConfigDialog"
      v-model="pluginConfigDialog"
      :plugin="props.plugin"
      @save="configDone"
      @close="pluginConfigDialog = false"
      @switch="showPluginInfo"
    />

    <!-- 插件数据页面 -->
    <PluginDataDialog
      v-if="pluginInfoDialog"
      v-model="pluginInfoDialog"
      :plugin="props.plugin"
      @close="pluginInfoDialog = false"
      @switch="showPluginConfig"
    />

    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />

    <!-- 更新日志 -->
    <VDialog v-if="releaseDialog" v-model="releaseDialog" width="600" scrollable :fullscreen="!display.mdAndUp.value">
      <VCard :title="t('plugin.updateHistoryTitle', { name: props.plugin?.plugin_name })">
        <VDialogCloseBtn @click="releaseDialog = false" />
        <VDivider />
        <VersionHistory :history="props.plugin?.history" />
        <VDivider />
        <VCardItem>
          <VBtn @click="updatePlugin" block>
            <template #prepend>
              <VIcon icon="mdi-arrow-up-circle-outline" />
            </template>
            {{ t('plugin.updateToLatest') }}
          </VBtn>
        </VCardItem>
      </VCard>
    </VDialog>

    <!-- 实时日志弹窗 -->
      <VDialog
        v-if="loggingDialog"
        v-model="loggingDialog"
        scrollable
        max-width="72rem"
        :fullscreen="!display.mdAndUp.value"
      >
      <VCard>
        <VDialogCloseBtn @click="loggingDialog = false" />
        <VCardItem>
          <VCardTitle class="d-inline-flex">
            <VIcon icon="mdi-file-document" class="me-2" />
            {{ t('plugin.logTitle') }}
            <a class="mx-2 d-inline-flex align-center cursor-pointer" @click="openLoggerWindow">
              <VChip color="grey-darken-1" size="small" class="ml-2">
                <VIcon icon="mdi-open-in-new" size="small" start />
                {{ t('common.openInNewWindow') }}
              </VChip>
            </a>
          </VCardTitle>
        </VCardItem>
        <VDivider />
        <VCardText class="pa-0">
          <LoggingView :logfile="`plugins/${props.plugin?.id?.toLowerCase()}.log`" />
        </VCardText>
      </VCard>
    </VDialog>

    <!-- 插件分身对话框 -->
    <VDialog
      v-if="pluginCloneDialog"
      v-model="pluginCloneDialog"
      width="600"
      scrollable
      :fullscreen="!display.mdAndUp.value"
    >
      <VCard>
        <VCardItem class="py-2">
          <template #prepend>
            <VIcon icon="mdi-content-copy" class="me-2" />
          </template>
          <VCardTitle>{{ t('plugin.cloneTitle') }}</VCardTitle>
          <VCardSubtitle>{{ t('plugin.cloneSubtitle', { name: props.plugin?.plugin_name }) }}</VCardSubtitle>
        </VCardItem>
        <VDialogCloseBtn @click="pluginCloneDialog = false" />
        <VDivider />
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="cloneForm.suffix"
                  :label="t('plugin.suffix') + ' *'"
                  :placeholder="t('plugin.suffixPlaceholder')"
                  :hint="t('plugin.suffixHint')"
                  persistent-hint
                  :rules="[
                    v => !!v || t('plugin.suffixRequired'),
                    v => /^[a-zA-Z0-9]+$/.test(v) || t('plugin.suffixFormatError'),
                    v => v.length <= 20 || t('plugin.suffixLengthError'),
                  ]"
                  required
                  prepend-inner-icon="mdi-tag"
                />
              </VCol>

              <VCol cols="12" md="6">
                <VTextField
                  v-model="cloneForm.name"
                  :label="t('plugin.cloneName')"
                  :placeholder="t('plugin.cloneNamePlaceholder')"
                  :hint="t('plugin.cloneNameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-rename-box"
                />
              </VCol>

              <VCol cols="12">
                <VTextField
                  v-model="cloneForm.description"
                  :label="t('plugin.cloneDescriptionLabel')"
                  :placeholder="t('plugin.cloneDescriptionPlaceholder')"
                  :hint="t('plugin.cloneDescriptionHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-text"
                />
              </VCol>

              <VCol cols="12" md="6">
                <VTextField
                  v-model="cloneForm.version"
                  :label="t('plugin.cloneVersion')"
                  :placeholder="t('plugin.cloneVersionPlaceholder')"
                  :hint="t('plugin.cloneVersionHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-numeric"
                />
              </VCol>

              <VCol cols="12" md="6">
                <VTextField
                  v-model="cloneForm.icon"
                  :label="t('plugin.cloneIcon')"
                  :placeholder="t('plugin.cloneIconPlaceholder')"
                  :hint="t('plugin.cloneIconHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-image"
                />
              </VCol>

              <!-- 重要提醒 -->
              <VCol cols="12">
                <VAlert type="warning" variant="tonal" density="compact" class="mt-2" icon="mdi-alert-circle-outline">
                  <div class="text-body-2">
                    <strong>{{ t('common.notice') }}</strong
                    >：{{ t('plugin.cloneNotice') }}
                  </div>
                </VAlert>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardActions class="pt-3">
          <VSpacer />
          <VBtn
            color="primary"
            @click="executePluginClone"
            prepend-icon="mdi-content-copy"
            class="px-5"
            :disabled="!cloneForm.suffix.trim()"
          >
            {{ t('plugin.createClone') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<style lang="scss" scoped>
.card-cover-blurred::before {
  position: absolute;
  /* stylelint-disable-next-line property-no-vendor-prefix */
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  background: rgba(29, 39, 59, 48%);
  content: '';
  inset: 0;
}

.author-avatar {
  border-radius: 50%;
  block-size: 24px;
  inline-size: 24px;
  margin-inline-end: 8px;
  object-fit: cover;
}
</style>
