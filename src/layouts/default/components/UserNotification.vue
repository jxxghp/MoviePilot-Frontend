<script setup lang="ts">
import type { SystemNotification } from '@/api/types'
import api from '@/api'
import { appUnreadMessageCount, clearUnreadMessages } from '@/utils/badge'
import { emitAgentAssistantNotificationBubble } from '@/utils/agentAssistantBubble'
import { formatDateDifference } from '@core/utils/formatters'
import { useBackground } from '@/composables/useBackground'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'

type NotificationDisplayItem =
  | { kind: 'section'; key: string; title: string; count: number }
  | { kind: 'notification'; key: string; notification: SystemNotification }
type NotificationClearScope = 'all' | 'system' | 'media'

const { t } = useI18n()
const { useDelayedSSE } = useBackground()
const $toast = useToast()
const createConfirm = useConfirm()

const PAGE_SIZE = 20
// 虚拟滚动的默认通知项高度，展开后的实际高度由 VVirtualScroll 的 itemRef 动态测量。
const NOTIFICATION_ITEM_HEIGHT = 136

const appsMenu = ref(false)
const hasNewMessage = ref(false)
const notificationList = ref<SystemNotification[]>([])
const page = ref(1)
const loading = ref(false)
const clearing = ref(false)
const hasMore = ref(true)
const notificationKeys = new Set<string>()
const expandedNotificationKeys = ref(new Set<string>())

const hasUnreadNotifications = computed(() => notificationList.value.some(item => item.read === false))
const hasBadgeUnreadMessages = computed(() => appUnreadMessageCount.value > 0)
const canMarkAllAsRead = computed(() => hasUnreadNotifications.value || hasBadgeUnreadMessages.value)
const hasUnreadMessageIndicator = computed(() => hasNewMessage.value || canMarkAllAsRead.value)
const notificationDisplayList = computed(() => buildNotificationDisplayList(notificationList.value))
const notificationClearCounts = computed(() => getNotificationClearCounts())
const notificationClearOptions = computed(() => [
  {
    scope: 'system' as const,
    title: t('notification.clearSystemMessages'),
    icon: 'mdi-alert-circle-outline',
    color: 'error',
    count: notificationClearCounts.value.system,
  },
  {
    scope: 'media' as const,
    title: t('notification.clearMediaMessages'),
    icon: 'mdi-image-outline',
    color: 'primary',
    count: notificationClearCounts.value.media,
  },
  {
    scope: 'all' as const,
    title: t('notification.clearAllMessages'),
    icon: 'mdi-trash-can-outline',
    color: 'secondary',
    count: notificationClearCounts.value.all,
  },
])

/** 将通知备注统一转换成稳定字符串，用于生成去重 key。 */
function normalizeNote(note: SystemNotification['note']) {
  if (note == null) return ''
  if (typeof note === 'string') return note
  if (typeof note === 'object' && !Array.isArray(note) && Object.keys(note).length === 0) return ''
  return JSON.stringify(note)
}

/** 获取通知时间字段，兼容历史数据中的不同命名。 */
function getNotificationTime(item: SystemNotification) {
  return item.reg_time || item.date || ''
}

/** 归一化文本内容，避免空白差异影响通知去重。 */
function normalizeText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 获取通知分类，统一插件、系统等历史字段差异。 */
function getNotificationKind(item: SystemNotification) {
  if (item.type === 'plugin' || item.mtype === '插件') return 'plugin'
  if (item.type === 'system' || item.mtype === '其它') return 'system'
  return item.mtype || item.type || ''
}

/** 按分钟生成时间桶，降低同一通知秒级差异导致的重复展示。 */
function getNotificationTimeBucket(item: SystemNotification) {
  return getNotificationTime(item).slice(0, 16)
}

/** 基于主要展示字段生成内容去重 key。 */
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

/** 生成通知可用于去重的全部 key。 */
function getNotificationKeys(item: SystemNotification) {
  return [item.id ? `id:${item.id}` : '', `content:${getNotificationContentKey(item)}`].filter(Boolean)
}

/** 获取用于虚拟列表渲染的稳定 key。 */
function getNotificationKey(item: SystemNotification) {
  return item.id ? `id:${item.id}` : `content:${getNotificationContentKey(item)}`
}

/** 获取通知正文展开状态使用的稳定 key。 */
function getNotificationExpansionKey(item: SystemNotification) {
  return getNotificationKey(item)
}

/** 将通知时间解析成时间戳，用于列表降序排序。 */
function parseNotificationTime(value: string) {
  if (!value) return 0
  return new Date(value.includes('T') ? value : value.replaceAll(/-/g, '/')).getTime() || 0
}

