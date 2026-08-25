<script setup lang="ts">
import api from '@/api'
import { getPluginSourceOptions } from '@/api/pluginSource'
import type { Plugin, PluginReleaseVersion, PluginReleaseVersionsResponse, PluginSourceOptions } from '@/api/types'
import VersionHistory from '@/components/misc/VersionHistory.vue'
import { useI18n } from 'vue-i18n'

// 多语言
const { t, locale } = useI18n()

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
  showUpdateAction: {
    type: Boolean,
    default: false,
  },
  actionMode: {
    type: String as PropType<'install' | 'update'>,
    default: 'update',
  },
})

// 定义触发的自定义事件
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'close'): void
  (event: 'update', releaseVersion?: string, repoUrl?: string): void
  (event: 'sourceAction'): void
}>()

const loading = ref(false)
const loadError = ref('')
const pluginDetail = ref<Plugin | null>(null)
const releaseLoading = ref(false)
const releaseError = ref('')
const releaseDetail = ref<PluginReleaseVersionsResponse | null>(null)
const releaseRepoUrl = ref<string | null>(null)
const releaseSourceOptions = ref<PluginSourceOptions | null>(null)

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const resolvedPlugin = computed(() => pluginDetail.value ?? props.plugin)

const resolvedHistory = computed(() => {
  const history = { ...(resolvedPlugin.value?.history || {}) }
  releaseItems.value.forEach(item => {
    const key = normalizeHistoryVersion(item.version)
    if (!(key in history)) history[key] = item.body || ''
  })
  return history
})

const hasHistory = computed(() => Object.keys(resolvedHistory.value).length > 0)

const releaseItems = computed(() => releaseDetail.value?.items || [])

type ReleaseSourceAction = 'bind' | 'change' | 'unavailable'

const releaseSourceAction = computed<ReleaseSourceAction | null>(() => {
  if (props.actionMode !== 'update' || !releaseSourceOptions.value) return null

  const options = releaseSourceOptions.value
  const identity = options.identity
  const onlineCandidates = options.candidates.filter(
    candidate => candidate.source_type !== 'local' && Boolean(candidate.source_key && candidate.repo_url),
  )
  const hasTrustedOnlineSource = Boolean(
    identity && identity.trusted_source_type !== 'unknown' && identity.trusted_source_key,
  )

  if (!hasTrustedOnlineSource) {
    if (onlineCandidates.length > 0) return 'bind'
    return ['unavailable', 'incomplete', 'conflict'].includes(options.selection_status) ? 'unavailable' : null
  }

  if (['unavailable', 'incomplete'].includes(options.selection_status)) {
    if (
      options.selection_status === 'unavailable' &&
      onlineCandidates.some(candidate => candidate.source_key !== identity?.trusted_source_key)
    ) {
      return 'change'
    }
    return 'unavailable'
  }

  return null
})

const releaseSourceMessage = computed(() => {
  if (releaseSourceAction.value === 'bind') return t('plugin.sourceBindingHint')
  if (releaseSourceAction.value) return releaseSourceOptions.value?.selection_reason || t('plugin.sourceUnavailable')
  return ''
})

const latestActionText = computed(() =>
  releaseSourceAction.value === 'bind'
    ? t('plugin.bindSource')
    : releaseSourceAction.value === 'change'
      ? t('plugin.changeSource')
      : props.actionMode === 'install'
        ? t('plugin.installReleaseVersion')
        : t('plugin.updateToLatest'),
)

const shouldShowUpdatePanel = computed(() => props.showUpdateAction)

const releaseByHistoryVersion = computed(() => {
  const releaseMap = new Map<string, PluginReleaseVersion>()
  releaseItems.value.forEach(item => {
    releaseMap.set(normalizeHistoryVersion(item.version), item)
  })
  return releaseMap
})

function normalizeHistoryVersion(version: string) {
  return version.startsWith('v') ? version : `v${version}`
}

function formatReleaseDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(locale.value)
}

function releaseItemByHistoryVersion(version: string) {
  return releaseByHistoryVersion.value.get(version)
}

