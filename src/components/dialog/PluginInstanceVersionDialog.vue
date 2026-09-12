<script setup lang="ts">
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import { getApiErrorMessage } from '@/api'
import type {
  Plugin,
  PluginInstanceLogLevelOverview,
  PluginInstanceVersionBinding,
  PluginVersionOverview,
} from '@/api/types'
import {
  clearPluginInstanceDefaultTarget,
  clearPluginInstanceLogLevel,
  getInstalledPlugins,
  getPluginInstanceLogLevels,
  getPluginVersionOverview,
  recyclePluginVersions,
  resetPluginInstance,
  setPluginInstanceDefaultTarget,
  setPluginInstanceLogLevel,
  setPluginInstanceVersion,
} from '@/api/pluginVersion'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { usePluginCloneCreation, type PluginCloneSubmission } from '@/composables/usePluginCloneCreation'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const PluginCloneDialog = defineAsyncComponent(() => import('./PluginCloneDialog.vue'))
const PluginConfigDialog = defineAsyncComponent(() => import('./PluginConfigDialog.vue'))
const PluginInstanceUninstallDialog = defineAsyncComponent(() => import('./PluginInstanceUninstallDialog.vue'))

/** 单个实例合并版本绑定与日志等级后的展示行。 */
interface InstanceRow extends PluginInstanceVersionBinding {
  configuredLevel: string | null
  expiresAt: string | null
  effectiveLevel: string
}

// 多语言
const { t, locale } = useI18n()

// 显示器宽度
const display = useDisplay()

// 提示框
const $toast = useToast()

// 确认框
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
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'save'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const loading = ref(false)
const loadError = ref('')
const overview = ref<PluginVersionOverview | null>(null)
const logLevelOverview = ref<PluginInstanceLogLevelOverview | null>(null)
let dataLoadGeneration = 0

const recycling = ref(false)
const recycleOutcome = ref<{ removed: string[]; kept: Record<string, string> } | null>(null)

const versionEditingId = ref<string | null>(null)
const versionForm = reactive({ follow: true, pinnedVersion: '' })
const versionSavingId = ref<string | null>(null)

const logLevelEditingId = ref<string | null>(null)
const logLevelForm = reactive({ level: 'INFO', expiresAt: '' })
const logLevelSavingId = ref<string | null>(null)

const defaultTargetSavingId = ref<string | null>(null)

const rowActionBusyId = ref<string | null>(null)

// 卸载弹窗的目标实例
const uninstallTarget = ref<InstanceRow | null>(null)

// 分身创建流程，与插件卡片共用
const { createClone } = usePluginCloneCreation()

const cloning = ref(false)
// 已安装插件按 ID 索引：行只带实例 ID，打开配置与创建分身都需要完整插件对象
const installedPluginsById = ref<Map<string, Plugin>>(new Map())
let cloneDialogController: ReturnType<typeof openSharedDialog> | null = null
let configDialogController: ReturnType<typeof openSharedDialog> | null = null

/** 版本/日志等级/默认目标接口的正确入口 ID：分身卡片必须重定向到其源插件本体。 */
const effectivePluginId = computed(() =>
  props.plugin?.is_instance ? props.plugin?.source_plugin_id || props.plugin?.id : props.plugin?.id,
)

const installedVersions = computed(() => overview.value?.installed_versions ?? [])

// 版本元信息登记的当前版本，本体的「跟随」语义以它为准
const currentVersion = computed(() => overview.value?.current_version ?? null)

const installedVersionSelectItems = computed(() =>
  installedVersions.value.map(item => ({
    title: item.is_current ? `v${item.version} · ${t('plugin.versionCurrent')}` : `v${item.version}`,
    value: item.version,
  })),
)

