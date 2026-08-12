<script lang="ts" setup>
import api from '@/api'
import { getApiBusinessErrorMessage, isApiBusinessFailure } from '@/api/client'
import type { Plugin, PluginRating } from '@/api/types'
import { formatDownloadCount } from '@/@core/utils/formatters'
import PluginRatingDisplay from '@/components/common/PluginRatingDisplay.vue'
import { getLogoUrl } from '@/utils/imageUtils'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useConfirm } from '@/composables/useConfirm'

const ProgressDialog = defineAsyncComponent(() => import('@/components/dialog/ProgressDialog.vue'))
const PluginVersionHistoryDialog = defineAsyncComponent(
  () => import('@/components/dialog/PluginVersionHistoryDialog.vue'),
)

// 多语言
const { t } = useI18n()

// 提示框
const $toast = useToast()

const createConfirm = useConfirm()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugin: {
    type: Object as PropType<Plugin>,
    required: true,
  },
  count: Number,
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'install', 'rating'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const isInstalled = computed(() => Boolean(props.plugin?.installed))

const rating = ref<PluginRating>({
  plugin_id: props.plugin?.id,
  average_rating: props.plugin?.average_rating || 0,
  rating_count: props.plugin?.rating_count || 0,
  user_rating: props.plugin?.user_rating,
})
const selectedRating = ref(props.plugin?.user_rating || 0)
const ratingLoading = ref(false)
const ratingSubmitting = ref(false)

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

