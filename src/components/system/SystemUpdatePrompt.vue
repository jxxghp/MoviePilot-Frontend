<script setup lang="ts">
import api from '@/api'
import type { SystemUpdateStatus } from '@/api/types'
import { useConfirm } from '@/composables/useConfirm'
import { useSystemRestartStatus } from '@/composables/useSystemRestart'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  avoidAgentAssistant?: boolean
  enabled: boolean
}>()

const { t } = useI18n()
const { createConfirm } = useConfirm()
const { startSystemRestart, finishSystemRestart } = useSystemRestartStatus()
const toast = useToast()
const status = ref<SystemUpdateStatus | null>(null)
const actionPending = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | null = null
let restartTimer: ReturnType<typeof setTimeout> | null = null
let reminderTimer: ReturnType<typeof setTimeout> | null = null

const REMINDER_STORAGE_KEY = 'moviepilot.system-update-reminder'
const SNOOZE_DURATION = 24 * 60 * 60 * 1000

interface UpdateReminder {
  version: string
  snoozedUntil?: number
  ignored?: boolean
}

const reminder = ref<UpdateReminder | null>(readReminder())
const reminderClock = ref(Date.now())

const visible = computed(() => {
  if (!props.enabled || !status.value) return false
  if (['available', 'ready'].includes(status.value.state) && isCurrentVersionSuppressed.value) return false
  return ['available', 'downloading', 'ready', 'installing', 'failed'].includes(status.value.state)
})

const downloadedSize = computed(() => formatBytes(status.value?.downloaded_bytes || 0))
const totalSize = computed(() => formatBytes(status.value?.total_bytes || 0))
const isCurrentVersionSuppressed = computed(() => {
  if (!status.value?.version || reminder.value?.version !== status.value.version) return false
  if (reminder.value.ignored) return true
  return (reminder.value.snoozedUntil || 0) > reminderClock.value
})

function readReminder(): UpdateReminder | null {
  try {
    const saved = JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || 'null')
    return saved && typeof saved.version === 'string' ? saved : null
  } catch {
    return null
  }
}

function saveReminder(value: UpdateReminder) {
  reminder.value = value
  localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(value))
  scheduleReminderExpiry()
}

function clearReminderTimer() {
  if (reminderTimer) clearTimeout(reminderTimer)
  reminderTimer = null
}

