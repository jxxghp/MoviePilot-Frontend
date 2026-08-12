<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import type { Plugin, PluginRating } from '@/api/types'
import { getLogoUrl, getProxyImageUrl } from '@/utils/imageUtils'
import { usePluginCardAccent } from '@/composables/usePluginCardAccent'
import { formatDownloadCount } from '@/@core/utils/formatters'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { useGlobalSettingsStore } from '@/stores'

// 插件日志面板只有点击“查看日志”时才需要，延后加载可减轻插件列表首屏。
const PluginConfigDialog = defineAsyncComponent(() => import('../dialog/PluginConfigDialog.vue'))
const PluginDataDialog = defineAsyncComponent(() => import('../dialog/PluginDataDialog.vue'))
const ProgressDialog = defineAsyncComponent(() => import('../dialog/ProgressDialog.vue'))
const PluginCloneDialog = defineAsyncComponent(() => import('../dialog/PluginCloneDialog.vue'))
const PluginLogDialog = defineAsyncComponent(() => import('../dialog/PluginLogDialog.vue'))
const PluginMarketDetailDialog = defineAsyncComponent(() => import('../dialog/PluginMarketDetailDialog.vue'))
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
const globalSettingsStore = useGlobalSettingsStore()

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save', 'actionDone', 'rating'])

// 多语言
const { t } = useI18n()

const hasCardRating = computed(() => (props.plugin?.rating_count || 0) > 0)
const hasCardStatus = computed(() => Boolean(props.plugin?.has_update) || hasCardRating.value)
const cardRatingValue = computed(() => Number(props.plugin?.average_rating || 0).toFixed(1))
const cardRatingSummary = computed(() =>
  t('plugin.ratingSummary', {
    rating: cardRatingValue.value,
    count: props.plugin?.rating_count || 0,
  }),
)

// 显示器宽度
const display = useDisplay()

const { accentStyle, imageRef, resetAccentColor, updateAccentColor } = usePluginCardAccent()

// 提示框
const $toast = useToast()

const pluginSidebarNavStore = usePluginSidebarNavStore()

// 确认框
const createConfirm = useConfirm()

// 本身是否可见
const isVisible = ref(true)

// 菜单显示状态
const menuVisible = ref(false)

// 用户头像是否加载完成
const isAvatarLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

let progressDialogController: ReturnType<typeof openSharedDialog> | null = null
let cloneDialogController: ReturnType<typeof openSharedDialog> | null = null
let marketDetailDialogController: ReturnType<typeof openSharedDialog> | null = null
let versionHistoryDialogController: ReturnType<typeof openSharedDialog> | null = null

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
  await updateAccentColor()
}

function imageFailed() {
  imageLoadError.value = true
  resetAccentColor()
}

// 显示更新日志
function showUpdateHistory(showUpdateAction: boolean = false) {
  versionHistoryDialogController?.close()
  versionHistoryDialogController = openSharedDialog(
    PluginVersionHistoryDialog,
    { plugin: props.plugin, showUpdateAction },
    { update: updatePlugin },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 调用API卸载插件
async function uninstallPlugin() {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('plugin.confirmUninstall', { name: props.plugin?.plugin_name }),
  })

  if (!isConfirmed) return

  showPluginProgress(t('plugin.uninstalling', { name: props.plugin?.plugin_name }))
  try {
    await api.delete(`plugin/${props.plugin?.id}`, { feedback: 'silent' })
    $toast.success(t('plugin.uninstallSuccess', { name: props.plugin?.plugin_name }))

    emit('remove')
    // 生命周期成功后刷新动态导航。
    void pluginSidebarNavStore.ensureSidebarNav(true)
  } catch (error) {
    $toast.error(
      t('plugin.uninstallFailed', {
        name: props.plugin?.plugin_name,
        message: getApiBusinessErrorMessage(error) || t('common.serverConnectionFailed'),
      }),
    )
    console.error(error)
  } finally {
    closePluginProgress()
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
    return getProxyImageUrl(props.plugin.plugin_icon, {
      proxy: true,
      useCache: globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE,
    })

  return `./plugin_icon/${props.plugin?.plugin_icon}`
})

