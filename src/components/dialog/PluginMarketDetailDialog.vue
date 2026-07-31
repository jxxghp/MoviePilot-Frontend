<script lang="ts" setup>
import api from '@/api'
import type { ApiResponse, Plugin, PluginRating } from '@/api/types'
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
const emit = defineEmits(['update:modelValue', 'close', 'install'])

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

// 图片对象
const imageRef = ref<any>()

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
  if (repoUrl) {
    if (repoUrl.includes('raw.githubusercontent.com')) {
      if (!repoUrl.endsWith('/')) repoUrl += '/'

      if (repoUrl.split('/').length < 6) repoUrl = `${repoUrl}main/`

      try {
        const [user, repo] = repoUrl.split('/').slice(-4, -2)
        repoUrl = `https://github.com/${user}/${repo}`
      } catch (error) {
        return
      }
    }
  } else {
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

  try {
    showInstallProgress(
      isInstalled.value && !releaseVersion
        ? t('plugin.updating', { name: props.plugin?.plugin_name })
        : t('plugin.installing', {
            name: props.plugin?.plugin_name,
            version: releaseVersion || props?.plugin?.plugin_version,
          }),
    )

    const result: { [key: string]: any } = await api.get(`plugin/install/${props.plugin?.id}`, {
      params: {
        repo_url: repoUrl || props.plugin?.repo_url,
        release_version: releaseVersion,
        force: props.plugin?.has_update || Boolean(releaseVersion),
      },
    })

    closeInstallProgress()

    if (result.success) {
      $toast.success(
        isInstalled.value
          ? t('plugin.updateSuccess', { name: props.plugin?.plugin_name })
          : t('plugin.installSuccess', { name: props.plugin?.plugin_name }),
      )
      versionHistoryDialogController?.close()
      versionHistoryDialogController = null
      visible.value = false
      emit('install')
    } else {
      $toast.error(t('plugin.installFailed', { name: props.plugin?.plugin_name, message: result.message }))
    }
  } catch (error) {
    closeInstallProgress()
    console.error(error)
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
    const result: ApiResponse<PluginRating> = await api.post(`plugin/rating/${props.plugin.id}`, {
      rating: selectedRating.value,
    })
    if (result.success) {
      rating.value = result.data
      selectedRating.value = result.data.user_rating || selectedRating.value
      $toast.success(t('plugin.ratingSuccess', { name: props.plugin?.plugin_name }))
    } else {
      $toast.error(t('plugin.ratingFailed', { message: result.message || t('common.unknown') }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('plugin.ratingFailed', { message: t('common.serverConnectionFailed') }))
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
  <VDialog v-if="visible" v-model="visible" max-width="30rem">
    <VCard>
      <VDialogCloseBtn v-model="visible" />
      <VCardText>
        <VCol>
          <div class="d-flex justify-space-between flex-wrap flex-md-nowrap flex-column flex-md-row">
            <div class="mx-auto mt-5">
              <VAvatar size="64">
                <VImg ref="imageRef" :src="pluginIconPath()" aspect-ratio="4/3" cover @error="imageLoadError = true" />
              </VAvatar>
            </div>
            <div class="flex-grow">
              <VCardItem>
                <VCardTitle class="text-center text-md-left">
                  {{ props.plugin?.plugin_name }}
                </VCardTitle>
                <VCardSubtitle
                  class="text-center text-md-left break-words whitespace-break-spaces line-clamp-4 overflow-hidden text-ellipsis ..."
                >
                  {{ props.plugin?.plugin_desc }}
                </VCardSubtitle>
                <VList lines="one" class="border-0">
                  <VListItem class="ps-0">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('common.version') }}：</span>
                      <span class="text-body-1"> v{{ props.plugin?.plugin_version }}</span>
                    </VListItemTitle>
                  </VListItem>
                  <VListItem class="ps-0">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('common.author') }}：</span>
                      <span class="text-body-1 cursor-pointer" @click="visitPluginPage">
                        {{ props.plugin?.plugin_author }}
                      </span>
                    </VListItemTitle>
                  </VListItem>
                  <VListItem v-if="props.plugin?.system_version" class="ps-0">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('plugin.systemVersion') }}：</span>
                      <span class="text-body-1">{{ props.plugin?.system_version }}</span>
                    </VListItemTitle>
                  </VListItem>
                  <VListItem v-if="rating.rating_count > 0" class="ps-0">
                    <VListItemTitle class="plugin-market-detail-rating-row text-center text-md-left">
                      <span class="font-weight-medium">{{ t('plugin.rating') }}：</span>
                      <PluginRatingDisplay
                        :rating="rating.average_rating"
                        :count="rating.rating_count"
                        :icon-size="18"
                      />
                    </VListItemTitle>
                  </VListItem>
                </VList>
                <VAlert
                  v-if="props.plugin?.system_version_compatible === false"
                  type="warning"
                  variant="tonal"
                  density="compact"
                  class="mb-3"
                  :text="props.plugin?.system_version_message || t('plugin.incompatibleSystemVersion')"
                />
                <div class="plugin-market-detail-actions">
                  <div class="plugin-market-detail-actions__buttons">
                    <VBtn
                      v-if="!isInstalled"
                      color="primary"
                      @click="installPlugin()"
                      prepend-icon="mdi-download"
                      :disabled="props.plugin?.system_version_compatible === false"
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
                    <VBtn variant="tonal" @click="showUpdateHistory" prepend-icon="mdi-update">
                      {{ t('plugin.versionHistory') }}
                    </VBtn>
                  </div>
                  <div class="plugin-market-detail-actions__downloads" v-if="props.count">
                    <VIcon icon="mdi-fire" />
                    {{ t('plugin.totalDownloads', { count: formatDownloadCount(props.count) }) }}
                  </div>
                </div>
                <div v-if="isInstalled" class="plugin-market-detail-user-rating mt-5">
                  <div class="text-body-2 font-weight-medium mb-2">
                    {{ t('plugin.yourRating') }}
                  </div>
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
                </div>
              </VCardItem>
            </div>
          </div>
        </VCol>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.plugin-market-detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.plugin-market-detail-actions__buttons {
  /* 窄屏换行时用统一 gap 控制按钮间距，避免第二个按钮带左边距导致视觉偏移。 */
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.plugin-market-detail-actions__downloads {
  flex-basis: 100%;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  text-align: center;
}

.plugin-market-detail-rating-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  flex-wrap: wrap;
  white-space: normal;
}

.plugin-market-detail-user-rating {
  padding-block-start: 1rem;
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.plugin-market-detail-user-rating__controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

@media (width >= 960px) {
  .plugin-market-detail-actions {
    justify-content: flex-start;
  }

  .plugin-market-detail-actions__buttons {
    justify-content: flex-start;
  }

  .plugin-market-detail-actions__downloads {
    text-align: start;
  }

  .plugin-market-detail-rating-row {
    justify-content: flex-start;
  }
}
</style>
