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
  getPluginInstanceLogLevels,
  getPluginVersionOverview,
  recyclePluginVersions,
  setPluginInstanceDefaultTarget,
  setPluginInstanceLogLevel,
  setPluginInstanceVersion,
} from '@/api/pluginVersion'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

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

const recycling = ref(false)
const recycleOutcome = ref<{ removed: string[]; kept: Record<string, string> } | null>(null)

const versionEditingId = ref<string | null>(null)
const versionForm = reactive({ follow: true, pinnedVersion: '' })
const versionSavingId = ref<string | null>(null)

const logLevelEditingId = ref<string | null>(null)
const logLevelForm = reactive({ level: 'INFO', expiresAt: '' })
const logLevelSavingId = ref<string | null>(null)

const defaultTargetSavingId = ref<string | null>(null)

/** 版本/日志等级/默认目标接口的正确入口 ID：分身卡片必须重定向到其源插件本体。 */
const effectivePluginId = computed(() =>
  props.plugin?.is_instance ? props.plugin?.source_plugin_id || props.plugin?.id : props.plugin?.id,
)

const installedVersions = computed(() => overview.value?.installed_versions ?? [])

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

/** 并行加载插件版本总览与各实例日志等级设置。 */
async function loadData() {
  if (!effectivePluginId.value) return
  loading.value = true
  loadError.value = ''
  try {
    const [overviewData, logLevelData] = await Promise.all([
      getPluginVersionOverview(effectivePluginId.value),
      getPluginInstanceLogLevels(effectivePluginId.value),
    ])
    overview.value = overviewData
    logLevelOverview.value = logLevelData
  } catch (error) {
    loadError.value = getApiErrorMessage(error) || t('plugin.versionManageLoadFailed')
    console.error(error)
  } finally {
    loading.value = false
  }
}

/** 打开版本绑定编辑器，并以实例当前绑定初始化表单。 */
function openVersionEditor(item: InstanceRow) {
  versionEditingId.value = item.instance_id
  versionForm.follow = item.follow_current_version
  versionForm.pinnedVersion = item.plugin_version || installedVersions.value.at(-1)?.version || ''
}

function closeVersionEditor() {
  versionEditingId.value = null
}

