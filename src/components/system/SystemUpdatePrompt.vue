<script setup lang="ts">
import api from '@/api'
import type { SystemUpdateItemStatus, SystemUpdateState, SystemUpdateStatus, SystemUpdateType } from '@/api/types'
import { useConfirm } from '@/composables/useConfirm'
import { useFooterDockHeight } from '@/composables/useFooterDockHeight'
import { useSystemRestartStatus } from '@/composables/useSystemRestart'
import { SYSTEM_UPDATE_MENU_EVENT, useSystemUpdateStatus } from '@/composables/useSystemUpdateStatus'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  avoidAgentAssistant?: boolean
  enabled: boolean
}>()

const { t } = useI18n()
const { createConfirm } = useConfirm()
const { startSystemRestart, finishSystemRestart } = useSystemRestartStatus()
const { status, setStatus, startPolling, stopPolling } = useSystemUpdateStatus()
const { footerDockHeight } = useFooterDockHeight()
const toast = useToast()
const actionPending = ref(false)
const pendingTarget = ref<SystemUpdateType | null>(null)
let restartTimer: ReturnType<typeof setTimeout> | null = null
let reminderTimer: ReturnType<typeof setTimeout> | null = null

const REMINDER_STORAGE_KEY = 'moviepilot.system-update-reminders'
const SNOOZE_DURATION = 24 * 60 * 60 * 1000

type ReminderPhase = 'available' | 'ready'

/** 记录提醒对应的目标版本及可选的稍后提醒期限。 */
interface UpdateReminder {
  version: string
  snoozedUntil?: number
}

/** 浏览器本地分别记录下载和重启阶段；忽略版本仍跨阶段生效。 */
interface UpdateReminderBucket {
  available?: UpdateReminder
  ready?: UpdateReminder
  ignored?: UpdateReminder
}

type ReminderStore = Partial<Record<SystemUpdateType, UpdateReminderBucket>>

const reminders = ref<ReminderStore>(readReminders())
const reminderClock = ref(Date.now())

const promptStyle = computed<Record<string, string | undefined>>(() => {
  if (!footerDockHeight.value) return {}

  return { '--system-update-footer-height': `${footerDockHeight.value}px` }
})

const updateItems = computed<SystemUpdateItemStatus[]>(() => {
  if (!status.value) return []
  if (status.value.updates?.length) return status.value.updates
  return [
    {
      type: 'application',
      state: status.value.state,
      current_version: status.value.current_version,
      version: status.value.version,
      frontend_version: status.value.frontend_version,
      release_name: status.value.release_name,
      release_notes: status.value.release_notes,
      published_at: status.value.published_at,
      checked_at: status.value.checked_at,
      downloaded_bytes: status.value.downloaded_bytes,
      total_bytes: status.value.total_bytes,
      progress: status.value.progress,
      error: status.value.error,
      can_update: status.value.can_update,
      can_install: status.value.can_install,
    },
  ]
})

const visibleItems = computed(() =>
  updateItems.value.filter(item => {
    // 关闭自动检查后隐藏未下载版本提醒，已准备完成和手动下载进度仍可见。
    const enabled = item.type === 'resources' ? status.value?.auto_update_resource : status.value?.auto_update
    if (item.state === 'available' && enabled !== true) return false
    if (!['available', 'downloading', 'ready', 'installing', 'failed'].includes(item.state)) return false
    // 忽略版本跨下载、安装和失败阶段生效，避免后台旧状态重新弹出提示。
    return !isCurrentVersionSuppressed(item)
  }),
)

const visible = computed(() => props.enabled && visibleItems.value.length > 0)

/** 恢复当前浏览器保存的两类更新提醒，并丢弃无效记录。 */
function readReminders(): ReminderStore {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || 'null')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}

    const result: ReminderStore = {}
    for (const [type, value] of Object.entries(saved)) {
      if (type !== 'application' && type !== 'resources') continue
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue

      const record = value as Record<string, unknown>
      const bucket: UpdateReminderBucket = {}
      for (const phase of ['available', 'ready'] as const) {
        const reminder = parseReminder(record[phase])
        if (reminder) bucket[phase] = reminder
      }
      const ignored = parseReminder(record.ignored)
      if (ignored) bucket.ignored = ignored
      if (bucket.available || bucket.ready || bucket.ignored) result[type] = bucket
    }

    return result
  } catch {
    return {}
  }
}

/** 校验本地提醒数据，兼容没有稍后提醒期限的忽略记录。 */
function parseReminder(value: unknown): UpdateReminder | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.version !== 'string') return undefined

  return {
    version: record.version,
    ...(typeof record.snoozedUntil === 'number' ? { snoozedUntil: record.snoozedUntil } : {}),
  }
}

