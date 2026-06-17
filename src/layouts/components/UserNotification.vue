<script setup lang="ts">
import type { SystemNotification } from '@/api/types'
import api from '@/api'
import { clearUnreadMessages } from '@/utils/badge'
import { formatDateDifference } from '@core/utils/formatters'
import { useBackground } from '@/composables/useBackground'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { useDelayedSSE } = useBackground()

const PAGE_SIZE = 20
// 固定通知项高度，配合 VVirtualScroll 避免历史通知过多时一次性渲染全部 DOM。
const NOTIFICATION_ITEM_HEIGHT = 104
const MEDIA_NOTIFICATION_TYPES = ['资源下载', '整理入库', '订阅', '媒体服务器', '手动处理']

const appsMenu = ref(false)
const hasNewMessage = ref(false)
const notificationList = ref<SystemNotification[]>([])
const page = ref(1)
const loading = ref(false)
const loadedOnce = ref(false)
const hasMore = ref(true)
const notificationKeys = new Set<string>()

const hasUnreadNotifications = computed(() => notificationList.value.some(item => item.read === false))

function normalizeNote(note: SystemNotification['note']) {
  if (note == null) return ''
  if (typeof note === 'string') return note
  if (typeof note === 'object' && !Array.isArray(note) && Object.keys(note).length === 0) return ''
  return JSON.stringify(note)
}

function getNotificationTime(item: SystemNotification) {
  return item.reg_time || item.date || ''
}

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function getNotificationKind(item: SystemNotification) {
  if (item.type === 'plugin' || item.mtype === '插件') return 'plugin'
  if (item.type === 'system' || item.mtype === '其它') return 'system'
  return item.mtype || item.type || ''
}

function getNotificationTimeBucket(item: SystemNotification) {
  return getNotificationTime(item).slice(0, 16)
}

function getNotificationContentKey(item: SystemNotification) {
  return [
    getNotificationKind(item),
    getNotificationTimeBucket(item),
    normalizeText(item.title),
    normalizeText(item.text),
    item.image ?? '',
    item.link ?? '',
    normalizeNote(item.note),
  ].join('::')
}

function getNotificationKeys(item: SystemNotification) {
  return [item.id ? `id:${item.id}` : '', `content:${getNotificationContentKey(item)}`].filter(Boolean)
}

function getNotificationKey(item: SystemNotification) {
  return item.id ? `id:${item.id}` : `content:${getNotificationContentKey(item)}`
}

function parseNotificationTime(value: string) {
  if (!value) return 0
  return new Date(value.includes('T') ? value : value.replaceAll(/-/g, '/')).getTime() || 0
}

function sortNotifications() {
  notificationList.value = [...notificationList.value].sort(
    (a, b) => parseNotificationTime(getNotificationTime(b)) - parseNotificationTime(getNotificationTime(a)),
  )
}

function compactNotifications(items: SystemNotification[]) {
  const contentKeys = new Set<string>()
  const idKeys = new Set<string>()
  const compactedItems: SystemNotification[] = []

  items.forEach(item => {
    const contentKey = getNotificationContentKey(item)
    const idKey = item.id ? `id:${item.id}` : ''

    if (contentKeys.has(contentKey) || (idKey && idKeys.has(idKey))) return

    contentKeys.add(contentKey)
    if (idKey) idKeys.add(idKey)
    compactedItems.push(item)
  })

  return compactedItems
}

function normalizeNotification(item: SystemNotification, read = true): SystemNotification {
  return {
    ...item,
    read,
    title: item.title || item.source || item.mtype || t('notification.center'),
    type: item.type || (item.action === 1 ? 'notification' : item.type),
  }
}

function mergeNotifications(items: SystemNotification[], options: { prepend?: boolean; read?: boolean } = {}) {
  const normalizedItems = items.map(item => normalizeNotification(item, options.read ?? true))
  const acceptedItems: SystemNotification[] = []

  normalizedItems.forEach(item => {
    const keys = getNotificationKeys(item)
    if (keys.some(key => notificationKeys.has(key))) return

    keys.forEach(key => notificationKeys.add(key))
    acceptedItems.push(item)
  })

  if (acceptedItems.length === 0) return false

  notificationList.value = options.prepend
    ? [...acceptedItems, ...notificationList.value]
    : [...notificationList.value, ...acceptedItems]
  notificationList.value = compactNotifications(notificationList.value)
  sortNotifications()

  return true
}