/** 提交实例版本绑定切换，成功后刷新总览并通知父级卡片列表可能需要的状态刷新。 */
async function submitVersionChange(item: InstanceRow) {
  if (!versionForm.follow && !versionForm.pinnedVersion) return
  if (!effectivePluginId.value) return

  versionSavingId.value = item.instance_id
  try {
    await setPluginInstanceVersion(effectivePluginId.value, item.instance_id, {
      follow_current_version: versionForm.follow,
      plugin_version: versionForm.follow ? null : versionForm.pinnedVersion,
    })
    $toast.success(t('plugin.versionSwitchSuccess'))
    closeVersionEditor()
    await loadData()
    emit('save')
  } catch (error) {
    $toast.error(
      t('plugin.versionSwitchFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
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
    await loadData()
    emit('save')
  } catch (error) {
    $toast.error(
      t('plugin.defaultTargetFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
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
    await loadData()
  } catch (error) {
    $toast.error(
      t('plugin.logLevelSetFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
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
    await loadData()
  } catch (error) {
    $toast.error(
      t('plugin.logLevelClearFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
  } finally {
    logLevelSavingId.value = null
  }
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
    await loadData()
  } catch (error) {
    $toast.error(
      t('plugin.versionRecycleFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
    console.error(error)
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
    }
  },
  { immediate: true },
)
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
          <div class="text-subtitle-2 mb-2">{{ t('plugin.instancesTitle') }}</div>

          <div class="plugin-instance-version-dialog__table-scroll">
            <VTable density="compact">
              <thead>
                <tr>
                  <th>{{ t('plugin.instanceColumnId') }}</th>
                  <th>{{ t('plugin.instanceColumnVersion') }}</th>
                  <th>{{ t('plugin.instanceColumnBinding') }}</th>
                  <th>{{ t('plugin.instanceColumnRunning') }}</th>
                  <th>{{ t('plugin.instanceColumnLogLevel') }}</th>
                  <th>{{ t('plugin.instanceColumnDefaultTarget') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in instanceRows" :key="item.instance_id">
                  <td>
                    <div class="d-flex align-center ga-1">
                      <code>{{ item.instance_id }}</code>
                      <VChip size="x-small" variant="tonal" :color="item.is_host ? 'primary' : 'secondary'">
                        {{ item.is_host ? t('plugin.instanceHost') : t('plugin.instanceClone') }}
                      </VChip>
                    </div>
                  </td>
                  <td>
                    <span v-if="item.plugin_version">v{{ item.plugin_version }}</span>
                    <span v-else class="text-medium-emphasis">{{ t('plugin.instanceVersionNotStarted') }}</span>
                  </td>
                  <td>
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
                          class="cursor-pointer"
                          :color="item.follow_current_version ? 'primary' : 'secondary'"
                          variant="tonal"
                          @click="openVersionEditor(item)"
                        >
                          <VIcon start size="14" icon="mdi-pencil-outline" />
                          {{
                            item.follow_current_version
                              ? t('plugin.versionFollowCurrent')
                              : t('plugin.versionPinned', { version: item.plugin_version || '-' })
                          }}
                        </VChip>
                      </template>
                      <VCard min-width="300">
                        <VCardText>
                          <VRadioGroup v-model="versionForm.follow" density="compact" hide-details>
                            <VRadio :label="t('plugin.versionFollowCurrent')" :value="true" />
                            <VRadio :label="t('plugin.versionPinnedOption')" :value="false" />
                          </VRadioGroup>
                          <VSelect
                            v-if="!versionForm.follow"
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
                            :disabled="!versionForm.follow && !versionForm.pinnedVersion"
                            @click="submitVersionChange(item)"
                          >
                            {{ t('common.confirm') }}
                          </VBtn>
                        </VCardActions>
                      </VCard>
                    </VMenu>
                  </td>
                  <td>
                    <VChip size="small" variant="tonal" :color="item.running ? 'success' : 'secondary'">
                      {{ item.running ? t('plugin.instanceRunning') : t('plugin.instanceStopped') }}
                    </VChip>
                  </td>
                  <td>
                    <VMenu
                      :model-value="logLevelEditingId === item.instance_id"
                      :close-on-content-click="false"
                      location="bottom start"
                      @update:model-value="value => !value && closeLogLevelEditor()"
                    >
                      <template #activator="{ props: menuProps }">
                        <div
                          v-bind="menuProps"
                          class="plugin-instance-version-dialog__log-level cursor-pointer"
                          @click="openLogLevelEditor(item)"
                        >
                          <VChip size="x-small" variant="tonal" :color="item.configuredLevel ? 'info' : 'secondary'">
                            {{
                              item.configuredLevel
                                ? t('plugin.logLevelConfigured', { level: item.configuredLevel })
                                : t('plugin.logLevelFollowGlobal')
                            }}
                          </VChip>
                          <VChip size="x-small" variant="tonal" color="default">
                            {{ t('plugin.logLevelEffective', { level: item.effectiveLevel }) }}
                          </VChip>
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
                  </td>
                  <td>
                    <VBtn
                      icon
                      size="small"
                      variant="text"
                      :color="item.is_default_target ? 'warning' : undefined"
                      :loading="defaultTargetSavingId === item.instance_id"
                      :aria-label="
                        item.is_default_target ? t('plugin.defaultTargetClear') : t('plugin.defaultTargetSet')
                      "
                      @click="toggleDefaultTarget(item)"
                    >
                      <VIcon :icon="item.is_default_target ? 'mdi-star' : 'mdi-star-outline'" />
                      <VTooltip activator="parent" location="top">
                        {{ item.is_default_target ? t('plugin.defaultTargetClear') : t('plugin.defaultTargetSet') }}
                      </VTooltip>
                    </VBtn>
                  </td>
                </tr>
                <tr v-if="instanceRows.length === 0">
                  <td colspan="6" class="text-medium-emphasis">{{ t('plugin.instancesEmpty') }}</td>
                </tr>
              </tbody>
            </VTable>
          </div>

          <div class="text-caption text-medium-emphasis mt-2">
            <VIcon icon="mdi-information-outline" size="14" class="me-1" />
            {{ t('plugin.defaultTargetOnlyOneHint') }}
          </div>
        </VCardText>
      </template>
    </VCard>
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

.plugin-instance-version-dialog__kept-list {
  margin: 0;
  padding-inline-start: 1.25rem;
  font-size: 0.8125rem;
}

.plugin-instance-version-dialog__log-level {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}
</style>