/** 同步页面和本地提醒记录，并重新安排稍后提醒的到期时间。 */
function saveReminders(value: ReminderStore) {
  reminders.value = value
  localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(value))
  scheduleReminderExpiry()
}

/** 用主程序版本或完整资源目标组合标识一次更新。 */
function itemVersion(item: SystemUpdateItemStatus): string {
  if (item.type === 'application') return item.version || ''
  return [item.version, item.auth_version, item.indexer_version].filter(Boolean).join('|')
}

/** 仅在下载前和待重启阶段读取对应的稍后提醒。 */
function itemReminder(item: SystemUpdateItemStatus): UpdateReminder | undefined {
  const phase = reminderPhase(item.state)
  return phase ? reminders.value[item.type]?.[phase] : undefined
}

/** 判定目标版本是否被永久忽略，或当前阶段是否仍在稍后提醒期限内。 */
function isCurrentVersionSuppressed(item: SystemUpdateItemStatus): boolean {
  const bucket = reminders.value[item.type]
  const reminder = itemReminder(item)
  const version = itemVersion(item)
  if (!version) return false
  if (bucket?.ignored?.version === version) return true
  if (reminder?.version !== version) return false
  return (reminder.snoozedUntil || 0) > reminderClock.value
}

/** 取消旧的提醒到期任务，避免组件销毁后继续更新状态。 */
function clearReminderTimer() {
  if (reminderTimer) clearTimeout(reminderTimer)
  reminderTimer = null
}

/** 到期时主动恢复提示，页面无需刷新。 */
function scheduleReminderExpiry() {
  clearReminderTimer()
  const expiresAt = Object.values(reminders.value).reduce(
    (latest, bucket) => Math.max(latest, bucket?.available?.snoozedUntil || 0, bucket?.ready?.snoozedUntil || 0),
    0,
  )
  if (expiresAt <= Date.now()) return
  reminderTimer = setTimeout(() => {
    reminderClock.value = Date.now()
  }, expiresAt - Date.now())
}

/** 使用紧凑二进制单位展示下载量，避免进度提示宽度跳动。 */
function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 MB'
  const megabytes = value / 1024 / 1024
  return `${megabytes >= 100 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`
}

/** 取消旧的服务恢复轮询，确保同一时刻只等待一次重启。 */
function clearRestartTimer() {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = null
}

/** 启动指定更新的后台下载，并清除该版本的下载前稍后提醒。 */
async function startDownload(item: SystemUpdateItemStatus) {
  if (actionPending.value) return
  actionPending.value = true
  pendingTarget.value = item.type
  try {
    const nextStatus = await api.post<SystemUpdateStatus>('system/update/download', { target: item.type })
    setStatus(nextStatus)
    clearAvailableReminder(item)
  } catch (error) {
    console.error('[SystemUpdate] 启动下载失败', error)
    toast.error(t('systemUpdate.downloadFailed'))
  } finally {
    actionPending.value = false
    pendingTarget.value = null
  }
}

/** 映射允许稍后提醒的阶段，其余阶段只支持忽略版本。 */
function reminderPhase(state: SystemUpdateState): ReminderPhase | null {
  return state === 'available' || state === 'ready' ? state : null
}

/** 手动开始下载后仅移除当前版本的下载前稍后提醒。 */
function clearAvailableReminder(item: SystemUpdateItemStatus) {
  const version = itemVersion(item)
  const bucket = reminders.value[item.type]
  if (!version || bucket?.available?.version !== version) return

  const nextBucket = { ...bucket }
  delete nextBucket.available
  saveReminders({ ...reminders.value, [item.type]: nextBucket })
}

/** 将当前阶段的提醒推迟一天，保留其他阶段和版本忽略记录。 */
function postpone(item: SystemUpdateItemStatus) {
  const version = itemVersion(item)
  const phase = reminderPhase(item.state)
  if (!version || !phase) return
  reminderClock.value = Date.now()
  const bucket = reminders.value[item.type] || {}
  saveReminders({
    ...reminders.value,
    [item.type]: {
      ...bucket,
      [phase]: { version, snoozedUntil: Date.now() + SNOOZE_DURATION },
    },
  })
}

/** 在当前浏览器隐藏该目标版本的所有提示阶段，保留后台更新任务。 */
function ignoreVersion(item: SystemUpdateItemStatus) {
  const version = itemVersion(item)
  if (!version) return
  saveReminders({
    ...reminders.value,
    [item.type]: { ...reminders.value[item.type], ignored: { version } },
  })
}