/** 按通知时间倒序重排当前列表。 */
function sortNotifications() {
  notificationList.value = [...notificationList.value].sort(
    (a, b) => parseNotificationTime(getNotificationTime(b)) - parseNotificationTime(getNotificationTime(a)),
  )
}

/** 压缩当前通知列表，移除同一内容或同一 ID 的重复项。 */
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

/** 规范化通知展示字段，并补齐默认标题、类型和已读状态。 */
function normalizeNotification(item: SystemNotification, read = true): SystemNotification {
  return {
    ...item,
    read,
    title: item.title || item.source || item.mtype || t('notification.center'),
    type: item.type || (item.action === 1 ? 'notification' : item.type),
  }
}

/** 合并新通知到当前列表，并维护去重集合、排序和已读状态。 */
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

/** 重置通知分页状态，用于清理后重新进入空列表状态。 */
function resetNotifications() {
  notificationList.value = []
  notificationKeys.clear()
  expandedNotificationKeys.value = new Set()
  page.value = 1
  hasMore.value = true
  hasNewMessage.value = false
}

/** 重新根据当前列表生成去重 key，避免分类清理后遗留已移除消息的去重状态。 */
function rebuildNotificationKeys() {
  notificationKeys.clear()
  notificationList.value.forEach(item => {
    getNotificationKeys(item).forEach(key => notificationKeys.add(key))
  })
}

/** 清理已移除通知的展开状态，避免虚拟列表复用时保留无效 key。 */
function rebuildExpandedNotificationKeys() {
  const currentKeys = new Set(notificationList.value.map(getNotificationExpansionKey))
  expandedNotificationKeys.value = new Set(
    [...expandedNotificationKeys.value].filter(key => currentKeys.has(key)),
  )
}

/** 列表内容变化后同步未读红点和应用角标状态。 */
function syncUnreadStateAfterListChange() {
  // 只用当前列表更新通知中心红点，应用 badge 数量由 badge 工具维护。
  hasNewMessage.value = canMarkAllAsRead.value
}

/** 统计当前已加载通知中各清理范围的数量，用于菜单展示和禁用空操作。 */
function getNotificationClearCounts() {
  const counts: Record<NotificationClearScope, number> = {
    all: notificationList.value.length,
    system: 0,
    media: 0,
  }

  notificationList.value.forEach(item => {
    counts[getNotificationClearScope(item)] += 1
  })

  return counts
}

/** 移除指定范围的通知，并让分页从第一页重新校验，方便继续加载剩余分类历史。 */
function removeNotificationsByScope(scope: NotificationClearScope) {
  if (scope === 'all') {
    resetNotifications()
    hasMore.value = false
    return
  }

  notificationList.value = notificationList.value.filter(item => getNotificationClearScope(item) !== scope)
  page.value = 1
  hasMore.value = true
  rebuildNotificationKeys()
  rebuildExpandedNotificationKeys()
  syncUnreadStateAfterListChange()
}

/** 获取不同清理范围的确认文案。 */
function getClearConfirmText(scope: NotificationClearScope) {
  if (scope === 'system') return t('notification.clearSystemConfirm')
  if (scope === 'media') return t('notification.clearMediaConfirm')
  return t('notification.clearAllConfirm')
}

/** 获取不同清理范围的成功文案。 */
function getClearSuccessText(scope: NotificationClearScope) {
  if (scope === 'system') return t('notification.clearSystemSuccess')
  if (scope === 'media') return t('notification.clearMediaSuccess')
  return t('notification.clearAllSuccess')
}

/** 调用后端记录清理范围，后续分页查询会直接返回过滤后的通知。 */
async function tryDeleteNotificationHistory(scope: NotificationClearScope) {
  const result: { [key: string]: any } = await api.delete('message/notification', {
    params: { scope },
  })
  return result?.success !== false
}

/** 确认并清空通知中心历史，同时同步清理未读角标。 */
async function clearNotifications(scope: NotificationClearScope) {
  if (clearing.value || notificationClearCounts.value[scope] === 0) return

  const confirmed = await createConfirm({
    type: 'warn',
    title: t('notification.clear'),
    content: getClearConfirmText(scope),
    confirmText: t('notification.clear'),
  })
  if (!confirmed) return

  clearing.value = true
  try {
    const cleared = await tryDeleteNotificationHistory(scope)
    if (!cleared) {
      $toast.error(t('notification.clearFailed'))
      return
    }

    removeNotificationsByScope(scope)
    if (scope === 'all') {
      await clearUnreadMessages()
      appsMenu.value = false
    }
    $toast.success(getClearSuccessText(scope))
  } catch (error: any) {
    $toast.error(error?.response?.data?.message || error?.message || t('notification.clearFailed'))
  } finally {
    clearing.value = false
  }
}