// 插件作者头像路径
const authorPath: Ref<string> = computed(() => {
  if (!props.plugin?.author_url) return ''
  // 网络图片则使用代理后返回
  return getProxyImageUrl(`${props.plugin.author_url}.png`, {
    proxy: true,
    useCache: globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE,
  })
})

// 重置插件
async function resetPlugin() {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('plugin.confirmReset', { name: props.plugin?.plugin_name }),
  })

  if (!isConfirmed) return

  try {
    await api.get(`plugin/reset/${props.plugin?.id}`, { feedback: 'silent' })
    $toast.success(t('plugin.resetSuccess', { name: props.plugin?.plugin_name }))
    emit('save')
    // 生命周期成功后刷新动态导航。
    void pluginSidebarNavStore.ensureSidebarNav(true)
  } catch (error) {
    $toast.error(
      t('plugin.resetFailed', {
        name: props.plugin?.plugin_name,
        message: getApiBusinessErrorMessage(error) || t('common.serverConnectionFailed'),
      }),
    )
    console.error(error)
  }
}

// 更新插件
async function updatePlugin(releaseVersion?: string, repoUrl?: string) {
  if (!releaseVersion && props.plugin?.system_version_compatible === false) {
    $toast.error(props.plugin?.system_version_message || t('plugin.incompatibleSystemVersion'))
    return
  }

  if (releaseVersion) {
    const isConfirmed = await createConfirm({
      title: t('common.confirm'),
      content: t('plugin.confirmInstallOldRelease', {
        name: props.plugin?.plugin_name,
        version: releaseVersion,
      }),
      confirmText: t('common.confirm'),
    })

    if (!isConfirmed) return
  }

  try {
    showPluginProgress(
      releaseVersion
        ? t('plugin.installing', { name: props.plugin?.plugin_name, version: releaseVersion })
        : t('plugin.updating', { name: props.plugin?.plugin_name }),
    )

    await api.get(`plugin/install/${props.plugin?.id}`, {
      feedback: 'silent',
      params: {
        repo_url: repoUrl || props.plugin?.repo_url,
        release_version: releaseVersion,
        force: true,
      },
    })

    $toast.success(t('plugin.updateSuccess', { name: props.plugin?.plugin_name }))
    versionHistoryDialogController?.close()
    versionHistoryDialogController = null

    emit('save')
    // 生命周期成功后刷新动态导航。
    void pluginSidebarNavStore.ensureSidebarNav(true)
  } catch (error) {
    $toast.error(
      t('plugin.updateFailed', {
        name: props.plugin?.plugin_name,
        message: getApiBusinessErrorMessage(error) || t('common.serverConnectionFailed'),
      }),
    )
    console.error(error)
  } finally {
    closePluginProgress()
  }
}

/** 将 raw.githubusercontent.com 插件地址转换为可访问的 GitHub 项目主页。 */
function normalizePluginRepoUrl(repoUrl?: string) {
  if (!repoUrl || !repoUrl.includes('raw.githubusercontent.com')) return repoUrl

  try {
    const rawUrl = new URL(repoUrl)
    const [user, repo] = rawUrl.pathname.split('/').filter(Boolean)

    if (user && repo) return `https://github.com/${user}/${repo}`
  } catch (error) {
    console.error(error)
  }

  return repoUrl
}

/** 判断插件当前是否已经有可用的远程项目地址。 */
function hasRemoteRepoUrl(plugin?: Plugin) {
  return Boolean(plugin?.repo_url && !plugin.repo_url.startsWith('local://'))
}

