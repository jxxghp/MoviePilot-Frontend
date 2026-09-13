<script setup lang="ts">
import { getApiErrorMessage } from '@/api'
import {
  clearPluginInstanceDefaultTarget,
  setPluginInstanceDefaultTarget,
  setPluginInstanceEnabled,
} from '@/api/pluginInstanceManage'
import { clearPluginInstanceLogLevel, setPluginInstanceLogLevel } from '@/api/pluginLogLevel'
import type { Plugin } from '@/api/types'
import { usePluginInstanceOverview, type PluginInstanceRow } from '@/composables/usePluginInstanceOverview'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'

/** 列表行：在册实例来自后端清单，停用掉的那些只在本次弹窗内留着待撤销。 */
interface InstanceRow extends PluginInstanceRow {
  isEnabled: boolean
}

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

const emit = defineEmits(['update:modelValue', 'close'])

const { mdAndUp } = useDisplay()
const { t, locale } = useI18n()
const $toast = useToast()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/**
 * 按实例的设置接口只认源插件 ID。
 *
 * 从分身卡片打开时必须重定向到它的源插件：后端对分身自身的实例 ID 直接拒绝，
 * 分身也看不到同一插件下的其它实例。
 */
const targetPluginId = computed(
  () => (props.plugin?.is_instance ? props.plugin?.source_plugin_id || props.plugin?.id : props.plugin?.id) ?? '',
)

const { loading, loadFailed, overlayFailed, rows, load } = usePluginInstanceOverview(targetPluginId)

// 本次弹窗内被停用的实例：它们随即离开后端的在册清单，留下快照才能当场撤销
const disabledRows = ref<PluginInstanceRow[]>([])

const editingId = ref<string | null>(null)
const form = reactive({ level: 'INFO', expiresAt: '' })
const levelSavingId = ref<string | null>(null)
const defaultTargetSavingId = ref<string | null>(null)
const enabledSavingId = ref<string | null>(null)
const disableConfirmId = ref<string | null>(null)

// 与系统设置里的全局日志等级取同一组选项，避免两处等级名对不上
const levelItems = computed(() => [
  { title: t('setting.system.logLevelItems.debug'), value: 'DEBUG' },
  { title: t('setting.system.logLevelItems.info'), value: 'INFO' },
  { title: t('setting.system.logLevelItems.warning'), value: 'WARNING' },
  { title: t('setting.system.logLevelItems.error'), value: 'ERROR' },
  { title: t('setting.system.logLevelItems.critical'), value: 'CRITICAL' },
])

/** 判断两行是否指向同一个实例；实例 ID 的大小写在各处登记里未必一致。 */
function isSameInstance(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

const displayRows = computed<InstanceRow[]>(() => [
  ...rows.value
    .filter(row => !disabledRows.value.some(item => isSameInstance(item.instanceId, row.instanceId)))
    .map(row => ({ ...row, isEnabled: true })),
  ...disabledRows.value.map(row => ({ ...row, isEnabled: false })),
])

// 默认调用目标的候选只有在册实例，停用掉的那些后端根本不接受置位
const hasClones = computed(() => rows.value.some(row => !row.isHost))
const hasDefaultTarget = computed(() => rows.value.some(row => row.isDefaultTarget))
// 已有分身却没有默认调用目标时必须明说：这种状态下未指定实例的调用会直接失败
const missingDefaultTarget = computed(() => hasClones.value && !hasDefaultTarget.value && !overlayFailed.value)

/** 标出打开本弹窗的那个实例：从分身卡片进来时，光看 ID 认不出自己是哪一行。 */
function isCurrentInstance(row: InstanceRow): boolean {
  const currentId = props.plugin?.id ?? ''
  return Boolean(currentId) && isSameInstance(row.instanceId, currentId)
}

/** 把 ISO 时间转换为 datetime-local 输入框可直接使用的本地时间字符串。 */
function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 把输入框里的本地时间转换为带时区的 ISO 字符串，空值表示不设置失效时间。
 *
 * 必须带时区：后端把不带时区的失效时间按 UTC 解读，直接送 datetime-local 的裸本地
 * 时间会让覆盖提前或推迟若干小时失效。
 */
function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** 格式化展示用的日期时间。 */
function formatDateTime(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value)
}

/** 变更成功后重新读取权威状态，失败时明说，避免用户把过期的列表当成已生效的结果。 */
async function refreshInstances() {
  if (!(await load())) $toast.error(t('plugin.instanceRefreshFailed'))
}

/** 打开等级编辑器，默认展示已配置等级，未配置时展示当前生效等级。 */
function openEditor(row: InstanceRow) {
  disableConfirmId.value = null
  editingId.value = row.instanceId
  form.level = row.configuredLevel || row.effectiveLevel
  form.expiresAt = toDatetimeLocalValue(row.expiresAt)
}