/** 按页请求历史通知，并合并到当前虚拟列表。 */
async function fetchNotificationPage() {
  const items = (await api.get('message/notification', {
    params: {
      page: page.value,
      count: PAGE_SIZE,
    },
  })) as SystemNotification[]

  if (items.length === 0) {
    hasMore.value = false
    return items
  }

  mergeNotifications(items, { read: true })
  page.value += 1
  hasMore.value = items.length >= PAGE_SIZE

  return items
}

/** 刷新通知中心首屏数据，确保点开红点时能立即看到后端已有的新消息。 */
async function refreshNotificationsOnOpen() {
  if (loading.value) return

  try {
    loading.value = true
    page.value = 1
    hasMore.value = true
    notificationKeys.clear()
    notificationList.value = compactNotifications(notificationList.value)
    rebuildNotificationKeys()
    await fetchNotificationPage()
  } catch (error) {
    console.error('刷新通知失败:', error)
  } finally {
    loading.value = false
  }
}

/** 按页加载历史通知，并合并到当前虚拟列表。 */
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

    const items = await fetchNotificationPage()
    if (items.length === 0) {
      done('empty')
      return
    }

    done(hasMore.value ? 'ok' : 'empty')
  } catch (error) {
    console.error('加载通知失败:', error)
    done('error')
  } finally {
    loading.value = false
  }
}

/** 处理 SSE 推送的新通知，并置为未读状态展示红点。 */
function handleMessage(event: MessageEvent) {
  if (!event.data) return

  try {
    const notification = JSON.parse(event.data) as SystemNotification

    if (mergeNotifications([notification], { prepend: true, read: false })) {
      hasNewMessage.value = true
      emitAgentAssistantNotificationBubble(notification)
    }
  } catch (error) {
    console.error('解析通知失败:', error)
  }
}

/** 将通知列表标记为已读，并同步清理应用角标、未读红点和通知弹窗。 */
function markAllAsRead() {
  if (!canMarkAllAsRead.value) return

  hasNewMessage.value = false
  notificationList.value.forEach(item => {
    item.read = true
  })
  appsMenu.value = false
  void clearUnreadMessages()
}

/** 根据通知分类和业务类型选择列表图标。 */
function getNotificationIcon(item: SystemNotification) {
  if (getNotificationKind(item) === 'plugin') return 'mdi-puzzle-outline'
  if (item.mtype === '资源下载') return 'mdi-download'
  if (item.mtype === '整理入库') return 'mdi-folder-check-outline'
  if (item.mtype === '订阅') return 'mdi-rss'
  if (item.mtype === '智能体') return 'lucide:bot'
  return getNotificationKind(item) === 'system' ? 'mdi-alert-circle-outline' : 'mdi-bell-outline'
}

/** 根据通知分类和业务类型选择图标颜色。 */
function getNotificationColor(item: SystemNotification) {
  if (getNotificationKind(item) === 'system') return 'error'
  if (getNotificationKind(item) === 'plugin') return 'warning'
  if (item.mtype === '资源下载') return 'info'
  if (item.mtype === '整理入库') return 'success'
  if (item.mtype === '订阅') return 'primary'
  return 'secondary'
}

/** 判断通知是否有真实媒体图，决定是否使用媒体缩略图样式。 */
function isMediaNotification(item: SystemNotification) {
  return Boolean(item.image)
}

/** 获取通知清理范围，目前通知中心展示上以是否包含图片区分媒体和系统消息。 */
function getNotificationClearScope(item: SystemNotification): Exclude<NotificationClearScope, 'all'> {
  return isMediaNotification(item) ? 'media' : 'system'
}

/** 按系统类消息和媒体消息生成带分组标题的虚拟列表数据。 */
function buildNotificationDisplayList(items: SystemNotification[]) {
  const systemItems = items.filter(item => !isMediaNotification(item))
  const mediaItems = items.filter(isMediaNotification)
  const sections = [
    { key: 'system', title: t('notification.systemMessages'), items: systemItems },
    { key: 'media', title: t('notification.mediaMessages'), items: mediaItems },
  ]
  const displayItems: NotificationDisplayItem[] = []

  sections.forEach(section => {
    if (section.items.length === 0) return

    displayItems.push({
      kind: 'section',
      key: `section:${section.key}`,
      title: section.title,
      count: section.items.length,
    })
    section.items.forEach(item => {
      displayItems.push({
        kind: 'notification',
        key: `notification:${getNotificationKey(item)}`,
        notification: item,
      })
    })
  })

  return displayItems
}