/** 更新单类状态快照，同时兼容没有明细列表的旧后端响应。 */
function replaceItem(item: SystemUpdateItemStatus) {
  if (!status.value?.updates?.length) {
    status.value = { ...status.value!, state: item.state }
    return
  }
  status.value = {
    ...status.value,
    updates: status.value.updates.map(current => (current.type === item.type ? item : current)),
  }
}

/** 经管理员确认后申请安装，并等待服务恢复以加载新前端。 */
async function confirmInstall(item: SystemUpdateItemStatus) {
  if (actionPending.value) return
  const confirmed = await createConfirm({
    type: 'warn',
    title: t(item.type === 'resources' ? 'systemUpdate.resourcesRestartTitle' : 'systemUpdate.applicationRestartTitle'),
    content: t(
      item.type === 'resources'
        ? 'systemUpdate.resourcesRestartDescription'
        : 'systemUpdate.applicationRestartDescription',
    ),
  })
  if (!confirmed) return

  actionPending.value = true
  pendingTarget.value = item.type
  startSystemRestart()
  try {
    await api.post<null>('system/update/install', { target: item.type })
    replaceItem({ ...item, state: 'installing' })
    pollServiceRecovery()
  } catch (error) {
    console.error('[SystemUpdate] 启动安装失败', error)
    finishSystemRestart()
    actionPending.value = false
    pendingTarget.value = null
    toast.error(t('systemUpdate.installFailed'))
  }
}

/** 将头像菜单动作接入相同的下载和重启确认流程。 */
async function handleMenuUpdate(event: Event) {
  const target = (event as CustomEvent<{ target?: SystemUpdateType }>).detail?.target
  if (!target) return
  const item = updateItems.value.find(current => current.type === target)
  if (!item || !['available', 'ready'].includes(item.state)) return
  if (item.state === 'ready') {
    await confirmInstall(item)
    return
  }
  const confirmed = await createConfirm({
    type: 'warn',
    title: t(
      item.type === 'resources' ? 'systemUpdate.resourcesDownloadTitle' : 'systemUpdate.applicationDownloadTitle',
    ),
    content: t(
      item.type === 'resources'
        ? 'systemUpdate.resourcesDownloadDescription'
        : 'systemUpdate.applicationDownloadDescription',
    ),
  })
  if (confirmed) await startDownload(item)
}

/** 服务重启后强制刷新，确保浏览器加载与新后端配套的前端资源。 */
function pollServiceRecovery(attempt = 0) {
  if (attempt >= 90) {
    finishSystemRestart()
    actionPending.value = false
    pendingTarget.value = null
    toast.error(t('app.restartTimeout'))
    return
  }
  clearRestartTimer()
  restartTimer = setTimeout(
    async () => {
      try {
        await api.get<null>('system/ping', { timeout: 3000, feedback: 'silent' })
        finishSystemRestart()
        window.location.reload()
      } catch (error) {
        console.debug('[SystemUpdate] 等待服务重启完成', error)
        pollServiceRecovery(attempt + 1)
      }
    },
    attempt === 0 ? 5000 : 3000,
  )
}

/** 根据更新类型和准备阶段选择提示框标题。 */
function titleFor(item: SystemUpdateItemStatus): string {
  if (item.type === 'resources')
    return item.state === 'ready' ? t('systemUpdate.resourcesReadyTitle') : t('systemUpdate.resourcesAvailableTitle')
  return item.state === 'ready' ? t('systemUpdate.applicationReadyTitle') : t('systemUpdate.applicationAvailableTitle')
}

/** 说明当前更新类型在下载前或安装前的操作效果。 */
function descriptionFor(item: SystemUpdateItemStatus): string {
  if (item.type === 'resources')
    return item.state === 'ready'
      ? t('systemUpdate.resourcesReadyDescription')
      : t('systemUpdate.resourcesAvailableDescription')
  return item.state === 'ready'
    ? t('systemUpdate.applicationReadyDescription')
    : t('systemUpdate.applicationAvailableDescription')
}

/** 分别展示主程序、配套前端及认证和索引资源的目标版本。 */
function versionLines(item: SystemUpdateItemStatus): string[] {
  if (item.type === 'application') {
    return item.version
      ? [
          `${item.current_version || ''} → ${item.version}`,
          ...(item.frontend_version ? [`${t('systemUpdate.frontendLabel')}: ${item.frontend_version}`] : []),
        ]
      : []
  }
  const lines: string[] = []
  if (item.auth_version)
    lines.push(`${t('systemUpdate.authResourceLabel')}: ${item.current_auth_version || ''} → ${item.auth_version}`)
  if (item.indexer_version)
    lines.push(
      `${t('systemUpdate.indexerResourceLabel')}: ${item.current_indexer_version || ''} → ${item.indexer_version}`,
    )
  return lines
}

