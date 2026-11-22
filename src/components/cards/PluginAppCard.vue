<script lang="ts" setup>
import { vNativeCardMenu, nativeCardAction, type NativeCardMenuBinding } from '@/native/card'
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import type { Plugin, PluginInstallOutcome, PluginSourceOptions } from '@/api/types'
import { getLogoUrl, getProxyImageUrl } from '@/utils/imageUtils'
import { useGlobalSettingsStore } from '@/stores'
import {
  resolvePluginAuthorAvatar,
  resolvePluginAuthorUrl,
  usePluginCardAccent,
} from '@/composables/usePluginCardAccent'
import { isNullOrEmptyObject } from '@/@core/utils'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useConfirm } from '@/composables/useConfirm'
import { resolvePluginInstallBlock } from '@/composables/usePluginInstallBlock'
import { usePluginRuntimeStore } from '@/stores/pluginRuntime'

const PluginMarketDetailDialog = defineAsyncComponent(() => import('@/components/dialog/PluginMarketDetailDialog.vue'))
const PluginVersionHistoryDialog = defineAsyncComponent(
  () => import('@/components/dialog/PluginVersionHistoryDialog.vue'),
)
const ProgressDialog = defineAsyncComponent(() => import('@/components/dialog/ProgressDialog.vue'))

type InstallHandler = (releaseVersion?: string, repoUrl?: string, sourceOptions?: PluginSourceOptions) => unknown

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
  count: Number,
  installHandler: Function as PropType<InstallHandler>,
})
const globalSettingsStore = useGlobalSettingsStore()
const pluginRuntimeStore = usePluginRuntimeStore()

// 定义触发的自定义事件
const emit = defineEmits(['install'])

// 多语言
const { t } = useI18n()

// 提示框
const $toast = useToast()

const createConfirm = useConfirm()

const { accentStyle, imageRef, resetAccentColor, updateAccentColor } = usePluginCardAccent()

const hasCardRating = computed(() => (props.plugin?.rating_count || 0) > 0)
const cardRatingValue = computed(() => Number(props.plugin?.average_rating || 0).toFixed(1))
const cardRatingSummary = computed(() =>
  t('plugin.ratingSummary', {
    rating: cardRatingValue.value,
    count: props.plugin?.rating_count || 0,
  }),
)

