<script lang="ts" setup>
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import type { Plugin } from '@/api/types'
import { getLogoUrl, getProxyImageUrl } from '@/utils/imageUtils'
import { useGlobalSettingsStore } from '@/stores'
import { usePluginCardAccent } from '@/composables/usePluginCardAccent'
import { isNullOrEmptyObject } from '@/@core/utils'
import { formatDownloadCount } from '@/@core/utils/formatters'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useConfirm } from '@/composables/useConfirm'

const PluginMarketDetailDialog = defineAsyncComponent(() => import('@/components/dialog/PluginMarketDetailDialog.vue'))
const PluginVersionHistoryDialog = defineAsyncComponent(
  () => import('@/components/dialog/PluginVersionHistoryDialog.vue'),
)
const ProgressDialog = defineAsyncComponent(() => import('@/components/dialog/ProgressDialog.vue'))

type InstallHandler = (releaseVersion?: string, repoUrl?: string) => unknown

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
  count: Number,
  installHandler: Function as PropType<InstallHandler>,
})
const globalSettingsStore = useGlobalSettingsStore()

// 定义触发的自定义事件
const emit = defineEmits(['install'])

// 多语言
const { t } = useI18n()

// 提示框
const $toast = useToast()

const createConfirm = useConfirm()

const { accentStyle, imageRef, resetAccentColor, updateAccentColor } = usePluginCardAccent()

// 获取当前插件的标签
const pluginLabels = computed(() => {
  if (!props.plugin?.plugin_label) return []

  return props.plugin.plugin_label
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
})

// 图片是否加载失败
const imageLoadError = ref(false)

let progressDialogController: ReturnType<typeof openSharedDialog> | null = null
let versionHistoryDialogController: ReturnType<typeof openSharedDialog> | null = null

/** 打开插件安装进度弹窗。 */
function showInstallProgress(text: string) {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text }, {}, { closeOn: false })
}

/** 关闭插件安装进度弹窗。 */
function closeInstallProgress() {
  progressDialogController?.close()
  progressDialogController = null
}

// 图片加载完成
async function imageLoaded() {
  await updateAccentColor()
}

