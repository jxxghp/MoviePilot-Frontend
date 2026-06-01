<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import api from '@/api'
import type { Plugin } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { getDominantColor } from '@/@core/utils/image'
import { formatDownloadCount } from '@/@core/utils/formatters'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

// 插件日志面板只有点击“查看日志”时才需要，延后加载可减轻插件列表首屏。
const PluginConfigDialog = defineAsyncComponent(() => import('../dialog/PluginConfigDialog.vue'))
const PluginDataDialog = defineAsyncComponent(() => import('../dialog/PluginDataDialog.vue'))
const ProgressDialog = defineAsyncComponent(() => import('../dialog/ProgressDialog.vue'))
const PluginCloneDialog = defineAsyncComponent(() => import('../dialog/PluginCloneDialog.vue'))
const PluginLogDialog = defineAsyncComponent(() => import('../dialog/PluginLogDialog.vue'))
const PluginVersionHistoryDialog = defineAsyncComponent(() => import('../dialog/PluginVersionHistoryDialog.vue'))

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

// 显示器宽度
const display = useDisplay()

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

// 菜单显示状态
const menuVisible = ref(false)

// 用户头像是否加载完成
const isAvatarLoaded = ref(false)

// 图片是否加载完成
const isImageLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

let progressDialogController: ReturnType<typeof openSharedDialog> | null = null
let cloneDialogController: ReturnType<typeof openSharedDialog> | null = null

/** 打开插件操作进度弹窗，插件卡片自身不再持有进度弹窗实例。 */
function showPluginProgress(text: string) {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text }, {}, { closeOn: false })
}

/** 关闭当前插件操作进度弹窗。 */
function closePluginProgress() {
  progressDialogController?.close()
  progressDialogController = null
}

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
  openSharedDialog(
    PluginVersionHistoryDialog,
    { plugin: props.plugin, showUpdateAction: true },
    { update: updatePlugin },
    { closeOn: ['close', 'update', 'update:modelValue'] },
  )
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
    showPluginProgress(t('plugin.uninstalling', { name: props.plugin?.plugin_name }))
    const result: { [key: string]: any } = await api.delete(`plugin/${props.plugin?.id}`)
    // 隐藏等待提示框
    closePluginProgress()
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
    closePluginProgress()
    console.error(error)
  }
}

// 显示插件数据
async function showPluginInfo() {
  openSharedDialog(
    PluginDataDialog,
    { plugin: props.plugin },
    {
      switch: showPluginConfig,
    },
    { closeOn: ['close', 'switch'] },
  )
}

// 显示插件配置
async function showPluginConfig() {
  openSharedDialog(
    PluginConfigDialog,
    { plugin: props.plugin },
    {
      save: configDone,
      switch: showPluginInfo,
    },
    { closeOn: ['close', 'save', 'switch'] },
  )
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
  if (props.plugin?.system_version_compatible === false) {
    $toast.error(props.plugin?.system_version_message || t('plugin.incompatibleSystemVersion'))
    return
  }

  try {
    // 显示等待提示框
    showPluginProgress(t('plugin.updating', { name: props.plugin?.plugin_name }))

    const result: { [key: string]: any } = await api.get(`plugin/install/${props.plugin?.id}`, {
      params: {
        repo_url: props.plugin?.repo_url,
        force: true,
      },
    })

    // 隐藏等待提示框
    closePluginProgress()

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
    closePluginProgress()
    console.error(error)
  }
}

// 访问作者主页
function visitAuthorPage() {
  window.open(props.plugin?.author_url, '_blank')
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
  emit('save')
}

/** 显示插件分身共享弹窗。 */
function showPluginClone() {
  cloneDialogController?.close()
  cloneDialogController = openSharedDialog(
    PluginCloneDialog,
    { plugin: props.plugin },
    { clone: executePluginClone },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 执行插件分身
async function executePluginClone(cloneForm: { suffix: string; name: string; description: string; version: string; icon: string }) {
  if (!cloneForm.suffix.trim()) {
    $toast.error(t('plugin.suffixRequired'))
    return
  }

  try {
    showPluginProgress(t('plugin.cloning', { name: props.plugin?.plugin_name }))

    const result: { [key: string]: any } = await api.post(`plugin/clone/${props.plugin?.id}`, {
      suffix: cloneForm.suffix.trim(),
      name: cloneForm.name.trim(),
      description: cloneForm.description.trim(),
      version: cloneForm.version.trim(),
      icon: cloneForm.icon.trim(),
    })

    closePluginProgress()

    if (result.success) {
      $toast.success(t('plugin.cloneSuccess', { name: cloneForm.name }))
      cloneDialogController?.close()
      cloneDialogController = null
      // 通知父组件刷新
      emit('remove')
    } else {
      $toast.error(t('plugin.cloneFailed', { message: result.message }))
    }
  } catch (error) {
    closePluginProgress()
    $toast.error(t('plugin.cloneFailedGeneral'))
    console.error(error)
  }
}

onUnmounted(() => {
  closePluginProgress()
  cloneDialogController?.close()
})

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
      click: updatePlugin,
    },
  },
  {
    title: t('plugin.updateHistory'),
    value: 9,
    show: !props.plugin?.has_update,
    props: {
      prependIcon: 'mdi-update',
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
        openSharedDialog(PluginLogDialog, { plugin: props.plugin }, {}, { closeOn: ['close', 'update:modelValue'] })
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

    const updateHistoryItemIndex = dropdownItems.value.findIndex(item => item.value === 9)
    if (updateHistoryItemIndex !== -1) dropdownItems.value[updateHistoryItemIndex].show = !newHasUpdate
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
              <div
                class="relative flex-shrink-0 self-center pb-3"
                :class="{ 'cursor-move': props.sortable && display.mdAndUp.value }"
              >
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
              <IconBtn @click.stop>
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