async function loadNotifications({ done }: { done: (status: 'ok' | 'empty' | 'error') => void }) {
  if (loading.value) {
    done('ok')
    return
  }

  if (!hasMore.value) {
    done('empty')
    return
  }

  try {
    loading.value = true
    const items = (await api.get('message/notification', {
      params: {
        page: page.value,
        count: PAGE_SIZE,
      },
    })) as SystemNotification[]

    loadedOnce.value = true

    if (items.length === 0) {
      hasMore.value = false
      done('empty')
      return
    }

    mergeNotifications(items, { read: true })
    page.value += 1
    hasMore.value = items.length >= PAGE_SIZE
    done(hasMore.value ? 'ok' : 'empty')
  } catch (error) {
    console.error('加载通知失败:', error)
    done('error')
  } finally {
    loading.value = false
  }
}

function handleMessage(event: MessageEvent) {
  if (!event.data) return

  try {
    const notification = JSON.parse(event.data) as SystemNotification
    if (mergeNotifications([notification], { prepend: true, read: false })) {
      hasNewMessage.value = true
    }
  } catch (error) {
    console.error('解析通知失败:', error)
  }
}

/** 将通知列表标记为已读，并同步清理应用角标和未读红点。 */
function markAllAsRead() {
  hasNewMessage.value = false
  notificationList.value.forEach(item => {
    item.read = true
  })
  void clearUnreadMessages()
}

function getNotificationIcon(item: SystemNotification) {
  if (getNotificationKind(item) === 'plugin') return 'mdi-puzzle-outline'
  if (item.mtype === '资源下载') return 'mdi-download'
  if (item.mtype === '整理入库') return 'mdi-folder-check-outline'
  if (item.mtype === '订阅') return 'mdi-rss'
  if (item.mtype === '智能体') return 'lucide:bot'
  return getNotificationKind(item) === 'system' ? 'mdi-alert-circle-outline' : 'mdi-bell-outline'
}

function getNotificationColor(item: SystemNotification) {
  if (getNotificationKind(item) === 'system') return 'error'
  if (getNotificationKind(item) === 'plugin') return 'warning'
  if (item.mtype === '资源下载') return 'info'
  if (item.mtype === '整理入库') return 'success'
  if (item.mtype === '订阅') return 'primary'
  return 'secondary'
}

function isMediaNotification(item: SystemNotification) {
  return Boolean(item.image) || MEDIA_NOTIFICATION_TYPES.includes(item.mtype || '')
}

function openNotification(item: SystemNotification) {
  item.read = true
  hasNewMessage.value = hasUnreadNotifications.value
  if (!hasUnreadNotifications.value) void clearUnreadMessages()
  if (item.link) window.open(item.link, '_blank')
}

useDelayedSSE(
  `${import.meta.env.VITE_API_BASE_URL}system/message?role=notification`,
  handleMessage,
  'user-notification',
  3000,
  {
    backgroundCloseDelay: 5000,
    reconnectDelay: 3000,
    maxReconnectAttempts: 3,
  },
)
</script>

