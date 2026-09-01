<script setup lang="ts">
import api from '@/api'
import type { SystemUpdateItemStatus, SystemUpdateStatus, SystemUpdateType } from '@/api/types'
import { useConfirm } from '@/composables/useConfirm'
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
const { status, startPolling, stopPolling } = useSystemUpdateStatus()
const toast = useToast()
const actionPending = ref(false)
const pendingTarget = ref<SystemUpdateType | null>(null)
let restartTimer: ReturnType<typeof setTimeout> | null = null
let reminderTimer: ReturnType<typeof setTimeout> | null = null

const REMINDER_STORAGE_KEY = 'moviepilot.system-update-reminders'
const SNOOZE_DURATION = 24 * 60 * 60 * 1000

interface UpdateReminder {
  version: string
  snoozedUntil?: number
  ignored?: boolean
}

type ReminderStore = Partial<Record<SystemUpdateType, UpdateReminder>>

const reminders = ref<ReminderStore>(readReminders())
const reminderClock = ref(Date.now())

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
    if (!['available', 'downloading', 'ready', 'installing', 'failed'].includes(item.state)) return false
    return !['available', 'ready'].includes(item.state) || !isCurrentVersionSuppressed(item)
  }),
)

const visible = computed(() => props.enabled && visibleItems.value.length > 0)

function readReminders(): ReminderStore {
  try {
    const saved = JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || 'null')
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      if (typeof saved.version === 'string') return { application: saved }
      return saved
    }
  } catch {
    return {}
  }
  return {}
}

function saveReminders(value: ReminderStore) {
  reminders.value = value
  localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(value))
  scheduleReminderExpiry()
}

function itemVersion(item: SystemUpdateItemStatus): string {
  if (item.type === 'application') return item.version || ''
  return [item.version, item.auth_version, item.indexer_version].filter(Boolean).join('|')
}

function itemReminder(item: SystemUpdateItemStatus): UpdateReminder | undefined {
  return reminders.value[item.type]
}

function isCurrentVersionSuppressed(item: SystemUpdateItemStatus): boolean {
  const reminder = itemReminder(item)
  const version = itemVersion(item)
  if (!version || reminder?.version !== version) return false
  if (reminder.ignored) return true
  return (reminder.snoozedUntil || 0) > reminderClock.value
}

function clearReminderTimer() {
  if (reminderTimer) clearTimeout(reminderTimer)
  reminderTimer = null
}