function closeEditor() {
  editingId.value = null
}

/** 提交实例日志等级覆盖，运行期立即生效。 */
async function submitLevel(row: InstanceRow) {
  if (!targetPluginId.value || !form.level) return

  levelSavingId.value = row.instanceId
  try {
    await setPluginInstanceLogLevel(targetPluginId.value, row.instanceId, {
      level: form.level,
      expires_at: fromDatetimeLocalValue(form.expiresAt),
    })
    $toast.success(t('plugin.logLevelSetSuccess'))
    closeEditor()
  } catch (error) {
    console.error(error)
    $toast.error(
      t('plugin.logLevelSetFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
  } finally {
    levelSavingId.value = null
  }
  await refreshInstances()
}

/** 清除实例的日志等级覆盖，立即回落全局等级。 */
async function clearLevel(row: InstanceRow) {
  if (!targetPluginId.value) return

  levelSavingId.value = row.instanceId
  try {
    await clearPluginInstanceLogLevel(targetPluginId.value, row.instanceId)
    $toast.success(t('plugin.logLevelClearSuccess'))
    closeEditor()
  } catch (error) {
    console.error(error)
    $toast.error(
      t('plugin.logLevelClearFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
  } finally {
    levelSavingId.value = null
  }
  await refreshInstances()
}

/** 设为或取消默认调用目标；设为默认时后端在同一事务里清除同插件的旧默认。 */
async function toggleDefaultTarget(row: InstanceRow) {
  if (!targetPluginId.value) return

  defaultTargetSavingId.value = row.instanceId
  try {
    if (row.isDefaultTarget) {
      await clearPluginInstanceDefaultTarget(targetPluginId.value, row.instanceId)
      $toast.success(t('plugin.defaultTargetClearSuccess'))
    } else {
      await setPluginInstanceDefaultTarget(targetPluginId.value, row.instanceId)
      $toast.success(t('plugin.defaultTargetSetSuccess'))
    }
  } catch (error) {
    console.error(error)
    $toast.error(
      t('plugin.defaultTargetFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
  } finally {
    defaultTargetSavingId.value = null
  }
  await refreshInstances()
}

/** 打开停用确认，让「停用不是删除」和它会清掉哪些置位在动手前先说清楚。 */
function openDisableConfirm(row: InstanceRow) {
  closeEditor()
  disableConfirmId.value = row.instanceId
}

function closeDisableConfirm() {
  disableConfirmId.value = null
}

/** 停用一个分身：它随即离开在册清单，先留下这一行的快照，用户才能当场撤销。 */
async function disableInstance(row: InstanceRow) {
  enabledSavingId.value = row.instanceId
  try {
    await setPluginInstanceEnabled(row.instanceId, false)
    $toast.success(t('plugin.instanceDisableSuccess', { name: row.displayName }))
    // 停用会一并清掉默认调用目标置位与日志等级覆盖，快照按停用后的事实记录
    disabledRows.value = [
      ...disabledRows.value.filter(item => !isSameInstance(item.instanceId, row.instanceId)),
      { ...row, isDefaultTarget: false, configuredLevel: null, expiresAt: null },
    ]
    closeDisableConfirm()
  } catch (error) {
    console.error(error)
    $toast.error(
      t('plugin.instanceDisableFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
  } finally {
    enabledSavingId.value = null
  }
  await refreshInstances()
}

/** 重新启用刚被停用的实例，它的业务参数与展示信息原样回来。 */
async function enableInstance(row: InstanceRow) {
  enabledSavingId.value = row.instanceId
  try {
    await setPluginInstanceEnabled(row.instanceId, true)
    $toast.success(t('plugin.instanceEnableSuccess', { name: row.displayName }))
    disabledRows.value = disabledRows.value.filter(item => !isSameInstance(item.instanceId, row.instanceId))
  } catch (error) {
    console.error(error)
    $toast.error(
      t('plugin.instanceEnableFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
  } finally {
    enabledSavingId.value = null
  }
  await refreshInstances()
}

watch(targetPluginId, () => {
  closeEditor()
  closeDisableConfirm()
  disabledRows.value = []
})
</script>

<template>
  <VDialog v-if="visible" v-model="visible" scrollable max-width="44rem" :fullscreen="!mdAndUp">
    <VCard class="plugin-instance-manage-dialog">
      <VDialogCloseBtn v-model="visible" />
      <VCardItem>
        <VCardTitle class="d-flex align-center ga-2 pe-8">
          <VIcon icon="mdi-tune-variant" />
          <span class="plugin-instance-manage-dialog__title">
            {{ t('plugin.instanceManageTitle', { name: props.plugin?.plugin_name || props.plugin?.id }) }}
          </span>
        </VCardTitle>
      </VCardItem>
      <VDivider />

      <VCardText class="pa-0">
        <LoadingBanner v-if="loading && displayRows.length === 0" class="my-8" />
        <div v-else-if="loadFailed && displayRows.length === 0" class="pa-4 pa-sm-6">
          <VAlert type="error" variant="tonal" :text="t('plugin.instanceLoadFailed')">
            <template #append>
              <VBtn variant="text" color="error" @click="load">{{ t('common.retry') }}</VBtn>
            </template>
          </VAlert>
        </div>
        <div v-else-if="displayRows.length === 0" class="pa-4 pa-sm-6">
          <VAlert type="info" variant="tonal" :text="t('plugin.instancesEmpty')" />
        </div>
        <template v-else>
          <div class="plugin-instance-manage-dialog__hint">
            <VIcon icon="mdi-information-outline" size="16" />
            <span>{{ t('plugin.instanceManageHint') }}</span>
          </div>

          <div class="plugin-instance-manage-dialog__notices">
            <VAlert
              v-if="overlayFailed"
              type="warning"
              variant="tonal"
              density="compact"
              :text="t('plugin.instanceOverlayFailed')"
            />
            <VAlert
              v-if="missingDefaultTarget"
              type="warning"
              variant="tonal"
              density="compact"
              :text="t('plugin.defaultTargetMissingWarning')"
            />
            <VAlert
              v-else-if="!hasClones"
              type="info"
              variant="tonal"
              density="compact"
              :text="t('plugin.defaultTargetSingleInstanceHint')"
            />
          </div>

          <VList bg-color="transparent" lines="two">
            <template v-for="row in displayRows" :key="row.instanceId">
              <VListItem :data-testid="`instance-row-${row.instanceId}`">
                <template #prepend>
                  <VIcon :icon="row.isHost ? 'mdi-puzzle-outline' : 'mdi-content-copy'" />
                </template>
                <VListItemTitle class="plugin-instance-manage-dialog__instance">
                  <span class="plugin-instance-manage-dialog__instance-name">{{ row.displayName }}</span>
                  <VChip size="x-small" variant="tonal" :color="row.isHost ? 'primary' : 'secondary'">
                    {{ row.isHost ? t('plugin.instanceHost') : t('plugin.instanceClone') }}
                  </VChip>
                  <VChip v-if="isCurrentInstance(row)" size="x-small" variant="tonal" color="info">
                    {{ t('plugin.instanceCurrent') }}
                  </VChip>
                  <VChip v-if="row.isDefaultTarget" size="x-small" variant="tonal" color="warning">
                    {{ t('plugin.defaultTarget') }}
                  </VChip>
                  <VChip v-if="!row.isEnabled" size="x-small" variant="tonal" color="error">
                    {{ t('plugin.instanceDisabled') }}
                  </VChip>
                </VListItemTitle>
                <VListItemSubtitle class="plugin-instance-manage-dialog__facts">
                  <code v-if="row.displayName !== row.instanceId">{{ row.instanceId }}</code>
                  <template v-if="row.isEnabled">
                    <span>
                      {{
                        row.configuredLevel
                          ? t('plugin.logLevelConfigured', { level: row.configuredLevel })
                          : t('plugin.logLevelFollowGlobal')
                      }}
                    </span>
                    <span>·</span>
                    <span>{{ t('plugin.logLevelEffective', { level: row.effectiveLevel }) }}</span>
                    <template v-if="row.expiresAt">
                      <span>·</span>
                      <span>{{ t('plugin.logLevelExpiresAt', { time: formatDateTime(row.expiresAt) }) }}</span>
                    </template>
                  </template>
                  <span v-else>{{ t('plugin.instanceDisabledFacts') }}</span>
                </VListItemSubtitle>

                <div class="plugin-instance-manage-dialog__actions">
                  <template v-if="row.isEnabled">
                    <VBtn
                      size="small"
                      variant="tonal"
                      :color="row.isDefaultTarget ? 'warning' : undefined"
                      :prepend-icon="row.isDefaultTarget ? 'mdi-star' : 'mdi-star-outline'"
                      :disabled="overlayFailed"
                      :loading="defaultTargetSavingId === row.instanceId"
                      :data-testid="`instance-default-target-${row.instanceId}`"
                      @click="toggleDefaultTarget(row)"
                    >
                      {{ row.isDefaultTarget ? t('plugin.defaultTargetClear') : t('plugin.defaultTargetSet') }}
                    </VBtn>
                    <VBtn
                      size="small"
                      variant="tonal"
                      :data-testid="`log-level-edit-${row.instanceId}`"
                      @click="openEditor(row)"
                    >
                      {{ t('plugin.logLevelEdit') }}
                    </VBtn>
                    <!-- 本体停用后插件整体不再装载，实例清单随之读不到，故这里只停分身 -->
                    <VBtn
                      v-if="!row.isHost"
                      size="small"
                      variant="text"
                      color="warning"
                      :data-testid="`instance-disable-${row.instanceId}`"
                      @click="openDisableConfirm(row)"
                    >
                      {{ t('plugin.instanceDisable') }}
                    </VBtn>
                  </template>
                  <VBtn
                    v-else
                    size="small"
                    variant="tonal"
                    color="success"
                    :loading="enabledSavingId === row.instanceId"
                    :data-testid="`instance-enable-${row.instanceId}`"
                    @click="enableInstance(row)"
                  >
                    {{ t('plugin.instanceEnable') }}
                  </VBtn>
                </div>
              </VListItem>

              <div v-if="editingId === row.instanceId" class="plugin-instance-manage-dialog__panel">
                <VRow>
                  <VCol cols="12" md="6">
                    <VSelect
                      v-model="form.level"
                      :items="levelItems"
                      :label="t('plugin.logLevelSelectLabel')"
                      density="compact"
                      hide-details
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="form.expiresAt"
                      type="datetime-local"
                      :label="t('plugin.logLevelExpiresLabel')"
                      :hint="t('plugin.logLevelExpiresHint')"
                      persistent-hint
                      density="compact"
                    />
                  </VCol>
                </VRow>
                <div class="d-flex align-center ga-2">
                  <VBtn
                    v-if="row.configuredLevel"
                    size="small"
                    color="warning"
                    variant="text"
                    :loading="levelSavingId === row.instanceId"
                    @click="clearLevel(row)"
                  >
                    {{ t('plugin.logLevelClear') }}
                  </VBtn>
                  <VSpacer />
                  <VBtn size="small" variant="text" @click="closeEditor">{{ t('common.cancel') }}</VBtn>
                  <VBtn
                    size="small"
                    color="primary"
                    variant="flat"
                    :loading="levelSavingId === row.instanceId"
                    @click="submitLevel(row)"
                  >
                    {{ t('common.confirm') }}
                  </VBtn>
                </div>
              </div>

              <div v-if="disableConfirmId === row.instanceId" class="plugin-instance-manage-dialog__panel">
                <div class="text-body-2">{{ t('plugin.instanceDisableKeepsConfig') }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ t('plugin.instanceDisableClearsPlacements') }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ t('plugin.instanceDisableLeavesList') }}</div>
                <VAlert
                  v-if="row.isDefaultTarget"
                  type="warning"
                  variant="tonal"
                  density="compact"
                  :text="t('plugin.instanceDisableDefaultTargetWarning')"
                />
                <div class="d-flex align-center ga-2">
                  <VSpacer />
                  <VBtn size="small" variant="text" @click="closeDisableConfirm">{{ t('common.cancel') }}</VBtn>
                  <VBtn
                    size="small"
                    color="warning"
                    variant="flat"
                    :loading="enabledSavingId === row.instanceId"
                    :data-testid="`instance-disable-confirm-${row.instanceId}`"
                    @click="disableInstance(row)"
                  >
                    {{ t('plugin.instanceDisableConfirm') }}
                  </VBtn>
                </div>
              </div>
            </template>
          </VList>

          <div class="plugin-instance-manage-dialog__hint">
            <VIcon icon="mdi-star-outline" size="16" />
            <span>{{ t('plugin.defaultTargetOnlyOneHint') }}</span>
          </div>
        </template>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.plugin-instance-manage-dialog {
  overflow: hidden;
}

.plugin-instance-manage-dialog__title,
.plugin-instance-manage-dialog__instance-name {
  overflow-wrap: anywhere;
  white-space: normal;
}

.plugin-instance-manage-dialog__hint {
  display: flex;
  align-items: center;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  gap: 0.5rem;
  padding-block: 0.5rem;
  padding-inline: 1rem;
}

.plugin-instance-manage-dialog__notices {
  display: grid;
  gap: 0.5rem;
  padding-block: 0.75rem 0;
  padding-inline: 1rem;
}

.plugin-instance-manage-dialog__instance,
.plugin-instance-manage-dialog__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.plugin-instance-manage-dialog__facts {
  opacity: var(--v-medium-emphasis-opacity);
}

.plugin-instance-manage-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-block-start: 0.5rem;
}

.plugin-instance-manage-dialog__panel {
  display: grid;
  background: rgba(var(--v-theme-on-surface), 0.02);
  gap: 0.75rem;
  padding-block: 0.75rem 1rem;
  padding-inline: 1rem;
}
</style>