/** 判断通知正文是否已经展开。 */
function isNotificationExpanded(item: SystemNotification) {
  return expandedNotificationKeys.value.has(getNotificationExpansionKey(item))
}

/** 标记单条通知为已读，仅同步当前通知中心列表的未读状态。 */
function markNotificationAsRead(item: SystemNotification) {
  item.read = true
  hasNewMessage.value = hasUnreadNotifications.value
}

/** 切换通知正文展开状态。 */
function toggleNotificationExpanded(item: SystemNotification) {
  markNotificationAsRead(item)
  if (!item.text) return

  const key = getNotificationExpansionKey(item)
  const expandedKeys = new Set(expandedNotificationKeys.value)
  if (expandedKeys.has(key)) expandedKeys.delete(key)
  else expandedKeys.add(key)
  expandedNotificationKeys.value = expandedKeys
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

/** 监听通知中心展开状态，展开时主动刷新首屏通知。 */
function handleNotificationMenuVisibleChange(open: boolean) {
  if (open) void refreshNotificationsOnOpen()
}

watch(appsMenu, handleNotificationMenuVisibleChange)
</script>

<template>
  <VMenu
    v-model="appsMenu"
    width="420"
    max-width="calc(100vw - 24px)"
    transition="scale-transition"
    :close-on-content-click="false"
    class="notification-menu"
    scrim
  >
    <template #activator="{ props }">
      <VBadge v-if="hasUnreadMessageIndicator" dot color="error" :offset-x="5" :offset-y="5" v-bind="props">
        <IconBtn>
          <VIcon icon="mdi-bell-outline" size="22" />
        </IconBtn>
      </VBadge>
      <IconBtn v-else v-bind="props">
        <VIcon icon="mdi-bell-outline" size="22" />
      </IconBtn>
    </template>

    <VCard class="notification-panel">
      <VCardItem class="py-3">
        <VCardTitle>{{ t('notification.center') }}</VCardTitle>
        <template #append>
          <div class="notification-actions">
            <VTooltip :text="t('notification.clear')">
              <template #activator="{ props }">
                <VMenu location="bottom end" :close-on-content-click="true">
                  <template #activator="{ props: menuProps }">
                    <IconBtn
                      v-bind="{ ...props, ...menuProps }"
                      :disabled="notificationList.length === 0 || clearing"
                      @click.stop
                    >
                      <VProgressCircular v-if="clearing" indeterminate size="18" width="2" />
                      <VIcon v-else icon="mdi-trash-can-outline" size="20" />
                    </IconBtn>
                  </template>
                  <VList density="compact" min-width="180">
                    <VListItem
                      v-for="option in notificationClearOptions"
                      :key="option.scope"
                      :disabled="option.count === 0 || clearing"
                      @click="clearNotifications(option.scope)"
                    >
                      <template #prepend>
                        <VIcon :icon="option.icon" :color="option.color" size="20" />
                      </template>
                      <VListItemTitle>{{ option.title }}</VListItemTitle>
                      <template #append>
                        <span class="notification-clear-count">{{ option.count }}</span>
                      </template>
                    </VListItem>
                  </VList>
                </VMenu>
              </template>
            </VTooltip>
            <VTooltip :text="t('notification.markRead')">
              <template #activator="{ props }">
                <IconBtn v-bind="props" :disabled="!canMarkAllAsRead" @click.stop="markAllAsRead">
                  <VIcon icon="mdi-email-check-outline" size="20" />
                </IconBtn>
              </template>
            </VTooltip>
          </div>
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
            <div v-if="notificationList.length === 0" class="notification-empty">
              <div class="notification-empty__icon">
                <VIcon icon="mdi-bell-sleep-outline" size="22" />
              </div>
              <div>{{ t('notification.empty') }}</div>
            </div>
          </template>

          <VVirtualScroll
            v-if="notificationList.length > 0"
            renderless
            :items="notificationDisplayList"
            :item-height="NOTIFICATION_ITEM_HEIGHT"
          >
            <template #default="{ item, itemRef }">
              <div
                :ref="itemRef"
                :key="item.key"
                class="notification-virtual-item"
                :class="{ 'notification-virtual-item--section': item.kind === 'section' }"
              >
                <div v-if="item.kind === 'section'" class="notification-section-heading">
                  <span class="notification-section-heading__title">{{ item.title }}</span>
                  <span class="notification-section-heading__count">{{ item.count }}</span>
                </div>
                <div
                  v-else
                  class="notification-row"
                  :class="{
                    'notification-row--unread': item.notification.read === false,
                    'notification-row--media': isMediaNotification(item.notification),
                  }"
                  role="button"
                  tabindex="0"
                  :aria-expanded="item.notification.text ? isNotificationExpanded(item.notification) : undefined"
                  @click="toggleNotificationExpanded(item.notification)"
                  @keydown.enter.prevent="toggleNotificationExpanded(item.notification)"
                  @keydown.space.prevent="toggleNotificationExpanded(item.notification)"
                >
                  <div v-if="item.notification.image" class="notification-media">
                    <VImg
                      v-if="item.notification.image"
                      :src="item.notification.image"
                      cover
                      class="notification-media__image"
                    >
                      <template #placeholder>
                        <VSkeletonLoader class="h-100 w-100" />
                      </template>
                    </VImg>
                  </div>
                  <div v-else class="notification-icon" :class="`text-${getNotificationColor(item.notification)}`">
                    <VIcon :icon="getNotificationIcon(item.notification)" size="22" />
                  </div>

                  <div class="notification-content">
                    <div class="notification-title-row">
                      <span class="notification-title">{{ item.notification.title }}</span>
                      <span v-if="item.notification.read === false" class="notification-unread-dot" />
                    </div>
                    <div
                      v-if="item.notification.text"
                      class="notification-text"
                      :class="{ 'notification-text--expanded': isNotificationExpanded(item.notification) }"
                    >
                      {{ item.notification.text }}
                    </div>
                    <div class="notification-meta">
                      <span v-if="item.notification.mtype" class="notification-type">{{ item.notification.mtype }}</span>
                      <span>{{ formatDateDifference(getNotificationTime(item.notification)) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </VVirtualScroll>
        </VInfiniteScroll>
      </div>
    </VCard>
  </VMenu>
</template>

<style scoped>
.notification-panel {
  overflow: hidden;
}

.notification-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.notification-clear-count {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
  font-size: 0.75rem;
  line-height: 1;
  margin-inline-start: 16px;
}

.notification-list-container {
  overflow: hidden;
  max-block-size: min(560px, 62vh);
  scrollbar-width: thin;
}

.notification-list-scroll {
  max-block-size: min(560px, 62vh);
  min-block-size: 160px;
}

.notification-virtual-item {
  padding-block: 4px;
  padding-inline: 8px;
}

.notification-virtual-item--section {
  padding-block: 10px 2px;
}

.notification-section-heading {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.42);
  gap: 8px;
  letter-spacing: 0;
  padding-inline: 10px;
}

.notification-section-heading__title {
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.2;
}

.notification-section-heading__count {
  color: rgba(var(--v-theme-on-surface), 0.34);
  font-size: 0.625rem;
  line-height: 1;
}

.notification-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding: 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  gap: 12px;
  inline-size: 100%;
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
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 84px;
}