/** 到期时主动恢复提示，页面无需刷新。 */
function scheduleReminderExpiry() {
  clearReminderTimer()
  const expiresAt = reminder.value?.snoozedUntil || 0
  if (reminder.value?.ignored || reminder.value?.version !== status.value?.version || expiresAt <= Date.now()) return
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

function clearPollTimer() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

function clearRestartTimer() {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = null
}

function scheduleStatusPoll(delay = 3000) {
  clearPollTimer()
  if (!props.enabled || !['downloading', 'installing'].includes(status.value?.state || '')) return
  pollTimer = setTimeout(async () => {
    await loadStatus()
    scheduleStatusPoll()
  }, delay)
}

async function loadStatus() {
  if (!props.enabled) return
  try {
    status.value = await api.get<SystemUpdateStatus>('system/update/status', { feedback: 'silent' })
  } catch (error) {
    console.error('[SystemUpdate] 获取更新状态失败', error)
  }
}

async function startDownload() {
  if (actionPending.value) return
  actionPending.value = true
  try {
    status.value = await api.post<SystemUpdateStatus>('system/update/download')
    scheduleStatusPoll(500)
  } catch (error) {
    console.error('[SystemUpdate] 启动下载失败', error)
    toast.error(t('systemUpdate.downloadFailed'))
  } finally {
    actionPending.value = false
  }
}

function postpone() {
  if (!status.value?.version) return
  const snoozedUntil = Date.now() + SNOOZE_DURATION
  reminderClock.value = Date.now()
  saveReminder({ version: status.value.version, snoozedUntil })
}

function ignoreVersion() {
  if (!status.value?.version) return
  saveReminder({ version: status.value.version, ignored: true })
}

async function confirmInstall() {
  if (actionPending.value) return
  const confirmed = await createConfirm({
    type: 'warn',
    title: t('systemUpdate.restartTitle'),
    content: t('systemUpdate.restartDescription'),
  })
  if (!confirmed) return

  actionPending.value = true
  startSystemRestart()
  try {
    await api.post<null>('system/update/install')
    status.value = status.value ? { ...status.value, state: 'installing' } : null
    pollServiceRecovery()
  } catch (error) {
    console.error('[SystemUpdate] 启动安装失败', error)
    finishSystemRestart()
    actionPending.value = false
    toast.error(t('systemUpdate.installFailed'))
  }
}

/** 服务重启后强制刷新，确保浏览器加载与新后端配套的前端资源。 */
function pollServiceRecovery(attempt = 0) {
  if (attempt >= 90) {
    finishSystemRestart()
    actionPending.value = false
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

watch(
  () => props.enabled,
  enabled => {
    if (enabled) {
      void loadStatus().then(() => scheduleStatusPoll())
    } else {
      clearPollTimer()
      clearReminderTimer()
    }
  },
  { immediate: true },
)

watch(
  () => status.value?.version,
  () => {
    reminderClock.value = Date.now()
    scheduleReminderExpiry()
  },
)

onBeforeUnmount(() => {
  clearPollTimer()
  clearRestartTimer()
  clearReminderTimer()
})
</script>

<template>
  <Transition name="system-update-prompt">
    <VCard
      v-if="visible"
      class="system-update-prompt"
      :class="{ 'system-update-prompt--avoid-agent': props.avoidAgentAssistant }"
      elevation="12"
    >
      <VCardItem>
        <template #prepend>
          <VAvatar color="primary" variant="tonal" size="38">
            <VIcon icon="mdi-update" size="22" />
          </VAvatar>
        </template>
        <VCardTitle class="system-update-prompt__title">
          {{ status?.state === 'ready' ? t('systemUpdate.readyTitle') : t('systemUpdate.availableTitle') }}
        </VCardTitle>
        <VCardSubtitle v-if="status?.version">{{ status.current_version }} → {{ status.version }}</VCardSubtitle>
        <template v-if="status?.state === 'available'" #append>
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
                @click="ignoreVersion"
              />
            </VList>
          </VMenu>
        </template>
      </VCardItem>

      <VCardText v-if="status?.state === 'available'" class="pt-1">
        {{ t('systemUpdate.availableDescription') }}
      </VCardText>

      <VCardText v-else-if="status?.state === 'downloading'" class="pt-1">
        <div class="d-flex justify-space-between text-body-2 mb-2">
          <span>{{ t('systemUpdate.downloading') }}</span>
          <span>{{ status.progress }}%</span>
        </div>
        <VProgressLinear :model-value="status.progress" color="primary" height="6" rounded />
        <div class="text-caption text-medium-emphasis mt-2">{{ downloadedSize }} / {{ totalSize }}</div>
      </VCardText>

      <VCardText v-else-if="status?.state === 'ready'" class="pt-1">
        {{ t('systemUpdate.readyDescription') }}
      </VCardText>

      <VCardText v-else-if="status?.state === 'installing'" class="pt-1 d-flex align-center ga-3">
        <VProgressCircular indeterminate color="primary" size="22" width="2" />
        <span>{{ t('systemUpdate.installing') }}</span>
      </VCardText>

      <VCardText v-else-if="status?.state === 'failed'" class="pt-1 text-error">
        {{ status.error || t('systemUpdate.downloadFailed') }}
      </VCardText>

      <VCardActions v-if="status?.state === 'available'" class="px-4 pb-4 pt-0">
        <VSpacer />
        <VBtn variant="text" @click="postpone">{{ t('systemUpdate.later') }}</VBtn>
        <VBtn color="primary" :loading="actionPending" @click="startDownload">
          <VIcon icon="mdi-download" start />
          {{ t('systemUpdate.updateNow') }}
        </VBtn>
      </VCardActions>

      <VCardActions v-else-if="status?.state === 'ready'" class="px-4 pb-4 pt-0">
        <VSpacer />
        <VBtn variant="text" @click="postpone">{{ t('systemUpdate.restartLater') }}</VBtn>
        <VBtn color="primary" :loading="actionPending" @click="confirmInstall">
          <VIcon icon="mdi-restart" start />
          {{ t('systemUpdate.restartNow') }}
        </VBtn>
      </VCardActions>

      <VCardActions v-else-if="status?.state === 'failed'" class="px-4 pb-4 pt-0">
        <VSpacer />
        <VBtn color="primary" :loading="actionPending" @click="startDownload">
          <VIcon icon="mdi-refresh" start />
          {{ t('common.retry') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </Transition>
</template>

<style scoped>
.system-update-prompt {
  position: fixed;
  z-index: 2400;
  right: max(20px, env(safe-area-inset-right));
  bottom: max(20px, env(safe-area-inset-bottom));
  width: min(380px, calc(100vw - 32px));
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