/** 到期时主动恢复提示，页面无需刷新。 */
function scheduleReminderExpiry() {
  clearReminderTimer()
  const expiresAt = Math.max(...Object.values(reminders.value).map(reminder => reminder?.snoozedUntil || 0), 0)
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

function clearRestartTimer() {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = null
}

async function startDownload(item: SystemUpdateItemStatus) {
  if (actionPending.value) return
  actionPending.value = true
  pendingTarget.value = item.type
  try {
    status.value = await api.post<SystemUpdateStatus>('system/update/download', { target: item.type })
  } catch (error) {
    console.error('[SystemUpdate] 启动下载失败', error)
    toast.error(t('systemUpdate.downloadFailed'))
  } finally {
    actionPending.value = false
    pendingTarget.value = null
  }
}

function postpone(item: SystemUpdateItemStatus) {
  const version = itemVersion(item)
  if (!version) return
  reminderClock.value = Date.now()
  saveReminders({
    ...reminders.value,
    [item.type]: { version, snoozedUntil: Date.now() + SNOOZE_DURATION },
  })
}

function ignoreVersion(item: SystemUpdateItemStatus) {
  const version = itemVersion(item)
  if (!version) return
  saveReminders({ ...reminders.value, [item.type]: { version, ignored: true } })
}

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

function titleFor(item: SystemUpdateItemStatus): string {
  if (item.type === 'resources')
    return item.state === 'ready' ? t('systemUpdate.resourcesReadyTitle') : t('systemUpdate.resourcesAvailableTitle')
  return item.state === 'ready' ? t('systemUpdate.applicationReadyTitle') : t('systemUpdate.applicationAvailableTitle')
}

function descriptionFor(item: SystemUpdateItemStatus): string {
  if (item.type === 'resources')
    return item.state === 'ready'
      ? t('systemUpdate.resourcesReadyDescription')
      : t('systemUpdate.resourcesAvailableDescription')
  return item.state === 'ready'
    ? t('systemUpdate.applicationReadyDescription')
    : t('systemUpdate.applicationAvailableDescription')
}

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
      elevation="12"
    >
      <div v-for="(item, index) in visibleItems" :key="item.type" class="system-update-prompt__section">
        <VCardItem>
          <template #prepend>
            <VAvatar :color="item.type === 'resources' ? 'info' : 'primary'" variant="tonal" size="38">
              <VIcon :icon="item.type === 'resources' ? 'mdi-database-cog-outline' : 'mdi-update'" size="22" />
            </VAvatar>
          </template>
          <VCardTitle class="system-update-prompt__title">{{ titleFor(item) }}</VCardTitle>
          <VCardSubtitle v-for="line in versionLines(item)" :key="line">{{ line }}</VCardSubtitle>
          <template v-if="item.state === 'available'" #append>
            <VMenu location="bottom end">
              <template #activator="{ props: menuProps }">
                <IconBtn v-bind="menuProps" :title="t('systemUpdate.moreActions')" size="small">
                  <VIcon icon="mdi-dots-vertical" />
                </IconBtn>
              </template>
              <VList density="compact">
                <VListItem
                  :title="t('systemUpdate.ignoreVersion')"
                  prepend-icon="mdi-bell-off-outline"
                  @click="ignoreVersion(item)"
                />
              </VList>
            </VMenu>
          </template>
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

        <VCardActions v-if="item.state === 'available'" class="px-4 pb-4 pt-0">
          <VSpacer />
          <VBtn variant="text" @click="postpone(item)">{{ t('systemUpdate.later') }}</VBtn>
          <VBtn color="primary" :loading="actionPending && pendingTarget === item.type" @click="startDownload(item)">
            <VIcon icon="mdi-download" start />
            {{ t('systemUpdate.updateNow') }}
          </VBtn>
        </VCardActions>

        <VCardActions v-else-if="item.state === 'ready'" class="px-4 pb-4 pt-0">
          <VSpacer />
          <VBtn variant="text" @click="postpone(item)">{{ t('systemUpdate.restartLater') }}</VBtn>
          <VBtn color="primary" :loading="actionPending && pendingTarget === item.type" @click="confirmInstall(item)">
            <VIcon icon="mdi-restart" start />
            {{ t('systemUpdate.restartNow') }}
          </VBtn>
        </VCardActions>

        <VCardActions v-else-if="item.state === 'failed'" class="px-4 pb-4 pt-0">
          <VSpacer />
          <VBtn color="primary" :loading="actionPending && pendingTarget === item.type" @click="startDownload(item)">
            <VIcon icon="mdi-refresh" start />
            {{ t('common.retry') }}
          </VBtn>
        </VCardActions>
        <VDivider v-if="index < visibleItems.length - 1" />
      </div>
    </VCard>
  </Transition>
</template>

<style scoped>
.system-update-prompt {
  position: fixed;
  z-index: 2400;
  right: max(20px, env(safe-area-inset-right));
  bottom: max(20px, env(safe-area-inset-bottom));
  width: min(400px, calc(100vw - 32px));
  max-height: min(80vh, 680px);
  overflow-y: auto;
  border-radius: 8px;
}

.system-update-prompt__title {
  font-size: 1rem;
  line-height: 1.35;
}

.system-update-prompt--avoid-agent {
  bottom: max(220px, env(safe-area-inset-bottom));
}

.system-update-prompt :deep(.v-card-text) {
  overflow-wrap: anywhere;
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
    right: 16px;
    bottom: max(16px, env(safe-area-inset-bottom));
  }

  .system-update-prompt--avoid-agent {
    bottom: max(210px, env(safe-area-inset-bottom));
  }
}
</style>