<template>
  <VMenu
    v-model="appsMenu"
    width="420"
    max-width="calc(100vw - 24px)"
    transition="scale-transition"
    close-on-content-click
    class="notification-menu"
    scrim
  >
    <template #activator="{ props }">
      <VBadge v-if="hasNewMessage" dot color="error" :offset-x="5" :offset-y="5" v-bind="props">
        <IconBtn>
          <VIcon icon="mdi-bell-outline" />
        </IconBtn>
      </VBadge>
      <IconBtn v-else v-bind="props">
        <VIcon icon="mdi-bell-outline" />
      </IconBtn>
    </template>

    <VCard class="notification-panel">
      <VCardItem class="py-3">
        <VCardTitle>{{ t('notification.center') }}</VCardTitle>
        <template #append>
          <VTooltip :text="t('notification.markRead')">
            <template #activator="{ props }">
              <IconBtn v-bind="props" @click.stop="markAllAsRead">
                <VIcon icon="mdi-email-check-outline" size="20" />
              </IconBtn>
            </template>
          </VTooltip>
        </template>
      </VCardItem>
      <VDivider />

      <div class="notification-list-container">
        <VInfiniteScroll
          mode="intersect"
          side="end"
          :items="notificationList"
          class="notification-list-scroll"
          @load="loadNotifications"
        >
          <template #loading>
            <div class="py-3 text-center text-caption text-medium-emphasis">
              {{ t('message.loadMore') }}
            </div>
          </template>
          <template #empty>
            <div v-if="notificationList.length > 0" class="py-3 text-center text-caption text-medium-emphasis">
              {{ t('message.noMoreData') }}
            </div>
          </template>

          <VVirtualScroll
            v-if="notificationList.length > 0"
            renderless
            :items="notificationList"
            :item-height="NOTIFICATION_ITEM_HEIGHT"
          >
            <template #default="{ item, itemRef }">
              <div :ref="itemRef" :key="getNotificationKey(item)" class="notification-virtual-item">
                <button
                  type="button"
                  class="notification-row"
                  :class="{
                    'notification-row--unread': item.read === false,
                    'notification-row--media': isMediaNotification(item),
                  }"
                  @click="openNotification(item)"
                >
                  <div v-if="isMediaNotification(item)" class="notification-media">
                    <VImg v-if="item.image" :src="item.image" cover class="notification-media__image">
                      <template #placeholder>
                        <VSkeletonLoader class="h-100 w-100" />
                      </template>
                    </VImg>
                    <div v-else class="notification-media__fallback">
                      <VIcon :icon="getNotificationIcon(item)" size="24" />
                    </div>
                  </div>
                  <div v-else class="notification-icon" :class="`text-${getNotificationColor(item)}`">
                    <VIcon :icon="getNotificationIcon(item)" size="22" />
                  </div>

                  <div class="notification-content">
                    <div class="notification-title-row">
                      <span class="notification-title">{{ item.title }}</span>
                      <span v-if="item.read === false" class="notification-unread-dot" />
                    </div>
                    <div v-if="item.text" class="notification-text">
                      {{ item.text }}
                    </div>
                    <div class="notification-meta">
                      <span v-if="item.mtype" class="notification-type">{{ item.mtype }}</span>
                      <span>{{ formatDateDifference(getNotificationTime(item)) }}</span>
                    </div>
                  </div>
                </button>
              </div>
            </template>
          </VVirtualScroll>

          <div v-if="notificationList.length === 0 && loadedOnce && !loading" class="notification-empty">
            <VIcon icon="mdi-bell-sleep-outline" size="40" class="mb-3" />
            <div>{{ t('notification.empty') }}</div>
          </div>
        </VInfiniteScroll>
      </div>
    </VCard>
  </VMenu>
</template>

<style scoped>
.notification-panel {
  overflow: hidden;
}

.notification-list-container {
  max-block-size: min(560px, 62vh);
  overflow: hidden;
  scrollbar-width: thin;
}

.notification-list-scroll {
  max-block-size: min(560px, 62vh);
  min-block-size: 160px;
}

.notification-virtual-item {
  block-size: 104px;
  padding-block: 4px;
  padding-inline: 8px;
}

.notification-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  inline-size: 100%;
  block-size: 100%;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  gap: 12px;
  padding: 10px;
  text-align: start;
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}

.notification-row:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}

.notification-row--unread {
  background: rgba(var(--v-theme-error), 0.07);
}

.notification-row--media {
  min-block-size: 0;
}

.notification-media {
  overflow: hidden;
  flex: 0 0 56px;
  block-size: 76px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.notification-media__image,
.notification-media__fallback {
  inline-size: 100%;
  block-size: 100%;
}

.notification-media__fallback,
.notification-icon {
  display: grid;
  place-items: center;
}

.notification-icon {
  flex: 0 0 40px;
  block-size: 40px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.notification-content {
  min-inline-size: 0;
  flex: 1;
}

.notification-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-block-size: 20px;
}

.notification-title {
  overflow: hidden;
  font-size: 0.925rem;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-unread-dot {
  flex: 0 0 7px;
  inline-size: 7px;
  block-size: 7px;
  border-radius: 999px;
  background: rgb(var(--v-theme-error));
}

.notification-text {
  display: -webkit-box;
  overflow: hidden;
  margin-block-start: 4px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: pre-wrap;
}

.notification-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-block-start: 6px;
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
  font-size: 0.75rem;
  line-height: 1.2;
}

.notification-type {
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  padding-block: 2px;
  padding-inline: 6px;
}

.notification-empty {
  padding: 32px 16px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-align: center;
}
</style>