/** 优先解析插件仓库地址，本地插件或缺少仓库地址时回退到作者主页。 */
function resolvePluginPageUrl(plugin?: Plugin) {
  if (!plugin) return ''

  const repoUrl = hasRemoteRepoUrl(plugin) ? normalizePluginRepoUrl(plugin.repo_url) : plugin.author_url

  return repoUrl || plugin.author_url || ''
}

/** 从插件市场中查找同 ID 插件，补齐已安装插件缺失的 repo_url。 */
async function fetchMarketPlugin(pluginId?: string) {
  if (!pluginId) return null

  try {
    const marketPlugins: Plugin[] = await api.get('plugin/', {
      params: {
        state: 'market',
        force: false,
      },
    })

    return marketPlugins.find(plugin => plugin.id === pluginId) || null
  } catch (error) {
    console.error(error)
    return null
  }
}

/** 读取已安装插件的最新市场详情，并保留本地运行状态字段。 */
async function fetchInstalledPluginDetail() {
  let pluginDetail = props.plugin
  if (!props.plugin?.id) return pluginDetail

  try {
    const historyPlugin: Plugin = await api.get(`plugin/history/${props.plugin.id}`, {
      params: {
        force: false,
      },
    })
    pluginDetail = { ...(props.plugin || {}), ...(historyPlugin || {}), installed: true } as Plugin
  } catch (error) {
    console.error(error)
  }
  return pluginDetail
}

/** 使用插件市场详情弹窗展示已安装插件信息和评分入口。 */
async function showPluginAbout() {
  const pluginDetail = await fetchInstalledPluginDetail()
  if (!pluginDetail) return

  marketDetailDialogController?.close()
  marketDetailDialogController = openSharedDialog(
    PluginMarketDetailDialog,
    {
      plugin: pluginDetail,
      count: props.count,
    },
    {
      install: () => {
        emit('save')
        // 详情弹窗的安装事件只刷新父列表，动态导航由卡片补充同步。
        void pluginSidebarNavStore.ensureSidebarNav(true)
      },
      rating: (pluginRating: PluginRating) => emit('rating', pluginRating),
    },
    { closeOn: ['close', 'install', 'update:modelValue'] },
  )
}