/** 计算插件图标路径。 */
function pluginIconPath() {
  if (imageLoadError.value) return getLogoUrl('plugin')
  if (props.plugin?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(
      props.plugin?.plugin_icon,
    )}&cache=true`

  return `./plugin_icon/${props.plugin?.plugin_icon}`
}

/** 访问插件项目或作者页面。 */
function visitPluginPage() {
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

/** 安装插件并通知父级刷新市场列表。 */
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

  const failureMessageKey = isInstalled.value ? 'plugin.updateFailed' : 'plugin.installFailed'

  try {
    showInstallProgress(
      isInstalled.value && !releaseVersion
        ? t('plugin.updating', { name: props.plugin?.plugin_name })
        : t('plugin.installing', {
            name: props.plugin?.plugin_name,
            version: releaseVersion || props?.plugin?.plugin_version,
          }),
    )

    await api.get(`plugin/install/${props.plugin?.id}`, {
      params: {
        repo_url: repoUrl || props.plugin?.repo_url,
        release_version: releaseVersion,
        force: isInstalled.value || props.plugin?.has_update || Boolean(releaseVersion),
      },
      feedback: 'silent',
    })

    $toast.success(
      isInstalled.value
        ? t('plugin.updateSuccess', { name: props.plugin?.plugin_name })
        : t('plugin.installSuccess', { name: props.plugin?.plugin_name }),
    )
    versionHistoryDialogController?.close()
    versionHistoryDialogController = null
    visible.value = false
    emit('install')
  } catch (error) {
    $toast.error(
      t(failureMessageKey, {
        name: props.plugin?.plugin_name,
        message: getApiBusinessErrorMessage(error) || t('common.serverConnectionFailed'),
      }),
    )
    console.error(error)
  } finally {
    closeInstallProgress()
  }
}

/** 打开版本历史并支持从 Release 资产安装指定版本。 */
function showUpdateHistory() {
  versionHistoryDialogController?.close()
  versionHistoryDialogController = openSharedDialog(
    PluginVersionHistoryDialog,
    {
      plugin: props.plugin,
      actionMode: isInstalled.value ? 'update' : 'install',
      showUpdateAction: isInstalled.value && Boolean(props.plugin?.has_update),
    },
    {
      update: installPlugin,
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 查询插件平均分和当前安装实例评分。 */
async function loadPluginRating() {
  if (!props.plugin?.id) return

  ratingLoading.value = true
  try {
    const result: PluginRating = await api.get(`plugin/rating/${props.plugin.id}`)
    rating.value = result
    selectedRating.value = result.user_rating || 0
  } catch (error) {
    console.error(error)
  } finally {
    ratingLoading.value = false
  }
}

/** 提交已安装插件的当前安装实例评分。 */
async function submitPluginRating() {
  if (!props.plugin?.id || !isInstalled.value || selectedRating.value <= 0) return

  ratingSubmitting.value = true
  try {
    const result = await api.post<PluginRating>(
      `plugin/rating/${props.plugin.id}`,
      { rating: selectedRating.value },
      { feedback: 'silent' },
    )
    rating.value = result
    selectedRating.value = result.user_rating || selectedRating.value
    emit('rating', result)
    $toast.success(t('plugin.ratingSuccess', { name: props.plugin?.plugin_name }))
  } catch (error) {
    console.error(error)
    const businessMessage = getApiBusinessErrorMessage(error)
    $toast.error(
      t('plugin.ratingFailed', {
        message:
          businessMessage || (isApiBusinessFailure(error) ? t('common.unknown') : t('common.serverConnectionFailed')),
      }),
    )
  } finally {
    ratingSubmitting.value = false
  }
}

watch(
  () => [visible.value, props.plugin?.id],
  ([isVisible]) => {
    if (isVisible) loadPluginRating()
  },
  { immediate: true },
)

onUnmounted(() => {
  closeInstallProgress()
  versionHistoryDialogController?.close()
})
</script>

<template>
  <VDialog v-if="visible" v-model="visible" width="100%" max-width="25rem" max-height="90dvh" scrollable>
    <VCard class="plugin-market-detail">
      <VDialogCloseBtn v-model="visible" />
      <VCardText class="plugin-market-detail__content">
        <header class="plugin-market-detail__header">
          <VAvatar size="64" class="plugin-market-detail__avatar">
            <VImg :src="pluginIconPath()" aspect-ratio="4/3" cover @error="imageLoadError = true" />
          </VAvatar>
          <h2 class="plugin-market-detail__title">
            {{ props.plugin?.plugin_name }}
          </h2>
          <p v-if="props.plugin?.plugin_desc" class="plugin-market-detail__description">
            {{ props.plugin?.plugin_desc }}
          </p>
          <div v-if="rating.rating_count > 0" class="plugin-market-detail__header-rating">
            <PluginRatingDisplay :rating="rating.average_rating" :count="rating.rating_count" :icon-size="18" />
          </div>
        </header>

        <dl class="plugin-market-detail__metadata">
          <div class="plugin-market-detail__metadata-row">
            <dt>{{ t('common.version') }}：</dt>
            <dd>v{{ props.plugin?.plugin_version }}</dd>
          </div>
          <div class="plugin-market-detail__metadata-row">
            <dt>{{ t('common.author') }}：</dt>
            <dd>
              <button type="button" class="plugin-market-detail__author" @click="visitPluginPage">
                {{ props.plugin?.plugin_author }}
              </button>
            </dd>
          </div>
        </dl>

        <VAlert
          v-if="props.plugin?.system_version_compatible === false"
          type="warning"
          variant="tonal"
          density="compact"
          class="plugin-market-detail__warning"
          :text="props.plugin?.system_version_message || t('plugin.incompatibleSystemVersion')"
        />

        <div class="plugin-market-detail-actions">
          <div class="plugin-market-detail-actions__buttons">
            <VBtn
              v-if="!isInstalled"
              color="primary"
              prepend-icon="mdi-download"
              :disabled="props.plugin?.system_version_compatible === false"
              @click="installPlugin()"
            >
              {{ t('plugin.installToLocal') }}
            </VBtn>
            <VBtn
              v-else-if="props.plugin?.has_update"
              color="primary"
              prepend-icon="mdi-arrow-up-circle-outline"
              :disabled="props.plugin?.system_version_compatible === false"
              @click="installPlugin()"
            >
              {{ t('plugin.update') }}
            </VBtn>
            <VBtn variant="tonal" prepend-icon="mdi-update" @click="showUpdateHistory">
              {{ t('plugin.versionHistory') }}
            </VBtn>
          </div>
          <div v-if="props.count" class="plugin-market-detail-actions__downloads">
            <VIcon icon="mdi-fire" size="18" />
            <span>{{ t('plugin.totalDownloads', { count: formatDownloadCount(props.count) }) }}</span>
          </div>
        </div>

        <section v-if="isInstalled" class="plugin-market-detail-user-rating">
          <h3 class="plugin-market-detail-user-rating__title">
            {{ t('plugin.yourRating') }}
          </h3>
          <div class="plugin-market-detail-user-rating__controls">
            <VRating
              v-model="selectedRating"
              :disabled="ratingLoading || ratingSubmitting"
              half-increments
              hover
              density="compact"
              active-color="warning"
            />
            <VBtn
              size="small"
              variant="tonal"
              prepend-icon="mdi-star-check-outline"
              :loading="ratingSubmitting"
              :disabled="ratingLoading || selectedRating <= 0"
              @click="submitPluginRating"
            >
              {{ t('plugin.submitRating') }}
            </VBtn>
          </div>
        </section>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.plugin-market-detail__content {
  padding: 1.75rem 1.25rem 1.25rem;
}

.plugin-market-detail__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.plugin-market-detail__avatar {
  flex: 0 0 auto;
}

.plugin-market-detail__title {
  max-inline-size: 100%;
  margin: 0.75rem 0 0;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.plugin-market-detail__description {
  max-inline-size: 24rem;
  margin: 0.25rem 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.plugin-market-detail__header-rating {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-block: 0.75rem 0.375rem;
}

.plugin-market-detail__metadata {
  display: grid;
  gap: 0.625rem;
  margin: 1.125rem 0;
}

.plugin-market-detail__metadata-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 0.625rem;
  min-inline-size: 0;
}

.plugin-market-detail__metadata dt {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: end;
  white-space: nowrap;
}

.plugin-market-detail__metadata dd {
  min-inline-size: 0;
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
  text-align: start;
}

.plugin-market-detail__author {
  max-inline-size: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  overflow-wrap: anywhere;
  text-align: start;
}

.plugin-market-detail__author:hover,
.plugin-market-detail__author:focus-visible {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
}

.plugin-market-detail__warning {
  margin-block-start: 1rem;
}

.plugin-market-detail-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-block-start: 1rem;
}

.plugin-market-detail-actions__buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  inline-size: 100%;
}

.plugin-market-detail-actions__downloads {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.4;
}

.plugin-market-detail-user-rating {
  margin-block-start: 1.25rem;
  padding-block-start: 1rem;
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.plugin-market-detail-user-rating__title {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
}

.plugin-market-detail-user-rating__controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  min-inline-size: 0;
}

@media (width < 360px) {
  .plugin-market-detail__content {
    padding-inline: 1rem;
  }

  .plugin-market-detail-actions__buttons {
    flex-direction: column;
  }

  .plugin-market-detail-actions__buttons :deep(.v-btn) {
    inline-size: 100%;
  }
}
</style>
