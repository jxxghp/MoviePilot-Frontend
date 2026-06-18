<script setup lang="ts">
import api from '@/api'
import type { Plugin, PluginReleaseVersion, PluginReleaseVersionsResponse } from '@/api/types'
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
}>()

const loading = ref(false)
const loadError = ref('')
const pluginDetail = ref<Plugin | null>(null)
const releaseLoading = ref(false)
const releaseError = ref('')
const releaseDetail = ref<PluginReleaseVersionsResponse | null>(null)

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

const latestActionText = computed(() => props.actionMode === 'install' ? t('plugin.installReleaseVersion') : t('plugin.updateToLatest'))

const releaseItems = computed(() => releaseDetail.value?.items || [])

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
  return !(item.is_latest && shouldShowUpdatePanel.value && props.actionMode === 'update')
}

async function loadPluginHistory() {
  if (!props.plugin?.id) {
    pluginDetail.value = null
    loadError.value = ''
    releaseDetail.value = null
    releaseError.value = ''
    return
  }

  loading.value = true
  loadError.value = ''
  releaseDetail.value = null
  releaseError.value = ''

  // 插件市场条目已经携带远端信息；history 接口只查询已安装插件，
  // 未安装插件打开版本历史时只能基于传入的市场数据和 Release 列表展示。
  if (props.actionMode === 'install' && props.plugin?.repo_url) {
    pluginDetail.value = null
    loading.value = false
    loadPluginReleases(props.plugin, false)
    return
  }

  try {
    pluginDetail.value = await api.get(`plugin/history/${props.plugin.id}`, {
      params: {
        force: true,
      },
    })
    loadPluginReleases(pluginDetail.value ?? props.plugin, true)
  } catch (error) {
    pluginDetail.value = null
    loadError.value = t('plugin.updateHistoryLoadFailed')
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function loadPluginReleases(plugin: Plugin | null | undefined = resolvedPlugin.value, force = false) {
  if (!plugin?.id || !plugin?.repo_url || !plugin?.release) {
    releaseDetail.value = null
    releaseError.value = ''
    return
  }

  releaseLoading.value = true
  releaseError.value = ''

  try {
    releaseDetail.value = await api.get(`plugin/releases/${plugin.id}`, {
      params: {
        repo_url: plugin.repo_url,
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

/** 触发插件更新操作。 */
function handleUpdate(releaseItem?: PluginReleaseVersion) {
  emit('update', releaseItem?.is_latest ? undefined : releaseItem?.version, resolvedPlugin.value?.repo_url)
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
      <VCardText v-else-if="loadError && !hasHistory">
        <VAlert type="warning" variant="tonal" density="compact" :text="loadError" />
      </VCardText>
      <VCardText v-else-if="!hasHistory && !releaseLoading">
        <VAlert type="info" variant="tonal" density="compact" :text="t('plugin.updateHistoryEmpty')" />
      </VCardText>
      <template v-else>
        <VCardText v-if="releaseError" class="pb-0">
          <VAlert type="warning" variant="tonal" density="compact" :text="releaseError" />
        </VCardText>
        <VersionHistory
          :history="resolvedHistory"
          :has-action="version => shouldShowReleaseButton(releaseItemByHistoryVersion(version))"
        >
          <template #meta="{ version }">
            <div v-if="releaseItemByHistoryVersion(version)" class="plugin-release-meta">
              <span v-if="formatReleaseDate(releaseItemByHistoryVersion(version)?.published_at)" class="plugin-release-meta__date">
                {{ formatReleaseDate(releaseItemByHistoryVersion(version)?.published_at) }}
              </span>
              <VChip v-if="releaseItemByHistoryVersion(version)?.is_latest" size="x-small" color="primary" variant="tonal">
                {{ t('plugin.latestVersion') }}
              </VChip>
              <VChip v-if="releaseItemByHistoryVersion(version)?.is_current" size="x-small" color="success" variant="tonal">
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
                (releaseItemByHistoryVersion(version)?.is_latest && resolvedPlugin?.system_version_compatible === false)
              "
              @click.stop="handleUpdate(releaseItemByHistoryVersion(version))"
            >
              {{
                releaseItemByHistoryVersion(version)?.is_latest
                    ? latestActionText
                    : t('plugin.installReleaseVersion')
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
            :disabled="resolvedPlugin?.system_version_compatible === false"
          >
            <template #prepend>
              <VIcon icon="mdi-arrow-up-circle-outline" />
            </template>
            {{ t('plugin.updateToLatest') }}
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