function imageFailed() {
  imageLoadError.value = true
  resetAccentColor()
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

// 访问插件页面
function visitPluginPage() {
  // 将raw.githubusercontent.com转换为项目地址
  let repoUrl = props.plugin?.repo_url
  if (props.plugin?.is_local || repoUrl?.startsWith('local://')) {
    repoUrl = props.plugin?.author_url
  }
  if (repoUrl?.includes('raw.githubusercontent.com')) {
    try {
      const rawUrl = new URL(repoUrl)
      const [user, repo] = rawUrl.pathname.split('/').filter(Boolean)
      if (user && repo) repoUrl = `https://github.com/${user}/${repo}`
    } catch {
      return
    }
  }
  if (!repoUrl) {
    repoUrl = props.plugin?.author_url
  }
  window.open(repoUrl, '_blank')
}

// 显示更新日志
function showUpdateHistory() {
  versionHistoryDialogController?.close()
  versionHistoryDialogController = openSharedDialog(
    PluginVersionHistoryDialog,
    { plugin: props.plugin, actionMode: 'install' },
    {
      update: installPlugin,
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 从插件市场版本历史安装指定 Release；最新版本走普通安装路径以保留主程序兼容校验。 */
async function installPlugin(releaseVersion?: string, repoUrl?: string) {
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

  if (props.installHandler) {
    versionHistoryDialogController?.close()
    versionHistoryDialogController = null
    await props.installHandler(releaseVersion, repoUrl)
    return
  }

  try {
    showInstallProgress(
      t('plugin.installing', {
        name: props.plugin?.plugin_name,
        version: releaseVersion || props.plugin?.plugin_version,
      }),
    )

    await api.get(`plugin/install/${props.plugin?.id}`, {
      feedback: 'silent',
      params: {
        release_version: releaseVersion,
        force: props.plugin?.has_update || Boolean(releaseVersion),
      },
    })

    $toast.success(t('plugin.installSuccess', { name: props.plugin?.plugin_name }))
    versionHistoryDialogController?.close()
    versionHistoryDialogController = null
    emit('install')
  } catch (error) {
    $toast.error(
      t('plugin.installFailed', {
        name: props.plugin?.plugin_name,
        message: getApiBusinessErrorMessage(error) || t('common.serverConnectionFailed'),
      }),
    )
    console.error(error)
  } finally {
    closeInstallProgress()
  }
}

/** 打开共享插件市场详情弹窗。 */
function showPluginDetail() {
  openSharedDialog(
    PluginMarketDetailDialog,
    {
      plugin: props.plugin,
      count: props.count,
      installHandler: props.installHandler,
    },
    {
      install: () => emit('install'),
    },
    { closeOn: ['close', 'install', 'update:modelValue'] },
  )
}

// 弹出菜单
const dropdownItems = ref([
  {
    title: t('plugin.versionHistory'),
    value: 2,
    show: !isNullOrEmptyObject(props.plugin?.history || {}),
    props: {
      prependIcon: 'mdi-update',
      click: showUpdateHistory,
    },
  },
  {
    title: t('plugin.projectHome'),
    value: 1,
    show: true,
    props: {
      prependIcon: 'mdi-github',
      click: visitPluginPage,
    },
  },
])

onUnmounted(() => {
  closeInstallProgress()
  versionHistoryDialogController?.close()
})
</script>

<template>
  <div>
    <VHover>
      <template #default="hover">
        <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
        <div v-bind="hover.props" class="plugin-app-card-hover-area h-full">
          <VCard
            :width="props.width"
            :height="props.height"
            @click="showPluginDetail"
            class="plugin-card app-hover-lift-card flex flex-col h-full"
            :class="{
              'app-hover-lift-card--hovering': hover.isHovering,
            }"
            :style="accentStyle"
          >
            <div class="plugin-card__banner flex-grow">
              <VCardText class="px-2 pt-2 pb-0">
                <VCardTitle
                  class="plugin-app-card__title text-white px-2 pb-0 text-lg text-shadow whitespace-nowrap overflow-hidden text-ellipsis"
                  :class="{ 'plugin-app-card__title--with-rating': (props.plugin?.rating_count || 0) > 0 }"
                >
                  {{ props.plugin?.plugin_name }}
                  <span class="text-sm mt-1 text-gray-200"> v{{ props.plugin?.plugin_version }} </span>
                </VCardTitle>
              </VCardText>
              <div class="relative flex flex-row items-start px-2 justify-between grow">
                <div class="relative flex-1 min-w-0">
                  <div
                    class="text-white text-sm px-2 py-1 text-shadow overflow-hidden ..."
                    :class="{ 'line-clamp-3': !props.plugin?.plugin_label, 'line-clamp-2': props.plugin?.plugin_label }"
                  >
                    {{ props.plugin?.plugin_desc }}
                  </div>
                  <!-- 插件标签 -->
                  <div v-if="pluginLabels.length > 0" class="plugin-app-card__tags-section px-2 mb-2">
                    <VChip
                      v-for="tag in pluginLabels"
                      :key="tag"
                      size="x-small"
                      variant="tonal"
                      color="info"
                      class="plugin-app-card__tag"
                      tile
                    >
                      {{ tag }}
                    </VChip>
                  </div>
                </div>
                <div class="relative flex-shrink-0 self-center pb-3">
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
                  <VIcon icon="mdi-github" class="me-1" />
                  <a
                    class="overflow-hidden text-ellipsis whitespace-nowrap"
                    :href="props.plugin?.author_url"
                    target="_blank"
                    @click.stop
                  >
                    {{ props.plugin?.plugin_author }}
                  </a>
                </div>
                <div v-if="props.count" class="ms-2 flex-shrink-0 download-count align-middle items-center">
                  <VIcon size="small" icon="mdi-download" />
                  <span class="text-sm">{{ formatDownloadCount(props.count) }}</span>
                </div>
              </div>
              <div class="absolute bottom-0 right-0">
                <IconBtn @click.stop>
                  <VIcon size="small" icon="mdi-dots-vertical" />
                  <VMenu activator="parent" close-on-content-click>
                    <VList>
                      <VListItem
                        v-for="(item, i) in dropdownItems"
                        v-show="item.show"
                        :key="i"
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
              v-if="(props.plugin?.rating_count || 0) > 0"
              class="plugin-app-card__rating"
              :aria-label="
                t('plugin.ratingSummary', {
                  rating: Number(props.plugin?.average_rating || 0).toFixed(1),
                  count: props.plugin?.rating_count || 0,
                })
              "
              :title="
                t('plugin.ratingSummary', {
                  rating: Number(props.plugin?.average_rating || 0).toFixed(1),
                  count: props.plugin?.rating_count || 0,
                })
              "
            >
              <VIcon icon="mdi-star" color="warning" size="16" />
              <span>{{ Number(props.plugin?.average_rating || 0).toFixed(1) }}</span>
            </div>
          </VCard>
        </div>
      </template>
    </VHover>
  </div>
</template>

<style scoped>
.plugin-app-card-hover-area {
  inline-size: 100%;
}

.plugin-app-card__tags-section {
  display: flex;
  overflow: hidden;
  flex-wrap: nowrap;
  gap: 4px;
  max-inline-size: 100%;
}

.plugin-app-card__title--with-rating {
  padding-inline-end: 4rem !important;
}

.plugin-app-card__tag {
  flex: 0 0 auto;
  max-inline-size: 100%;
  min-inline-size: 0;
}

.plugin-app-card__rating {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  inset-block-start: 0.625rem;
  inset-inline-end: 0.625rem;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 65%);
}

.plugin-app-card__tag :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