// 访问插件项目主页
async function visitPluginPage() {
  const popup = window.open('about:blank', '_blank')
  let pluginDetail = await fetchInstalledPluginDetail()

  if (popup) popup.opener = null

  if (!hasRemoteRepoUrl(pluginDetail)) {
    const marketPlugin = await fetchMarketPlugin(props.plugin?.id)

    if (marketPlugin) {
      // 插件市场条目通常包含真实仓库地址，优先使用它来对齐市场卡片跳转。
      pluginDetail = { ...(pluginDetail || {}), ...marketPlugin } as Plugin
    }
  }

  const repoUrl = resolvePluginPageUrl(pluginDetail)

  if (repoUrl) {
    if (popup) {
      popup.location.replace(repoUrl)
      return
    }

    window.open(repoUrl, '_blank')
    return
  }

  popup?.close()
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
async function executePluginClone(cloneForm: {
  suffix: string
  name: string
  description: string
  version: string
  icon: string
}) {
  if (!cloneForm.suffix.trim()) {
    $toast.error(t('plugin.suffixRequired'))
    return
  }

  try {
    showPluginProgress(t('plugin.cloning', { name: props.plugin?.plugin_name }))

    await api.post(
      `plugin/clone/${props.plugin?.id}`,
      {
        suffix: cloneForm.suffix.trim(),
        name: cloneForm.name.trim(),
        description: cloneForm.description.trim(),
        version: cloneForm.version.trim(),
        icon: cloneForm.icon.trim(),
      },
      { feedback: 'silent' },
    )

    $toast.success(t('plugin.cloneSuccess', { name: cloneForm.name }))
    cloneDialogController?.close()
    cloneDialogController = null
    emit('remove')
    // 生命周期成功后刷新动态导航。
    void pluginSidebarNavStore.ensureSidebarNav(true)
  } catch (error) {
    const message = getApiBusinessErrorMessage(error)
    $toast.error(message ? t('plugin.cloneFailed', { message }) : t('plugin.cloneFailedGeneral'))
    console.error(error)
  } finally {
    closePluginProgress()
  }
}

onUnmounted(() => {
  closePluginProgress()
  cloneDialogController?.close()
  marketDetailDialogController?.close()
  versionHistoryDialogController?.close()
})

// 弹出菜单
const dropdownItems = ref([
  {
    title: t('plugin.about'),
    value: 10,
    show: true,
    props: {
      prependIcon: 'mdi-information-outline',
      click: showPluginAbout,
    },
  },
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
      click: () => showUpdateHistory(true),
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
    title: t('plugin.versionHistory'),
    value: 9,
    show: !props.plugin?.has_update,
    props: {
      prependIcon: 'mdi-update',
      click: () => showUpdateHistory(false),
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
    title: t('plugin.projectHome'),
    value: 7,
    show: true,
    props: {
      prependIcon: 'mdi-github',
      click: visitPluginPage,
    },
  },
])

// 监听插件状态变化
watch(
  () => props.plugin?.has_update,
  newHasUpdate => {
    const updateItemIndex = dropdownItems.value.findIndex(item => item.value === 3)
    if (updateItemIndex !== -1) dropdownItems.value[updateItemIndex].show = newHasUpdate

    const updateHistoryItemIndex = dropdownItems.value.findIndex(item => item.value === 9)
    if (updateHistoryItemIndex !== -1) dropdownItems.value[updateHistoryItemIndex].show = !newHasUpdate
  },
)

// 监听插件窗口状态变化
watch(
  () => props.plugin?.page_open,
  newOpenState => {
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
        <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
        <div v-if="isVisible" v-bind="hover.props" class="plugin-card-hover-area h-full">
          <VCard
            :width="props.width"
            :height="props.height"
            @click="handleCardClick"
            class="plugin-card app-hover-lift-card flex flex-col h-full"
            :class="{
              'app-hover-lift-card--hovering': hover.isHovering && !props.sortable,
              'cursor-move': props.sortable,
            }"
            :style="accentStyle"
            :ripple="!props.sortable"
          >
            <div class="plugin-card__banner flex-grow">
              <VCardText class="px-2 pt-2 pb-0">
                <VCardTitle
                  class="text-white px-2 pb-0 text-lg text-shadow whitespace-nowrap overflow-hidden text-ellipsis"
                  :class="{ 'plugin-card__title--with-status': hasCardStatus }"
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
                      @error="imageFailed"
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
                        <VListItemTitle>{{ item.title }}</VListItemTitle>
                      </VListItem>
                    </VList>
                  </VMenu>
                </IconBtn>
              </div>
            </VCardText>
            <div
              v-if="props.plugin?.has_update"
              class="plugin-card__status plugin-card__status--update"
              :aria-label="t('plugin.hasUpdate')"
              :title="t('plugin.hasUpdate')"
            >
              <VIcon icon="mdi-new-box" class="text-white" size="20" />
            </div>
            <div
              v-else-if="hasCardRating"
              class="plugin-card__status plugin-card__status--rating"
              :aria-label="cardRatingSummary"
              :title="cardRatingSummary"
            >
              <VIcon icon="mdi-star" color="warning" size="16" />
              <span>{{ cardRatingValue }}</span>
            </div>
          </VCard>
        </div>
      </template>
    </VHover>
  </div>
</template>

<style lang="scss" scoped>
.plugin-card-hover-area {
  inline-size: 100%;
}

.plugin-card__title--with-status {
  padding-inline-end: 4rem !important;
}

.plugin-card__status {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  color: white;
  inset-block-start: 0.625rem;
  inset-inline-end: 0.625rem;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 65%);
}

.plugin-card__status--rating {
  gap: 0.125rem;
  font-size: 0.75rem;
  font-weight: 600;
}

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