watch(
  () => props.enabled,
  enabled => {
    if (enabled) startPolling()
    else {
      stopPolling()
      clearReminderTimer()
    }
  },
  { immediate: true },
)

watch(
  () => updateItems.value.map(item => `${item.type}:${itemVersion(item)}`).join(','),
  () => {
    reminderClock.value = Date.now()
    scheduleReminderExpiry()
  },
)

onBeforeUnmount(() => {
  if (props.enabled) stopPolling()
  window.removeEventListener(SYSTEM_UPDATE_MENU_EVENT, handleMenuUpdate)
  clearRestartTimer()
  clearReminderTimer()
})

window.addEventListener(SYSTEM_UPDATE_MENU_EVENT, handleMenuUpdate)
</script>

<template>
  <Transition name="system-update-prompt">
    <VCard
      v-if="visible"
      class="system-update-prompt"
      :class="{ 'system-update-prompt--avoid-agent': props.avoidAgentAssistant }"
      :style="promptStyle"
    >
      <div v-for="(item, index) in visibleItems" :key="item.type" class="system-update-prompt__section">
        <div class="system-update-prompt__accent" :class="`system-update-prompt__accent--${item.type}`" />
        <VCardItem>
          <template #prepend>
            <VAvatar :color="item.type === 'resources' ? 'info' : 'primary'" variant="tonal" size="38">
              <VIcon :icon="item.type === 'resources' ? 'mdi-database-cog-outline' : 'mdi-update'" size="22" />
            </VAvatar>
          </template>
          <div class="system-update-prompt__heading">
            <VCardTitle class="system-update-prompt__title">{{ titleFor(item) }}</VCardTitle>
            <span class="system-update-prompt__badge">{{ item.type === 'resources' ? 'RESOURCE' : 'SYSTEM' }}</span>
          </div>
          <div v-if="versionLines(item).length" class="system-update-prompt__versions">
            <span v-for="line in versionLines(item)" :key="line">{{ line }}</span>
          </div>
        </VCardItem>

        <VCardText v-if="item.state === 'available'" class="pt-1">{{ descriptionFor(item) }}</VCardText>

        <VCardText v-else-if="item.state === 'downloading'" class="pt-1">
          <div class="d-flex justify-space-between text-body-2 mb-2">
            <span>{{ t('systemUpdate.downloading') }}</span>
            <span>{{ item.progress }}%</span>
          </div>
          <VProgressLinear
            :model-value="item.progress"
            :color="item.type === 'resources' ? 'info' : 'primary'"
            height="6"
            rounded
          />
          <div class="text-caption text-medium-emphasis mt-2">
            {{ formatBytes(item.downloaded_bytes) }} / {{ formatBytes(item.total_bytes) }}
          </div>
        </VCardText>

        <VCardText v-else-if="item.state === 'ready'" class="pt-1">{{ descriptionFor(item) }}</VCardText>

        <VCardText v-else-if="item.state === 'installing'" class="pt-1 d-flex align-center ga-3">
          <VProgressCircular indeterminate color="primary" size="22" width="2" />
          <span>{{ t('systemUpdate.installing') }}</span>
        </VCardText>

        <VCardText v-else-if="item.state === 'failed'" class="pt-1 text-error">{{
          item.error || t('systemUpdate.downloadFailed')
        }}</VCardText>

        <VCardActions class="px-4 pb-4 pt-0">
          <VBtn v-if="itemVersion(item)" variant="text" @click="ignoreVersion(item)">
            {{ t('systemUpdate.ignoreVersion') }}
          </VBtn>
          <div v-if="['available', 'ready', 'failed'].includes(item.state)" class="system-update-prompt__commands">
            <template v-if="item.state === 'available'">
              <VBtn variant="text" @click="postpone(item)">{{ t('systemUpdate.later') }}</VBtn>
              <VBtn
                class="system-update-prompt__primary"
                color="primary"
                :loading="actionPending && pendingTarget === item.type"
                @click="startDownload(item)"
              >
                <VIcon icon="mdi-download" start />
                {{ t('systemUpdate.updateNow') }}
              </VBtn>
            </template>
            <template v-else-if="item.state === 'ready'">
              <VBtn variant="text" @click="postpone(item)">{{ t('systemUpdate.restartLater') }}</VBtn>
              <VBtn
                class="system-update-prompt__primary"
                color="primary"
                :loading="actionPending && pendingTarget === item.type"
                @click="confirmInstall(item)"
              >
                <VIcon icon="mdi-restart" start />
                {{ t('systemUpdate.restartNow') }}
              </VBtn>
            </template>
            <VBtn
              v-else
              class="system-update-prompt__primary"
              color="primary"
              :loading="actionPending && pendingTarget === item.type"
              @click="startDownload(item)"
            >
              <VIcon icon="mdi-refresh" start />
              {{ t('common.retry') }}
            </VBtn>
          </div>
        </VCardActions>
        <VDivider v-if="index < visibleItems.length - 1" />
      </div>
    </VCard>
  </Transition>