function shouldShowReleaseButton(item?: PluginReleaseVersion) {
  if (!item || item.is_current) return false
  if (releaseSourceAction.value === 'unavailable') return false
  if (releaseSourceAction.value) return Boolean(item.is_latest && !shouldShowUpdatePanel.value)
  return !(item.is_latest && shouldShowUpdatePanel.value && props.actionMode === 'update')
}

function isOnlineRepoUrl(repoUrl?: string | null): repoUrl is string {
  return Boolean(repoUrl && !repoUrl.startsWith('local://'))
}

/** 已安装插件的 Release 只读取可信在线来源，本地载荷路径不进入网络请求。 */
async function resolveReleaseRepoUrl(plugin: Plugin): Promise<string | null> {
  if (props.actionMode === 'install') {
    return isOnlineRepoUrl(plugin.repo_url) ? plugin.repo_url : null
  }

  const options = await getPluginSourceOptions(plugin.id)
  releaseSourceOptions.value = options
  const trustedSourceKey = options.identity?.trusted_source_key
  if (!trustedSourceKey) return null

  const candidate = options.candidates.find(
    item => item.source_type !== 'local' && item.source_key === trustedSourceKey && isOnlineRepoUrl(item.repo_url),
  )
  return candidate?.repo_url || null
}

async function loadPluginHistory() {
  if (!props.plugin?.id) {
    pluginDetail.value = null
    loadError.value = ''
    releaseDetail.value = null
    releaseError.value = ''
    releaseSourceOptions.value = null
    return
  }

  loading.value = true
  loadError.value = ''
  releaseDetail.value = null
  releaseError.value = ''
  releaseRepoUrl.value = null
  releaseSourceOptions.value = null

  // 插件市场条目已经携带远端信息；history 接口只查询已安装插件，
  // 未安装插件打开版本历史时只能基于传入的市场数据和 Release 列表展示。
  if (props.actionMode === 'install') {
    pluginDetail.value = null
    loading.value = false
    await loadPluginReleases(props.plugin, false)
    return
  }

  try {
    pluginDetail.value = await api.get(`plugin/history/${props.plugin.id}`, {
      params: {
        force: true,
      },
    })
    await loadPluginReleases(pluginDetail.value ?? props.plugin, true)
  } catch (error) {
    pluginDetail.value = null
    loadError.value = t('plugin.updateHistoryLoadFailed')
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function loadPluginReleases(plugin: Plugin | null | undefined = resolvedPlugin.value, force = false) {
  if (!plugin?.id || (props.actionMode === 'install' && !plugin.release)) {
    releaseDetail.value = null
    releaseError.value = ''
    releaseRepoUrl.value = null
    releaseSourceOptions.value = null
    return
  }

  releaseLoading.value = true
  releaseError.value = ''

  try {
    const repoUrl = await resolveReleaseRepoUrl(plugin)
    if (!plugin.release) {
      releaseDetail.value = null
      releaseRepoUrl.value = null
      return
    }
    releaseRepoUrl.value = repoUrl
    if (!repoUrl) {
      releaseDetail.value = null
      return
    }
    releaseDetail.value = await api.get(`plugin/releases/${plugin.id}`, {
      params: {
        repo_url: repoUrl,
        force,
      },
    })
  } catch (error) {
    releaseDetail.value = null
    releaseError.value = t('plugin.releaseVersionsLoadFailed')
    console.error(error)
  } finally {
    releaseLoading.value = false
  }
}

/** 根据来源准入状态执行更新，或转交来源绑定和切换。 */
function handleUpdate(releaseItem?: PluginReleaseVersion) {
  if (releaseSourceAction.value) {
    if (releaseSourceAction.value !== 'unavailable') emit('sourceAction')
    return
  }
  emit('update', releaseItem?.is_latest ? undefined : releaseItem?.version, releaseRepoUrl.value || undefined)
}

watch(
  () => [visible.value, props.plugin?.id],
  ([isVisible]) => {
    if (isVisible) {
      loadPluginHistory()
    }
  },
  { immediate: true },
)
</script>

<template>
  <VDialog v-if="visible" v-model="visible" width="680" max-height="85vh" scrollable>
    <VCard :title="t('plugin.updateHistoryTitle', { name: resolvedPlugin?.plugin_name })">
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VProgressLinear v-if="releaseLoading && !loading" indeterminate color="primary" height="2" />
      <div v-if="loading" class="plugin-version-history-dialog__loading">
        <VProgressCircular indeterminate color="primary" />
      </div>
      <template v-else>
        <VCardText v-if="loadError || releaseError" class="pb-0">
          <VAlert v-if="loadError" type="warning" variant="tonal" density="compact" :text="loadError" />
          <VAlert
            v-if="releaseError"
            type="warning"
            variant="tonal"
            density="compact"
            :class="{ 'mt-2': loadError }"
            :text="releaseError"
          />
        </VCardText>
        <VCardText v-if="releaseSourceMessage" class="pb-0">
          <VAlert
            :type="releaseSourceAction === 'unavailable' ? 'error' : 'warning'"
            variant="tonal"
            density="compact"
            :text="releaseSourceMessage"
          />
        </VCardText>
        <VCardText v-if="!hasHistory && !releaseLoading && !loadError && !releaseError">
          <VAlert type="info" variant="tonal" density="compact" :text="t('plugin.updateHistoryEmpty')" />
        </VCardText>
        <VersionHistory
          v-if="hasHistory"
          :history="resolvedHistory"
          :has-action="version => shouldShowReleaseButton(releaseItemByHistoryVersion(version))"
        >
          <template #meta="{ version }">
            <div v-if="releaseItemByHistoryVersion(version)" class="plugin-release-meta">
              <span
                v-if="formatReleaseDate(releaseItemByHistoryVersion(version)?.published_at)"
                class="plugin-release-meta__date"
              >
                {{ formatReleaseDate(releaseItemByHistoryVersion(version)?.published_at) }}
              </span>
              <VChip
                v-if="releaseItemByHistoryVersion(version)?.is_latest"
                size="x-small"
                color="primary"
                variant="tonal"
              >
                {{ t('plugin.latestVersion') }}
              </VChip>
              <VChip
                v-if="releaseItemByHistoryVersion(version)?.is_current"
                size="x-small"
                color="success"
                variant="tonal"
              >
                {{ t('plugin.currentVersion') }}
              </VChip>
            </div>
          </template>
          <template #action="{ version }">
            <VBtn
              v-if="shouldShowReleaseButton(releaseItemByHistoryVersion(version))"
              class="plugin-release-button"
              size="small"
              min-width="5rem"
              :color="releaseItemByHistoryVersion(version)?.is_latest ? 'primary' : undefined"
              :variant="releaseItemByHistoryVersion(version)?.is_latest ? 'flat' : 'tonal'"
              :disabled="
                releaseItemByHistoryVersion(version)?.is_current ||
                releaseSourceAction === 'unavailable' ||
                (releaseItemByHistoryVersion(version)?.is_latest && resolvedPlugin?.system_version_compatible === false)
              "
              @click.stop="handleUpdate(releaseItemByHistoryVersion(version))"
            >
              {{
                releaseItemByHistoryVersion(version)?.is_latest ? latestActionText : t('plugin.installReleaseVersion')
              }}
            </VBtn>
          </template>
        </VersionHistory>
      </template>
      <template v-if="shouldShowUpdatePanel">
        <VDivider />
        <VCardItem>
          <VAlert
            v-if="resolvedPlugin?.system_version_compatible === false"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
            :text="resolvedPlugin?.system_version_message || t('plugin.incompatibleSystemVersion')"
          />
          <VBtn
            @click="handleUpdate()"
            block
            :disabled="resolvedPlugin?.system_version_compatible === false || releaseSourceAction === 'unavailable'"
          >
            <template #prepend>
              <VIcon icon="mdi-arrow-up-circle-outline" />
            </template>
            {{ latestActionText }}
          </VBtn>
        </VCardItem>
      </template>
    </VCard>
  </VDialog>
</template>

<style scoped>
.plugin-version-history-dialog__loading {
  min-height: 12rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.plugin-release-button {
  white-space: nowrap;
}

.plugin-release-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  min-width: 0;
}

.plugin-release-meta__date {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
  font-size: 0.875rem;
  white-space: nowrap;
}
</style>