const logLevelSelectItems = computed(() => [
  { title: t('setting.system.logLevelItems.debug'), value: 'DEBUG' },
  { title: t('setting.system.logLevelItems.info'), value: 'INFO' },
  { title: t('setting.system.logLevelItems.warning'), value: 'WARNING' },
  { title: t('setting.system.logLevelItems.error'), value: 'ERROR' },
  { title: t('setting.system.logLevelItems.critical'), value: 'CRITICAL' },
])

// 合并版本绑定与日志等级，得到每个实例的展示行
const instanceRows = computed<InstanceRow[]>(() => {
  const bindings = overview.value?.instances ?? []
  const levelById = new Map((logLevelOverview.value?.instances ?? []).map(item => [item.instance_id, item]))
  return bindings.map(binding => {
    const level = levelById.get(binding.instance_id)
    return {
      ...binding,
      configuredLevel: level?.configured_level ?? null,
      expiresAt: level?.expires_at ?? null,
      effectiveLevel: level?.effective_level ?? '-',
    }
  })
})

/** 把 ISO 时间转换为 datetime-local 输入框可直接使用的本地时间字符串。 */
function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 把 datetime-local 输入框的本地时间字符串转换为 ISO 时间，空值表示不设置失效时间。 */
function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** 格式化展示用的日期时间。 */
function formatDateTime(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.value)
}

/** 只在运行实例上展示实际版本；未运行或后端未给出时不猜。 */
function runningVersionForDisplay(item: InstanceRow): string | null {
  if (!item.running) return null
  return item.running_version || null
}

/** 并行加载插件版本总览与各实例日志等级设置。 */
async function loadData(): Promise<boolean> {
  const pluginId = effectivePluginId.value
  if (!pluginId) return false
  const generation = ++dataLoadGeneration
  loading.value = true
  loadError.value = ''
  try {
    const [overviewData, logLevelData] = await Promise.all([
      getPluginVersionOverview(pluginId),
      getPluginInstanceLogLevels(pluginId),
    ])
    if (generation !== dataLoadGeneration || !visible.value || effectivePluginId.value !== pluginId) {
      return false
    }
    overview.value = overviewData
    logLevelOverview.value = logLevelData
    return true
  } catch (error) {
    if (generation !== dataLoadGeneration || !visible.value || effectivePluginId.value !== pluginId) {
      return false
    }
    loadError.value = getApiErrorMessage(error) || t('plugin.versionManageLoadFailed')
    console.error(error)
    return false
  } finally {
    if (generation === dataLoadGeneration) {
      loading.value = false
    }
  }
}

/** 变更接口返回后重新读取权威状态，避免本地绑定与实际运行态脱节。 */
async function refreshAuthoritativeState(notifyParent = false) {
  const refreshed = await loadData()
  if (!refreshed) {
    $toast.error(t('plugin.versionManageRefreshFailed'))
  }
  if (notifyParent) emit('save')
}

/** 实例的展示名称；取不到名称时才回落到实例 ID。 */
function instanceLabel(item: InstanceRow): string {
  return item.plugin_name || item.instance_id
}

/** 打开版本绑定编辑器，并以实例当前绑定初始化表单。 */
function openVersionEditor(item: InstanceRow) {
  versionEditingId.value = item.instance_id
  versionForm.follow = !item.pinned_version
  versionForm.pinnedVersion =
    item.pinned_version || currentVersion.value || installedVersions.value.at(-1)?.version || ''
}

function closeVersionEditor() {
  versionEditingId.value = null
}

/**
 * 解析本次提交要写入的版本绑定。
 *
 * 本体不暴露「跟随／锚定」这组选择：它就是插件本身，能选的只有跑哪个版本。
 * 选中的正是插件当前版本时写成跟随，后续更新才能照常带着本体走；选了别的版本
 * 才钉住——否则一选中当前版本就被静默钉死，下次更新对本体不再生效。
 */
function resolveVersionBinding(item: InstanceRow): { follow: boolean; version: string } {
  if (!item.is_host) {
    return { follow: versionForm.follow, version: versionForm.pinnedVersion }
  }
  const selected = versionForm.pinnedVersion
  return { follow: Boolean(selected) && selected === currentVersion.value, version: selected }
}