</template>

<style scoped>
.system-update-prompt {
  --system-update-footer-height: env(safe-area-inset-bottom, 0px);
  --system-update-prompt-bottom-gap: 20px;

  position: fixed;
  z-index: 2600;
  right: max(20px, env(safe-area-inset-right));
  bottom: calc(var(--system-update-footer-height) + var(--system-update-prompt-bottom-gap));
  width: min(400px, calc(100vw - 32px));
  max-height: min(
    80vh,
    calc(
      100vh - var(--system-update-footer-height) - var(--system-update-prompt-bottom-gap) -
        max(16px, env(safe-area-inset-top, 0px))
    )
  );
  max-height: min(
    680px,
    calc(
      100dvh - var(--system-update-footer-height) - var(--system-update-prompt-bottom-gap) -
        max(16px, env(safe-area-inset-top, 0px))
    )
  );
  overflow-y: auto;
  border: var(--app-overlay-border);
  border-radius: var(--app-overlay-radius) !important;
  box-shadow: var(--app-overlay-shadow);
  background: color-mix(in srgb, rgb(var(--v-theme-surface)) 92%, rgb(var(--v-theme-primary)) 8%);
  backdrop-filter: blur(18px);
}

.system-update-prompt__section {
  position: relative;
  overflow: hidden;
}

.system-update-prompt__accent {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(var(--v-theme-primary), 0.42) 32%,
    rgba(var(--v-theme-primary), 0.9) 50%,
    transparent
  );
  opacity: 0.9;
}

.system-update-prompt__accent--resources {
  background: linear-gradient(
    90deg,
    transparent,
    rgba(var(--v-theme-primary), 0.42) 32%,
    rgba(var(--v-theme-primary), 0.9) 50%,
    transparent
  );
}

.system-update-prompt__heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.system-update-prompt__badge {
  flex: 0 0 auto;
  padding: 3px 7px;
  border: 1px solid rgba(var(--v-theme-primary), 0.28);
  border-radius: 999px;
  color: rgb(var(--v-theme-primary));
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.system-update-prompt__versions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
}

.system-update-prompt__versions span {
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.74rem;
}

.system-update-prompt__title {
  flex: 1 1 auto;
  font-size: 1rem;
  line-height: 1.35;
  min-width: 0;
}

.system-update-prompt--avoid-agent {
  bottom: calc(var(--system-update-footer-height) + 220px);
}

.system-update-prompt :deep(.v-card-text) {
  overflow-wrap: anywhere;
}

.system-update-prompt :deep(.v-card-item__content) {
  min-width: 0;
}

.system-update-prompt :deep(.v-card-actions) {
  flex-wrap: wrap;
  gap: 8px;
  padding-inline: 20px !important;
}

.system-update-prompt :deep(.v-card-actions .v-btn) {
  min-width: 88px;
  border-radius: 10px;
  font-weight: 600;
  letter-spacing: 0;
}

.system-update-prompt__commands {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-inline-start: auto;
}

.system-update-prompt :deep(.v-card-actions .v-btn:not(.system-update-prompt__primary)) {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.system-update-prompt :deep(.v-card-actions .system-update-prompt__primary) {
  min-width: 108px;
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.72), rgb(var(--v-theme-primary)));
  color: #fff !important;
  box-shadow: 0 6px 16px rgba(var(--v-theme-primary), 0.24);
}

.system-update-prompt :deep(.v-card-actions .system-update-prompt__primary .v-btn__content) {
  color: #fff !important;
}

.system-update-prompt-enter-active,
.system-update-prompt-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.system-update-prompt-enter-from,
.system-update-prompt-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 600px) {
  .system-update-prompt {
    --system-update-prompt-bottom-gap: 16px;

    right: 16px;
  }

  .system-update-prompt--avoid-agent {
    bottom: calc(var(--system-update-footer-height) + 210px);
  }
}
</style>