/** 紧凑格式化卡片下载量，省略整数冗余小数位并为署名留出横向空间。 */
function formatCardCount(count?: number): string {
  const value = Number(count || 0)
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return `${Math.round(value)}`
  if (value < 99950) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (value < 999500) return `${Math.round(value / 1000)}k`
  return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`
}

/** 拆分中英文逗号分隔的插件联合署名列表。 */
function parseAuthorParts(author?: string): string[] {
  return (author || '')
    .split(/[,，]/)
    .map(part => part.trim())
    .filter(Boolean)
}

/** 格式化卡片作者展示名，联合署名紧凑显示主作者与协作者人数后缀。 */
function formatAuthorDisplay(author?: string): string {
  const parts = parseAuthorParts(author)
  if (parts.length <= 1) return parts[0] || ''
  return `${parts[0]} +${parts.length - 1}`
}

const pluginVersion = computed(() => {
  const raw = props.plugin?.plugin_version || (props.plugin as (Plugin & { version?: string }) | undefined)?.version
  return raw ? raw.replace(/^v/i, '') : ''
})
const authorDisplay = computed(() => formatAuthorDisplay(props.plugin?.plugin_author))
const authorFullTitle = computed(() => parseAuthorParts(props.plugin?.plugin_author).join(' · '))

// 获取当前插件的标签
const pluginLabels = computed(() => {
  if (!props.plugin?.plugin_label) return []

  return props.plugin.plugin_label
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
})

// 图标与作者头像加载状态
const imageLoadError = ref(false)
const isAvatarLoaded = ref(false)
const isAvatarError = ref(false)

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

// 插件作者头像路径（与已安装插件卡片共用同一联合署名解析规则）
const authorPath: Ref<string> = computed(() => {
  const avatarUrl = resolvePluginAuthorAvatar(props.plugin?.author_url, props.plugin?.plugin_author)
  if (!avatarUrl) return ''

  return getProxyImageUrl(avatarUrl, {
    proxy: true,
    useCache: globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE,
  })
})

// 归一化作者主页链接
const authorLinkHref = computed(() => resolvePluginAuthorUrl(props.plugin?.author_url, props.plugin?.plugin_author))

watch(authorPath, () => {
  isAvatarLoaded.value = false
  isAvatarError.value = false
})

function handleAuthorAvatarLoad() {
  isAvatarLoaded.value = true
  isAvatarError.value = false
}

function handleAuthorAvatarError() {
  isAvatarError.value = true
}
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
  const installBlock = resolvePluginInstallBlock(props.plugin)
  if (!releaseVersion && installBlock) {
    $toast.error(installBlock.message || t(installBlock.fallbackKey))
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

    const outcome = await api.get<PluginInstallOutcome | null>(`plugin/install/${props.plugin?.id}`, {
      // 安装事务跨页面继续完成，切换路由不能中断等待结果。
      feedback: 'silent',
      skipNavigationCancellation: true,
      params: {
        release_version: releaseVersion,
        force: props.plugin?.has_update || Boolean(releaseVersion),
      },
    })

    if (outcome?.restart_required) {
      $toast.warning(t('plugin.installRestartRequired', { name: props.plugin?.plugin_name }))
    } else {
      $toast.success(t('plugin.installSuccess', { name: props.plugin?.plugin_name }))
    }
    void pluginRuntimeStore.refreshNow()
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

/** 市场卡片沿用原版本历史与项目入口，不在登记时加载详情或执行安装。 */
const nativeCardMenu = computed<NativeCardMenuBinding>(() => ({
  key: props.plugin?.id && JSON.stringify([props.plugin.id, props.plugin.repo_url]),
  title: props.plugin?.plugin_name,
  items: () =>
    dropdownItems.value.map(item =>
      nativeCardAction(item.value, {
        title: item.title,
        icon: item.props.prependIcon,
        visible: Boolean(item.show),
        invoke: item.props.click,
      }),
    ),
}))

onUnmounted(() => {
  closeInstallProgress()
  versionHistoryDialogController?.close()
})
</script>

<template>
  <div class="h-full">
    <VHover>
      <template #default="hover">
        <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
        <div v-bind="hover.props" class="plugin-app-card-hover-area h-full">
          <VCard
            v-native-card-menu="nativeCardMenu"
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
              <div class="plugin-card__header">
                <VCardTitle class="plugin-card__title plugin-app-card__title">
                  <span class="plugin-card__title-text plugin-card__name" :title="props.plugin?.plugin_name">
                    {{ props.plugin?.plugin_name }}
                  </span>
                </VCardTitle>
                <span v-if="pluginVersion" class="plugin-card__version-pill num"> v{{ pluginVersion }} </span>
              </div>
              <div class="plugin-card__body">
                <div class="plugin-card__body-main">
                  <div v-if="pluginLabels.length > 0" class="plugin-card__meta-row">
                    <div class="plugin-app-card__tags-section">
                      <span
                        v-for="(tag, tagIndex) in pluginLabels"
                        :key="`${tag}-${tagIndex}`"
                        class="plugin-app-card__tag"
                      >
                        {{ tag }}
                      </span>
                    </div>
                  </div>
                  <div class="plugin-card__desc line-clamp-2">
                    {{ props.plugin?.plugin_desc }}
                  </div>
                </div>
                <div class="plugin-card__icon-slot">
                  <div class="plugin-card__plugin-icon">
                    <VImg
                      ref="imageRef"
                      :src="iconPath"
                      class="w-full h-full"
                      cover
                      @load="imageLoaded"
                      @error="imageFailed"
                    />
                  </div>
                </div>
              </div>
            </div>
            <!-- 创作者生态铭牌栏：与我的插件卡片统一对齐作者头像、署名、下载量与星级评分 -->
            <div class="plugin-card__creator-bar">
              <div class="plugin-card__creator">
                <div class="plugin-card__author-avatar">
                  <VImg
                    :src="authorPath"
                    class="plugin-card__author-img"
                    :class="{ 'is-loaded': isAvatarLoaded && !isAvatarError }"
                    cover
                    @load="handleAuthorAvatarLoad"
                    @error="handleAuthorAvatarError"
                  />
                  <VIcon
                    v-if="!authorPath || !isAvatarLoaded || isAvatarError"
                    size="13"
                    icon="mdi-github"
                    class="plugin-card__author-fallback"
                  />
                </div>
                <span v-if="!authorLinkHref" class="plugin-card__author-name num" :title="authorFullTitle || undefined">
                  {{ authorDisplay }}
                </span>
                <a
                  v-else
                  class="plugin-card__author-name num"
                  :href="authorLinkHref"
                  target="_blank"
                  rel="noopener noreferrer"
                  :title="authorFullTitle || undefined"
                  @click.stop
                >
                  {{ authorDisplay }}
                </a>
              </div>
              <div class="plugin-card__metrics">
                <span
                  v-if="props.count"
                  class="plugin-card__metric download-count num"
                  :title="t('plugin.totalDownloads', { count: props.count })"
                >
                  <VIcon size="14" icon="mdi-download-outline" />
                  <span>{{ formatCardCount(props.count) }}</span>
                </span>
                <button
                  v-if="hasCardRating"
                  type="button"
                  class="plugin-card__rating-pill plugin-card__rating plugin-app-card__rating plugin-card__status--rating num"
                  :aria-label="cardRatingSummary"
                  :title="cardRatingSummary"
                  @click.stop="showPluginDetail"
                >
                  <VIcon icon="mdi-star" color="warning" size="14" />
                  <span>{{ cardRatingValue }}</span>
                </button>
                <IconBtn
                  data-native-card-menu-trigger
                  class="plugin-card__menu"
                  size="small"
                  :aria-label="t('nav.more')"
                  @click.stop
                >
                  <VIcon size="18" icon="mdi-dots-vertical" />
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
            </div>
          </VCard>
        </div>
      </template>
    </VHover>
  </div>
</template>

<style lang="scss" scoped>
.plugin-app-card-hover-area {
  inline-size: 100%;
}

.plugin-card {
  overflow: hidden;
  container-name: plugin-card;
  container-type: inline-size;
}

.plugin-card__banner {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding-block: 0.75rem 0.6875rem;
  padding-inline: 0.875rem;
}

.plugin-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-inline-size: 0;
}

.plugin-card__title {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  padding: 0;
  color: var(--mp-fg, rgb(var(--v-theme-on-surface)));
  font-size: 0.90625rem;
  font-weight: 600;
  gap: 0.3125rem;
  letter-spacing: 0;
  line-height: 1.35;
  min-inline-size: 0;
}

.plugin-card__title-text {
  overflow: hidden;
  flex: 1 1 auto;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-card__body {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-inline-size: 0;
}

.plugin-card__body-main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.25rem;
  min-inline-size: 0;
}

.plugin-card__meta-row {
  display: flex;
  overflow: hidden;
  align-items: center;
  gap: 0.375rem;
  min-inline-size: 0;
}

.plugin-card__version-pill {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  border: 1px solid var(--mp-border-subtle, rgba(128, 128, 128, 0.14));
  border-radius: 9999px;
  background: rgba(var(--v-theme-on-surface), 0.045);
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 1.15;
  padding-block: 0.1875rem;
  padding-inline: 0.4375rem;
  white-space: nowrap;
}

.plugin-card__desc {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.8125rem;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.42;
}

.plugin-app-card__tags-section {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.25rem;
  min-inline-size: 0;
}

.plugin-app-card__tag {
  display: inline-flex;
  overflow: hidden;
  flex: 0 0 auto;
  align-items: center;
  border: 1px solid var(--mp-info-border, rgba(var(--v-theme-info), 0.22));
  border-radius: 6px;
  background: var(--mp-info-soft, rgba(var(--v-theme-info), 0.1));
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.2;
  max-inline-size: 100%;
  min-inline-size: 0;
  padding-block: 0.0625rem;
  padding-inline: 0.3125rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-card__icon-slot {
  position: relative;
  flex-shrink: 0;
  align-self: center;
}

.plugin-card__plugin-icon {
  overflow: hidden;
  flex-shrink: 0;
  border: none;
  border-radius: var(--app-control-radius, 12px);
  background: transparent;
  block-size: 2.75rem;
  inline-size: 2.75rem;
}

.plugin-card__creator-bar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  background: var(--mp-card-dock-bg, transparent);
  block-size: 2.5rem;
  border-block-start: 1px solid var(--mp-card-dock-border, var(--mp-border-subtle, rgba(128, 128, 128, 0.08)));
  gap: 0.375rem;
  inline-size: 100%;
  min-block-size: 2.5rem;
  padding-inline: 0.875rem 0.5rem;
}

.plugin-card[data-native-card-menu-ready] .plugin-card__creator-bar {
  padding-inline-end: 0.875rem;
}

.plugin-card__creator {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.375rem;
  min-inline-size: 0;
}

.plugin-card__author-avatar {
  position: relative;
  display: inline-flex;
  overflow: hidden;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle, rgba(128, 128, 128, 0.12));
  border-radius: 9999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 1.25rem;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  inline-size: 1.25rem;
}

.plugin-card__author-img {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.18s ease;

  &.is-loaded {
    opacity: 1;
  }
}

.plugin-card__author-fallback {
  pointer-events: none;
}

.plugin-card__author-name {
  overflow: hidden;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.25;
  min-inline-size: 0;
  text-decoration: none;
  text-overflow: ellipsis;
  transition: color 0.16s ease;
  white-space: nowrap;
}

a.plugin-card__author-name:hover {
  color: var(--mp-fg, rgb(var(--v-theme-on-surface)));
}

a.plugin-card__author-name:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--mp-ring, rgba(var(--v-theme-primary), 0.68));
  outline-offset: 2px;
}

.plugin-card__metrics {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.25rem;
}

.plugin-card__metric {
  display: inline-flex;
  align-items: center;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  gap: 0.125rem;
  line-height: 1.2;
}

.plugin-card__rating-pill {
  display: inline-flex;
  align-items: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--mp-fg, rgb(var(--v-theme-on-surface)));
  cursor: pointer;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  gap: 0.1875rem;
  line-height: 1.2;
  padding-block: 0.1875rem;
  padding-inline: 0.25rem;
  transition: background-color 0.16s ease;

  &:hover,
  &:focus-visible {
    background: var(--mp-warning-soft, rgba(var(--v-theme-warning), 0.12));
  }

  &:focus-visible {
    outline: 2px solid var(--mp-ring, rgba(var(--v-theme-primary), 0.68));
    outline-offset: 2px;
  }
}

.plugin-card__menu {
  --v-btn-height: 1.75rem;

  block-size: 1.75rem !important;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  inline-size: 1.75rem !important;
  min-inline-size: 1.75rem !important;
}

@container plugin-card (max-width: 315px) {
  .plugin-card__author-name {
    font-size: 0.75rem;
  }

  .plugin-card__creator {
    gap: 0.25rem;
  }

  .plugin-card__metrics {
    gap: 0.125rem;
  }

  .plugin-card__rating-pill {
    gap: 0.125rem;
    padding-inline: 0.125rem;
  }
}

@container plugin-card (max-width: 280px) {
  .plugin-card__creator-bar {
    gap: 0.25rem;
    padding-inline-end: 0.25rem;
  }

  .plugin-card__menu {
    --v-btn-height: 1.5rem;

    block-size: 1.5rem !important;
    inline-size: 1.5rem !important;
    min-inline-size: 1.5rem !important;
  }
}
</style>