/** 提交实例版本绑定切换，成功后刷新总览并通知父级卡片列表可能需要的状态刷新。 */
async function submitVersionChange(item: InstanceRow) {
  const binding = resolveVersionBinding(item)
  if (!binding.follow && !binding.version) return
  if (!effectivePluginId.value) return

  versionSavingId.value = item.instance_id
  try {
    await setPluginInstanceVersion(effectivePluginId.value, item.instance_id, {
      pinned_version: binding.follow ? null : binding.version,
    })
    $toast.success(t('plugin.versionSwitchSuccess'))
    closeVersionEditor()
    await refreshAuthoritativeState(true)
  } catch (error) {
    $toast.error(
      t('plugin.versionSwitchFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
    await refreshAuthoritativeState(true)
  } finally {
    versionSavingId.value = null
  }
}

/** 设置或取消实例的默认调用目标；设置时后端自动清除同插件的旧默认。 */
async function toggleDefaultTarget(item: InstanceRow) {
  if (!effectivePluginId.value) return

  defaultTargetSavingId.value = item.instance_id
  try {
    if (item.is_default_target) {
      await clearPluginInstanceDefaultTarget(effectivePluginId.value, item.instance_id)
      $toast.success(t('plugin.defaultTargetClearSuccess'))
    } else {
      await setPluginInstanceDefaultTarget(effectivePluginId.value, item.instance_id)
      $toast.success(t('plugin.defaultTargetSetSuccess'))
    }
    await refreshAuthoritativeState(true)
  } catch (error) {
    $toast.error(
      t('plugin.defaultTargetFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
    await refreshAuthoritativeState()
  } finally {
    defaultTargetSavingId.value = null
  }
}

/** 打开日志等级编辑器，默认展示已配置等级，未配置时展示当前生效等级。 */
function openLogLevelEditor(item: InstanceRow) {
  logLevelEditingId.value = item.instance_id
  logLevelForm.level = item.configuredLevel || item.effectiveLevel
  logLevelForm.expiresAt = toDatetimeLocalValue(item.expiresAt)
}

function closeLogLevelEditor() {
  logLevelEditingId.value = null
}

/** 提交实例日志等级覆盖，运行期立即生效。 */
async function submitLogLevel(item: InstanceRow) {
  if (!effectivePluginId.value || !logLevelForm.level) return

  logLevelSavingId.value = item.instance_id
  try {
    await setPluginInstanceLogLevel(effectivePluginId.value, item.instance_id, {
      level: logLevelForm.level,
      expires_at: fromDatetimeLocalValue(logLevelForm.expiresAt),
    })
    $toast.success(t('plugin.logLevelSetSuccess'))
    closeLogLevelEditor()
    await refreshAuthoritativeState()
  } catch (error) {
    $toast.error(
      t('plugin.logLevelSetFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
    await refreshAuthoritativeState()
  } finally {
    logLevelSavingId.value = null
  }
}

/** 清除实例的日志等级覆盖，立即回落全局等级。 */
async function clearLogLevel(item: InstanceRow) {
  if (!effectivePluginId.value) return

  logLevelSavingId.value = item.instance_id
  try {
    await clearPluginInstanceLogLevel(effectivePluginId.value, item.instance_id)
    $toast.success(t('plugin.logLevelClearSuccess'))
    closeLogLevelEditor()
    await refreshAuthoritativeState()
  } catch (error) {
    $toast.error(
      t('plugin.logLevelClearFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
    await refreshAuthoritativeState()
  } finally {
    logLevelSavingId.value = null
  }
}

/** 读取已安装插件索引；失败只让「打开配置/创建分身」不可用，不影响版本管理本身。 */
async function loadInstalledPlugins() {
  try {
    const plugins = await getInstalledPlugins()
    installedPluginsById.value = new Map(plugins.map(item => [item.id ?? '', item]))
  } catch (error) {
    console.error(error)
  }
}

/** 按实例 ID 取完整插件对象，大小写不敏感——注册表键与实例登记 ID 可能只差大小写。 */
function pluginForInstance(instanceId: string): Plugin | undefined {
  const exact = installedPluginsById.value.get(instanceId)
  if (exact) return exact
  const target = instanceId.toLowerCase()
  return [...installedPluginsById.value.values()].find(item => (item.id ?? '').toLowerCase() === target)
}

const sourcePlugin = computed(() => (effectivePluginId.value ? pluginForInstance(effectivePluginId.value) : undefined))

/** 打开某个实例自己的配置弹窗。分身与本体的配置各自独立，进入的是这一个实例。 */
function openInstanceConfig(item: InstanceRow) {
  const target = pluginForInstance(item.instance_id)
  if (!target) {
    $toast.error(t('plugin.instanceOpenUnavailable', { name: instanceLabel(item) }))
    return
  }
  configDialogController?.close()
  configDialogController = openSharedDialog(
    PluginConfigDialog,
    { plugin: target },
    { save: () => void refreshAuthoritativeState(true) },
    { closeOn: ['close'] },
  )
}

/** 从版本与实例里直接创建分身，源插件固定为当前本体，不受打开入口是分身卡片影响。 */
function openCloneCreation() {
  if (!sourcePlugin.value) {
    $toast.error(t('plugin.instanceOpenUnavailable', { name: props.plugin?.plugin_name || '' }))
    return
  }
  cloneDialogController?.close()
  cloneDialogController = openSharedDialog(
    PluginCloneDialog,
    { plugin: sourcePlugin.value },
    { clone: submitCloneCreation },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 执行分身创建，成功后刷新总览与已装插件索引，让新分身立刻出现在实例列表里。 */
async function submitCloneCreation(form: PluginCloneSubmission) {
  if (!effectivePluginId.value) return

  cloning.value = true
  try {
    const outcome = await createClone(effectivePluginId.value, form)
    if (!outcome.success) {
      $toast.error(outcome.message)
      return
    }
    // 恢复一个旧分身却提示「创建成功」会让人以为又多了一个
    $toast.success(
      t(form.restore_previous ? 'plugin.cloneRestoreSuccess' : 'plugin.cloneSuccess', {
        name: form.name || outcome.cloneId,
      }),
    )
    cloneDialogController?.close()
    cloneDialogController = null
    await loadInstalledPlugins()
    await refreshAuthoritativeState(true)
  } finally {
    cloning.value = false
  }
}

/** 本体行之外的全部分身名称，用于级联卸载的确认文案。 */
const cloneLabels = computed(() => instanceRows.value.filter(item => !item.is_host).map(instanceLabel))

/** 重置单个实例的配置与业务数据；本体与分身的配置键和数据互相隔离，各重置各的。 */
async function resetInstance(item: InstanceRow) {
  const confirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: t('plugin.instanceResetConfirm', { name: instanceLabel(item) }),
  })
  if (!confirmed) return

  rowActionBusyId.value = item.instance_id
  try {
    await resetPluginInstance(item.instance_id)
    $toast.success(t('plugin.instanceResetSuccess', { name: instanceLabel(item) }))
    await refreshAuthoritativeState(true)
  } catch (error) {
    $toast.error(
      t('plugin.instanceResetFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
    await refreshAuthoritativeState(true)
  } finally {
    rowActionBusyId.value = null
  }
}

/**
 * 打开卸载弹窗。
 *
 * 卸载不再走一次性确认框：它默认保留配置与业务数据，同时允许顺带勾选要一并清除
 * 的内容，这两件事都得在弹窗里说清楚，一行确认文案承载不了。
 */
function openUninstallDialog(item: InstanceRow) {
  uninstallTarget.value = item
}

/** 卸载完成后刷新权威状态；本体级联卸载后整个对话框要关掉。 */
async function onInstanceUninstalled() {
  const wasHost = uninstallTarget.value?.is_host === true
  uninstallTarget.value = null
  emit('save')
  if (wasHost) {
    visible.value = false
    return
  }
  await refreshAuthoritativeState()
}

/** 手动触发回收不再被任何实例引用、也不在最近版本窗口内的已装版本目录。 */
async function recycleVersions() {
  if (!effectivePluginId.value) return

  const confirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: t('plugin.versionRecycleConfirm'),
  })
  if (!confirmed) return

  recycling.value = true
  try {
    const outcome = await recyclePluginVersions(effectivePluginId.value)
    recycleOutcome.value = outcome
    if (outcome.removed.length > 0) {
      $toast.success(t('plugin.versionRecycleSuccess', { count: outcome.removed.length }))
    } else {
      $toast.info(t('plugin.versionRecycleNothing'))
    }
    await refreshAuthoritativeState()
  } catch (error) {
    $toast.error(
      t('plugin.versionRecycleFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
    await refreshAuthoritativeState()
  } finally {
    recycling.value = false
  }
}

watch(
  () => [visible.value, effectivePluginId.value],
  ([isVisible]) => {
    if (isVisible) {
      recycleOutcome.value = null
      versionEditingId.value = null
      logLevelEditingId.value = null
      void loadData()
      void loadInstalledPlugins()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  cloneDialogController?.close()
  configDialogController?.close()
})
</script>

<template>
  <VDialog
    v-if="visible"
    v-model="visible"
    width="920"
    max-height="88vh"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-source-branch" class="me-2" />
        </template>
        <VCardTitle>{{ t('plugin.versionManageTitle', { name: props.plugin?.plugin_name }) }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />

      <div v-if="loading" class="plugin-instance-version-dialog__loading">
        <VProgressCircular indeterminate color="primary" />
      </div>

      <VCardText v-else-if="loadError">
        <VAlert type="error" variant="tonal" density="compact" :text="loadError" />
        <VBtn class="mt-3" color="primary" variant="tonal" @click="loadData">{{ t('common.retry') }}</VBtn>
      </VCardText>

      <template v-else>
        <VCardText>
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="text-subtitle-2">{{ t('plugin.installedVersionsTitle') }}</div>
            <VBtn
              size="small"
              color="warning"
              variant="tonal"
              prepend-icon="mdi-delete-sweep-outline"
              :loading="recycling"
              @click="recycleVersions"
            >
              {{ t('plugin.versionRecycle') }}
            </VBtn>
          </div>

          <div class="plugin-instance-version-dialog__table-scroll">
            <VTable density="compact">
              <thead>
                <tr>
                  <th>{{ t('plugin.versionColumnVersion') }}</th>
                  <th>{{ t('plugin.versionColumnSource') }}</th>
                  <th>{{ t('plugin.versionColumnInstalledAt') }}</th>
                  <th>{{ t('plugin.versionColumnStatus') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in installedVersions" :key="item.version">
                  <td>
                    <code>v{{ item.version }}</code>
                  </td>
                  <td>{{ item.source || '-' }}</td>
                  <td>{{ formatDateTime(item.installed_at) || '-' }}</td>
                  <td>
                    <VChip v-if="item.is_current" size="small" color="success" variant="tonal">
                      {{ t('plugin.versionCurrent') }}
                    </VChip>
                    <span v-else>-</span>
                  </td>
                </tr>
                <tr v-if="installedVersions.length === 0">
                  <td colspan="4" class="text-medium-emphasis">{{ t('plugin.installedVersionsEmpty') }}</td>
                </tr>
              </tbody>
            </VTable>
          </div>

          <VAlert
            v-if="recycleOutcome"
            class="mt-3"
            :type="recycleOutcome.removed.length > 0 ? 'success' : 'info'"
            variant="tonal"
            density="compact"
          >
            <div>
              {{
                recycleOutcome.removed.length > 0
                  ? t('plugin.versionRecycleRemoved', { versions: recycleOutcome.removed.map(v => `v${v}`).join('、') })
                  : t('plugin.versionRecycleNothingRemoved')
              }}
            </div>
            <div v-if="Object.keys(recycleOutcome.kept).length > 0" class="mt-2">
              <div class="text-caption font-weight-medium">{{ t('plugin.versionRecycleKeptTitle') }}</div>
              <ul class="plugin-instance-version-dialog__kept-list">
                <li v-for="(reason, version) in recycleOutcome.kept" :key="version">v{{ version }} — {{ reason }}</li>
              </ul>
            </div>
          </VAlert>
        </VCardText>

        <VDivider />

        <VCardText>
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="text-subtitle-2">{{ t('plugin.instancesTitle') }}</div>
            <VBtn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-content-copy"
              :loading="cloning"
              data-testid="instance-create-clone"
              @click="openCloneCreation"
            >
              {{ t('plugin.createClone') }}
            </VBtn>
          </div>

          <div class="plugin-instance-version-dialog__cards">
            <VCard
              v-for="item in instanceRows"
              :key="item.instance_id"
              variant="outlined"
              class="plugin-instance-card"
              :data-testid="`instance-card-${item.instance_id}`"
            >
              <VCardText class="pa-3">
                <div class="d-flex align-start ga-2">
                  <div class="flex-grow-1 min-width-0">
                    <div class="d-flex align-center ga-1 flex-wrap">
                      <span class="text-subtitle-2 text-truncate">{{ item.plugin_name || '-' }}</span>
                      <VChip size="x-small" variant="tonal" :color="item.is_host ? 'primary' : 'secondary'">
                        {{ item.is_host ? t('plugin.instanceHost') : t('plugin.instanceClone') }}
                      </VChip>
                      <VBtn
                        icon
                        size="x-small"
                        variant="text"
                        :color="item.is_default_target ? 'warning' : undefined"
                        :loading="defaultTargetSavingId === item.instance_id"
                        :aria-label="
                          item.is_default_target ? t('plugin.defaultTargetClear') : t('plugin.defaultTargetSet')
                        "
                        @click="toggleDefaultTarget(item)"
                      >
                        <VIcon size="16" :icon="item.is_default_target ? 'mdi-star' : 'mdi-star-outline'" />
                        <VTooltip activator="parent" location="top">
                          {{ item.is_default_target ? t('plugin.defaultTargetClear') : t('plugin.defaultTargetSet') }}
                        </VTooltip>
                      </VBtn>
                    </div>
                    <div class="d-flex align-center ga-1 flex-wrap mt-1">
                      <VChip size="x-small" variant="tonal" :color="item.running ? 'success' : 'secondary'">
                        {{ item.running ? t('plugin.instanceRunning') : t('plugin.instanceStopped') }}
                      </VChip>
                      <span v-if="runningVersionForDisplay(item)" class="text-caption text-medium-emphasis">
                        v{{ runningVersionForDisplay(item) }}
                      </span>
                      <span v-else-if="item.running" class="text-caption text-medium-emphasis">
                        {{ t('plugin.instanceVersionUnknown') }}
                      </span>
                      <span v-else class="text-caption text-medium-emphasis">
                        {{ t('plugin.instanceVersionNotStarted') }}
                      </span>
                    </div>
                  </div>

                  <div class="d-flex align-center flex-shrink-0">
                    <VMenu location="bottom end">
                      <template #activator="{ props: actionProps }">
                        <VBtn
                          v-bind="actionProps"
                          icon
                          size="small"
                          variant="text"
                          :loading="rowActionBusyId === item.instance_id"
                          :aria-label="t('plugin.instanceColumnActions')"
                          :data-testid="`instance-actions-${item.instance_id}`"
                        >
                          <VIcon icon="mdi-dots-horizontal" />
                        </VBtn>
                      </template>
                      <VList density="compact">
                        <VListItem
                          prepend-icon="mdi-open-in-app"
                          :title="t('plugin.instanceActionOpen')"
                          :data-testid="`instance-action-open-${item.instance_id}`"
                          @click="openInstanceConfig(item)"
                        />
                        <VListItem
                          prepend-icon="mdi-source-branch"
                          :title="t('plugin.instanceActionSwitchVersion')"
                          :data-testid="`instance-action-version-${item.instance_id}`"
                          @click="openVersionEditor(item)"
                        />
                        <VListItem
                          prepend-icon="mdi-text-box-search-outline"
                          :title="t('plugin.instanceActionLogLevel')"
                          :data-testid="`instance-action-loglevel-${item.instance_id}`"
                          @click="openLogLevelEditor(item)"
                        />
                        <VListItem
                          prepend-icon="mdi-backup-restore"
                          :title="t('plugin.instanceActionReset')"
                          :data-testid="`instance-action-reset-${item.instance_id}`"
                          @click="resetInstance(item)"
                        />
                        <VDivider />
                        <VListItem
                          class="text-error"
                          prepend-icon="mdi-trash-can-outline"
                          :title="
                            item.is_host
                              ? t('plugin.instanceActionUninstallHost')
                              : t('plugin.instanceActionUninstallClone')
                          "
                          :data-testid="`instance-action-uninstall-${item.instance_id}`"
                          @click="openUninstallDialog(item)"
                        />
                      </VList>
                    </VMenu>
                  </div>
                </div>

                <VDivider class="my-2" />

                <div class="d-flex align-center ga-2 flex-wrap">
                  <VMenu
                    :model-value="versionEditingId === item.instance_id"
                    :close-on-content-click="false"
                    location="bottom start"
                    @update:model-value="value => !value && closeVersionEditor()"
                  >
                    <template #activator="{ props: menuProps }">
                      <VChip
                        v-bind="menuProps"
                        size="small"
                        variant="tonal"
                        :color="item.pinned_version ? 'info' : 'secondary'"
                        class="cursor-pointer"
                        :data-testid="`instance-version-chip-${item.instance_id}`"
                        @click="openVersionEditor(item)"
                      >
                        <VIcon start size="14" icon="mdi-source-branch" />
                        <template v-if="item.is_host"> v{{ item.pinned_version || currentVersion || '-' }} </template>
                        <template v-else>
                          {{
                            item.pinned_version
                              ? t('plugin.versionPinned', { version: item.pinned_version })
                              : t('plugin.versionFollowCurrent')
                          }}
                        </template>
                      </VChip>
                    </template>
                    <VCard min-width="300">
                      <VCardText>
                        <!-- 本体就是插件本身，「跟随当前版本」对它是循环定义，只给版本选择 -->
                        <VRadioGroup v-if="!item.is_host" v-model="versionForm.follow" density="compact" hide-details>
                          <VRadio :label="t('plugin.versionFollowCurrent')" :value="true" />
                          <VRadio :label="t('plugin.versionPinnedOption')" :value="false" />
                        </VRadioGroup>
                        <VSelect
                          v-if="item.is_host || !versionForm.follow"
                          v-model="versionForm.pinnedVersion"
                          :items="installedVersionSelectItems"
                          :label="t('plugin.versionSelectLabel')"
                          density="compact"
                          class="mt-2"
                          hide-details
                        />
                        <VAlert
                          type="warning"
                          density="compact"
                          variant="tonal"
                          class="mt-3"
                          :text="t('plugin.versionSwitchNotice')"
                        />
                      </VCardText>
                      <VCardActions>
                        <VSpacer />
                        <VBtn size="small" variant="text" @click="closeVersionEditor">{{ t('common.cancel') }}</VBtn>
                        <VBtn
                          size="small"
                          color="primary"
                          variant="flat"
                          :loading="versionSavingId === item.instance_id"
                          :disabled="!item.is_host && !versionForm.follow && !versionForm.pinnedVersion"
                          @click="submitVersionChange(item)"
                        >
                          {{ t('common.confirm') }}
                        </VBtn>
                      </VCardActions>
                    </VCard>
                  </VMenu>

                  <VMenu
                    :model-value="logLevelEditingId === item.instance_id"
                    :close-on-content-click="false"
                    location="bottom start"
                    @update:model-value="value => !value && closeLogLevelEditor()"
                  >
                    <template #activator="{ props: menuProps }">
                      <div
                        v-bind="menuProps"
                        class="d-flex align-center ga-1 cursor-pointer"
                        @click="openLogLevelEditor(item)"
                      >
                        <VChip size="small" variant="tonal" :color="item.configuredLevel ? 'info' : 'secondary'">
                          <VIcon start size="14" icon="mdi-text-box-search-outline" />
                          {{
                            item.configuredLevel
                              ? t('plugin.logLevelConfigured', { level: item.configuredLevel })
                              : t('plugin.logLevelFollowGlobal')
                          }}
                        </VChip>
                        <span class="text-caption text-medium-emphasis">
                          {{ t('plugin.logLevelEffective', { level: item.effectiveLevel }) }}
                        </span>
                      </div>
                    </template>
                    <VCard min-width="300">
                      <VCardText>
                        <VSelect
                          v-model="logLevelForm.level"
                          :items="logLevelSelectItems"
                          :label="t('plugin.logLevelSelectLabel')"
                          density="compact"
                          hide-details
                        />
                        <VTextField
                          v-model="logLevelForm.expiresAt"
                          type="datetime-local"
                          :label="t('plugin.logLevelExpiresLabel')"
                          :hint="t('plugin.logLevelExpiresHint')"
                          persistent-hint
                          density="compact"
                          class="mt-3"
                        />
                      </VCardText>
                      <VCardActions>
                        <VBtn
                          v-if="item.configuredLevel"
                          size="small"
                          color="warning"
                          variant="text"
                          :loading="logLevelSavingId === item.instance_id"
                          @click="clearLogLevel(item)"
                        >
                          {{ t('plugin.logLevelClear') }}
                        </VBtn>
                        <VSpacer />
                        <VBtn size="small" variant="text" @click="closeLogLevelEditor">{{ t('common.cancel') }}</VBtn>
                        <VBtn
                          size="small"
                          color="primary"
                          variant="flat"
                          :loading="logLevelSavingId === item.instance_id"
                          @click="submitLogLevel(item)"
                        >
                          {{ t('common.confirm') }}
                        </VBtn>
                      </VCardActions>
                    </VCard>
                  </VMenu>
                </div>
              </VCardText>
            </VCard>

            <div v-if="instanceRows.length === 0" class="text-medium-emphasis text-body-2 pa-3">
              {{ t('plugin.instancesEmpty') }}
            </div>
          </div>

          <div class="text-caption text-medium-emphasis mt-2">
            <VIcon icon="mdi-information-outline" size="14" class="me-1" />
            {{ t('plugin.defaultTargetOnlyOneHint') }}
          </div>
        </VCardText>
      </template>
    </VCard>

    <PluginInstanceUninstallDialog
      v-if="uninstallTarget"
      :model-value="true"
      :instance-id="uninstallTarget.instance_id"
      :instance-name="instanceLabel(uninstallTarget)"
      :is-host="uninstallTarget.is_host"
      :clone-labels="cloneLabels"
      @uninstalled="onInstanceUninstalled"
      @close="uninstallTarget = null"
    />
  </VDialog>
</template>

<style scoped>
.plugin-instance-version-dialog__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-block-size: 12rem;
}

.plugin-instance-version-dialog__table-scroll {
  overflow-x: auto;
}

.plugin-instance-version-dialog__cards {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
}

.min-width-0 {
  min-inline-size: 0;
}

.plugin-instance-version-dialog__kept-list {
  margin: 0;
  padding-inline-start: 1.25rem;
  font-size: 0.8125rem;
}
</style>