.notification-media__image {
  block-size: 100%;
  inline-size: 100%;
}

.notification-icon {
  display: grid;
  place-items: center;
}

.notification-icon {
  flex: 0 0 40px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 40px;
}

.notification-content {
  flex: 1;
  min-inline-size: 0;
}

.notification-title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-block-size: 24px;
}

.notification-title {
  display: -webkit-box;
  overflow: hidden;
  flex: 1 1 auto;
  -webkit-box-orient: vertical;
  font-size: 0.925rem;
  font-weight: 600;
  line-height: 1.35;
  -webkit-line-clamp: 2;
  text-overflow: ellipsis;
  white-space: normal;
}

.notification-unread-dot {
  flex: 0 0 7px;
  border-radius: 999px;
  background: rgb(var(--v-theme-error));
  block-size: 7px;
  inline-size: 7px;
  margin-block-start: 0.45rem;
}

.notification-text {
  display: block;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  block-size: auto;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
  font-size: 0.8125rem;
  line-height: 1.45;
  margin-block-start: 4px;
  max-block-size: calc(0.8125rem * 1.45 * 3);
  text-align: start;
  white-space: pre-wrap;
}

.notification-text--expanded {
  max-block-size: none;
  overflow: visible;
}

.notification-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
  font-size: 0.75rem;
  gap: 6px;
  line-height: 1.2;
  margin-block-start: 6px;
}

.notification-type {
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  padding-block: 2px;
  padding-inline: 6px;
}

.notification-empty {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  padding-block: 32px;
  padding-inline: 16px;
  text-align: center;
}

.notification-empty__icon {
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 40px;
  inline-size: 40px;
  margin-block-end: 12px;
}
</style>
