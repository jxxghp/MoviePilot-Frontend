<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'
import { useBackground } from '@/composables/useBackground'
import { useAvailableHeight } from '@/composables/useAvailableHeight'
import { useDisplay } from 'vuetify'

type LogEntry = {
  id: number
  raw: string
  level: string
  appName: string
  timestamp: string
  timestampMs: number | null
  secondKey: string
  secondDisplay: string
  timeDisplay: string
  displayLevel: string
  source: string
  message: string
  structured: boolean
}

type LogGroup = {
  id: string
  level: string
  secondKey: string
  secondDisplay: string
  items: LogEntry[]
  lastTimestampMs: number | null
}

type ParsedLog = {
  level: string
  appName: string
  timestamp: string
  source: string
  message: string
  structured: boolean
}

const props = defineProps<{
  logfile: string
}>()

const { t } = useI18n()
const theme = useTheme()
const display = useDisplay()
const { useSSE } = useBackground()

const DEFAULT_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR']
const HIDDEN_LEVELS = ['TRACE', 'CRITICAL']
const MAX_LOG_LINES = 600
const FLUSH_DELAY = 80
const GROUP_GAP_MS = 100
const SCROLL_BOTTOM_THRESHOLD = 32
const ANSI_PATTERN = /\u001B\[[0-9;]*m/g
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:,\d{3})?)?/

const parsedLogs = ref<LogEntry[]>([])
const logViewportRef = ref<HTMLElement | null>(null)
const isMounted = ref(false)
const followTail = ref(true)
const isStreamPaused = ref(false)
const searchQuery = ref<string | null>('')
const selectedLevel = ref('ALL')
const pendingLogCount = ref(0)

let timeoutId: number | null = null
let mountTimerId: number | null = null
let logSequence = 0
const buffer: string[] = []

const listenerId = `logging-${props.logfile}`

const logColorMap: Record<string, string> = {
  TRACE: 'secondary',
  DEBUG: 'secondary',
  INFO: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'error',
}

const isDarkTheme = computed(() => theme.global.current.value.dark)
const isTransparentTheme = computed(() => theme.name.value === 'transparent')
const normalizedSearchQuery = computed(() => (searchQuery.value ?? '').trim().toLowerCase())
const { availableHeight } = useAvailableHeight(96, 320)

const loggingViewStyle = computed(() => (display.mdAndUp.value ? { blockSize: `${availableHeight.value}px` } : {}))

const levelOptions = computed(() => {
  const extraLevels = parsedLogs.value
    .map(item => item.level)
    .filter(level => level && !DEFAULT_LEVELS.includes(level) && !HIDDEN_LEVELS.includes(level))

  return ['ALL', ...DEFAULT_LEVELS, ...new Set(extraLevels)]
})

const groupedLogs = computed(() => {
  const groups: LogGroup[] = []

  for (const item of parsedLogs.value) {
    const lastGroup = groups.at(-1)
    if (lastGroup && canMergeIntoGroup(lastGroup, item)) {
      lastGroup.items.push(item)
      if (item.timestampMs !== null) {
        lastGroup.lastTimestampMs = item.timestampMs
      }
      continue
    }

    groups.push({
      id: `${item.secondKey || 'log'}-${item.level || 'plain'}-${item.id}`,
      level: item.level,
      secondKey: item.secondKey,
      secondDisplay: item.secondDisplay,
      items: [item],
      lastTimestampMs: item.timestampMs,
    })
  }

  return groups
})

const filteredGroups = computed(() => {
  return groupedLogs.value
    .map(group => ({
      ...group,
      items: group.items.filter(matchesLogFilter),
    }))
    .filter(group => group.items.length > 0)
})

const visibleLogCount = computed(() => {
  return filteredGroups.value.reduce((count, group) => count + group.items.length, 0)
})

const lastVisibleLogId = computed(() => {
  return filteredGroups.value.at(-1)?.items.at(-1)?.id ?? 0
})

/** 规范化日志级别名称。 */
function normalizeLevel(level: string) {
  const normalizedLevel = level.trim().replace(/:$/, '').toUpperCase()

  if (normalizedLevel === 'WARN') {
    return 'WARNING'
  }

  if (normalizedLevel === 'FATAL') {
    return 'CRITICAL'
  }

  return normalizedLevel
}

/** 移除日志文本中的 ANSI 颜色控制符。 */
function stripAnsi(text: string) {
  return text.replace(ANSI_PATTERN, '')
}

/** 从日志文本中提取时间戳。 */
function extractTimestamp(text: string) {
  return text.match(TIMESTAMP_PATTERN)?.[0] ?? ''
}

/** 将日志时间戳转换为毫秒值。 */
function getTimestampMs(timestamp: string) {
  if (!timestamp) {
    return null
  }

  const normalizedTimestamp = timestamp.replace(' ', 'T').replace(',', '.')
  const parsedTimestamp = Date.parse(normalizedTimestamp)

  return Number.isNaN(parsedTimestamp) ? null : parsedTimestamp
}

/** 获取用于日志分组的秒级时间键。 */
function getSecondKey(timestamp: string) {
  if (!timestamp) {
    return ''
  }

  return timestamp.replace('T', ' ').slice(0, 19)
}

/** 格式化秒级时间键用于界面展示。 */
function getSecondDisplay(secondKey: string) {
  return secondKey ? secondKey.replaceAll('-', '/') : ''
}

/** 提取日志时间戳中的时分秒部分。 */
function getTimeDisplay(timestamp: string) {
  if (!timestamp) {
    return ''
  }

  return timestamp.split(' ').at(-1) ?? timestamp
}

/** 从结构化日志正文中提取消息内容。 */
function extractMessage(text: string) {
  return (
    text
      .split(/\s+-\s+/)
      .slice(1)
      .join(' - ') || text
  )
}

/** 根据原始日志和解析结果创建展示条目。 */
function createLogEntry(raw: string, parsed?: ParsedLog | null): LogEntry {
  const level = parsed?.level ?? ''
  const appName = parsed?.appName ?? ''
  const timestamp = parsed?.timestamp ?? extractTimestamp(raw)
  const secondKey = getSecondKey(timestamp)

  return {
    id: ++logSequence,
    raw,
    level,
    appName,
    timestamp,
    timestampMs: getTimestampMs(timestamp),
    secondKey,
    secondDisplay: getSecondDisplay(secondKey),
    timeDisplay: getTimeDisplay(timestamp),
    displayLevel: `${level || 'LOG'}:`,
    source: parsed?.source ?? '',
    message: parsed?.message ?? raw,
    structured: parsed?.structured ?? false,
  }
}

/** 解析 Python 风格的日志行。 */
function parsePythonStyleLog(raw: string): ParsedLog | null {
  const match = raw.match(/^([A-Za-z]+):\s+(.*)$/)
  if (!match) {
    return null
  }

  const [, rawLevel, remainder] = match
  const level = normalizeLevel(rawLevel)
  if (!DEFAULT_LEVELS.includes(level)) {
    return null
  }

  const body = remainder.trim()
  const bodyMatch = body.match(
    /^(?:\[([^\]]+)\]\s+)?(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:,\d{3})?)\s+([^\s]+)\s+-\s+(.*)$/,
  )

  return {
    level,
    appName: bodyMatch?.[1] ?? '',
    timestamp: bodyMatch?.[2] ?? extractTimestamp(body),
    source: bodyMatch?.[3] ?? '',
    message: bodyMatch?.[4] ?? extractMessage(body),
    structured: Boolean(bodyMatch),
  }
}

/** 解析中文方括号标记的日志行。 */
function parseBracketStyleLog(raw: string): ParsedLog | null {
  const match = raw.match(/^【([^】]+)】\s*(.*)$/)
  if (!match) {
    return null
  }

  const [, rawLevel, remainder] = match
  const level = normalizeLevel(rawLevel)
  const body = remainder.trim()
  const bodyMatch = body.match(
    /^(?:\[([^\]]+)\]\s+)?(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:,\d{3})?)\s+([^\s]+)\s+-\s+(.*)$/,
  )

  return {
    level,
    appName: bodyMatch?.[1] ?? '',
    timestamp: bodyMatch?.[2] ?? extractTimestamp(body),
    source: bodyMatch?.[3] ?? '',
    message: bodyMatch?.[4] ?? extractMessage(body),
    structured: Boolean(bodyMatch),
  }
}

/** 解析以时间戳开头的日志行。 */
function parseTimestampFirstLog(raw: string): ParsedLog | null {
  const match = raw.match(new RegExp(`^(${TIMESTAMP_PATTERN.source})\\s+\\[?([A-Za-z]+)\\]?\\s*(.*)$`))
  if (!match) {
    return null
  }

  const [, timestamp, rawLevel, remainder] = match
  const level = normalizeLevel(rawLevel)
  if (!DEFAULT_LEVELS.includes(level)) {
    return null
  }

  const body = remainder.trim()
  const bodyMatch = body.match(/^(?:\[([^\]]+)\]\s+)?([^\s]+)\s+-\s+(.*)$/)

  return {
    level,
    appName: bodyMatch?.[1] ?? '',
    timestamp,
    source: bodyMatch?.[2] ?? '',
    message: bodyMatch?.[3] ?? extractMessage(body),
    structured: Boolean(bodyMatch),
  }
}

/** 解析以内联级别开头的日志行。 */
function parseInlineLevelLog(raw: string): ParsedLog | null {
  const match = raw.match(/^\[?([A-Za-z]+)\]?:?\s+(.*)$/)
  if (!match) {
    return null
  }

  const [, rawLevel, remainder] = match
  const level = normalizeLevel(rawLevel)
  if (!DEFAULT_LEVELS.includes(level)) {
    return null
  }

  const body = remainder.trim()
  const timestamp = extractTimestamp(body)
  const bodyWithoutTimestamp = timestamp ? body.replace(timestamp, '').trim() : body
  const bodyMatch = bodyWithoutTimestamp.match(/^(?:\[([^\]]+)\]\s+)?([^\s]+)\s+-\s+(.*)$/)

  return {
    level,
    appName: bodyMatch?.[1] ?? '',
    timestamp,
    source: bodyMatch?.[2] ?? '',
    message: bodyMatch?.[3] ?? extractMessage(bodyWithoutTimestamp),
    structured: Boolean(bodyMatch),
  }
}

/** 将单行原始日志解析为展示条目。 */
function parseLogLine(log: string): LogEntry {
  const raw = stripAnsi(log).replace(/\r/g, '').trimEnd()
  const parsed =
    parsePythonStyleLog(raw) ?? parseBracketStyleLog(raw) ?? parseTimestampFirstLog(raw) ?? parseInlineLevelLog(raw)

  return createLogEntry(raw, parsed)
}

/** 判断日志条目是否符合当前级别和关键字筛选。 */
function matchesLogFilter(item: LogEntry) {
  const matchesLevel = selectedLevel.value === 'ALL' || item.level === selectedLevel.value
  if (!matchesLevel) {
    return false
  }

  if (!normalizedSearchQuery.value) {
    return true
  }

  return [item.raw, item.level, item.appName, item.timestamp, item.source, item.message]
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearchQuery.value)
}

/** 判断日志条目能否合并进当前时间分组。 */
function canMergeIntoGroup(group: LogGroup, item: LogEntry) {
  if (!group.secondKey || !item.secondKey) {
    return false
  }

  if (group.secondKey !== item.secondKey || group.level !== item.level) {
    return false
  }

  if (group.lastTimestampMs !== null && item.timestampMs !== null) {
    return item.timestampMs - group.lastTimestampMs <= GROUP_GAP_MS
  }

  return true
}

/** 判断日志视口是否接近底部。 */
function isNearBottom() {
  if (!logViewportRef.value) {
    return true
  }

  const { scrollTop, scrollHeight, clientHeight } = logViewportRef.value
  return scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD
}

/** 将日志视口滚动到底部。 */
function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  if (!logViewportRef.value) {
    return
  }

  logViewportRef.value.scrollTo({
    top: logViewportRef.value.scrollHeight,
    behavior,
  })
}

/** 启用日志末尾跟随并清空待查看计数。 */
function enableFollow(behavior: ScrollBehavior = 'auto') {
  followTail.value = true
  pendingLogCount.value = 0

  nextTick(() => {
    scrollToBottom(behavior)
  })
}

/** 将缓冲区中的日志批量写入展示列表。 */
function flushBuffer() {
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
  }

  if (buffer.length === 0) {
    return
  }

  const incomingLogs = buffer
    .flatMap(item => item.split(/\r?\n/))
    .filter(item => item.length > 0)
    .map(parseLogLine)

  buffer.length = 0

  if (incomingLogs.length === 0) {
    return
  }

  const shouldFollow = isNearBottom()

  parsedLogs.value = [...parsedLogs.value, ...incomingLogs].slice(-MAX_LOG_LINES)

  followTail.value = shouldFollow

  if (shouldFollow) {
    enableFollow()
    return
  }

  pendingLogCount.value += incomingLogs.length
}

/** 安排一次延迟缓冲区刷新。 */
function scheduleFlush() {
  if (timeoutId) {
    return
  }

  timeoutId = window.setTimeout(() => {
    flushBuffer()
  }, FLUSH_DELAY)
}

/** 接收并缓存 SSE 日志消息。 */
function handleSSEMessage(event: MessageEvent) {
  if (!event.data) {
    return
  }

  isConnected.value = true
  buffer.push(String(event.data))
  scheduleFlush()
}

const { manager, isConnected } = useSSE(
  `${import.meta.env.VITE_API_BASE_URL}system/logging?logfile=${encodeURIComponent(props.logfile ?? 'moviepilot.log')}`,
  handleSSEMessage,
  listenerId,
  {
    backgroundCloseDelay: 5000,
    reconnectDelay: 3000,
    maxReconnectAttempts: 3,
    connectDelay: 300,
  },
)

/** 暂停实时日志流。 */
function pauseStream() {
  if (isStreamPaused.value) {
    return
  }

  flushBuffer()
  isStreamPaused.value = true
  isConnected.value = false
  manager.removeMessageListener(listenerId)
}

/** 恢复实时日志流。 */
function resumeStream() {
  if (!isStreamPaused.value) {
    return
  }

  isStreamPaused.value = false
  isConnected.value = false
  manager.addMessageListener(listenerId, handleSSEMessage)
}

/** 切换实时日志流的暂停状态。 */
function toggleStreamState() {
  if (isStreamPaused.value) {
    resumeStream()
    return
  }

  pauseStream()
}

/** 根据滚动位置更新日志末尾跟随状态。 */
function handleScroll() {
  if (isNearBottom()) {
    followTail.value = true
    pendingLogCount.value = 0
    return
  }

  followTail.value = false
}

watch(lastVisibleLogId, (currentId, previousId) => {
  if (!followTail.value || currentId === previousId) {
    return
  }

  nextTick(() => {
    scrollToBottom()
  })
})

onMounted(() => {
  mountTimerId = window.setTimeout(() => {
    isMounted.value = true
  }, 200)
})

onUnmounted(() => {
  if (mountTimerId) {
    clearTimeout(mountTimerId)
  }

  flushBuffer()
})
</script>

<template>
  <VProgressLinear v-if="!isStreamPaused" class="logging-live-progress" indeterminate color="primary" height="1" />
  <div
    class="logging-view"
    :class="{ 'is-dark-theme': isDarkTheme, 'is-transparent-theme': isTransparentTheme }"
    :style="loggingViewStyle"
  >
    <div class="logging-toolbar px-3">
      <VBtnToggle
        v-if="display.mdAndUp.value"
        v-model="selectedLevel"
        mandatory
        divided
        density="compact"
        variant="text"
        selected-class="logging-level-toggle__button--active"
        class="logging-level-toggle"
      >
        <VBtn
          v-for="level in levelOptions"
          :key="level"
          :value="level"
          :class="[`logging-level-toggle__button--${level.toLowerCase()}`]"
          class="logging-level-toggle__button"
        >
          {{ level === 'ALL' ? t('common.all') : level }}
        </VBtn>
      </VBtnToggle>

      <VSelect
        v-else
        v-model="selectedLevel"
        :items="levelOptions"
        density="compact"
        variant="plain"
        hide-details
        class="logging-level-select"
        :menu-props="{ width: 'auto' }"
      >
        <template #selection="{ item }">
          <span
            :class="item.value === 'ALL' ? 'text-primary' : `text-${logColorMap[item.value] || 'secondary'}`"
            class="font-weight-medium"
          >
            {{ item.value === 'ALL' ? t('logging.allLevels') : item.value }}
          </span>
        </template>
        <template #item="{ props, item }">
          <VListItem v-bind="props" density="compact">
            <template #title>
              <span
                :class="item.value === 'ALL' ? 'text-primary' : `text-${logColorMap[item.value] || 'secondary'}`"
                class="font-weight-medium"
              >
                {{ item.value === 'ALL' ? t('logging.allLevels') : item.value }}
              </span>
            </template>
          </VListItem>
        </template>
      </VSelect>

      <VTextField
        v-model="searchQuery"
        class="logging-search"
        density="compact"
        variant="plain"
        hide-details
        clearable
        @click:clear="searchQuery = ''"
        prepend-inner-icon="mdi-magnify"
        :placeholder="t('logging.searchPlaceholder')"
      />

      <VBtn
        variant="text"
        icon
        class="logging-stream-action"
        :class="{ 'is-live': !isStreamPaused }"
        :title="isStreamPaused ? t('logging.resumeStream') : t('logging.pauseStream')"
        @click="toggleStreamState"
      >
        <VIcon :icon="isStreamPaused ? 'mdi-play' : 'mdi-pause'" />
      </VBtn>
    </div>

    <div ref="logViewportRef" class="logging-shell is-wrap" @scroll.passive="handleScroll">
      <div v-if="!isMounted" class="logging-loading-overlay">
        <LoadingBanner :text="t('logging.initializing') + ' ...'" />
      </div>

      <div v-else-if="filteredGroups.length === 0" class="logging-empty">
        <VIcon :icon="parsedLogs.length === 0 ? 'mdi-console-line' : 'mdi-filter-remove-outline'" size="20" />
        <span>
          {{ parsedLogs.length === 0 ? t('logging.waitingForLogs') : t('common.noMatchingData') }}
        </span>
      </div>

      <div v-else class="logging-list">
        <div v-for="(group, index) in filteredGroups" :key="group.id" class="logging-record">
          <div class="logging-record-time">{{ group.secondDisplay || '...' }}</div>

          <div class="logging-record-panel" :class="index % 2 === 0 ? 'is-even' : 'is-odd'">
            <div
              class="logging-record-accent"
              :class="[`level-${(group.level || 'plain').toLowerCase()}`, { 'is-burst': group.items.length > 1 }]"
            />

            <div class="logging-record-lines">
              <div v-for="item in group.items" :key="item.id" class="logging-record-line">
                <div class="logging-record-level" :class="`level-${(item.level || 'plain').toLowerCase()}`">
                  {{ item.displayLevel }}
                </div>

                <div v-if="item.appName" class="logging-record-app">[{{ item.appName }}]</div>

                <div class="logging-record-body">
                  <span v-if="item.timeDisplay" class="logging-record-inline-time">{{ item.timeDisplay }}</span>
                  {{ item.message }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="pendingLogCount > 0 && !followTail" class="logging-latest-action">
        <VBtn
          size="small"
          color="primary"
          variant="elevated"
          prepend-icon="mdi-arrow-down"
          @click="enableFollow('smooth')"
        >
          {{ t('logging.jumpToLatest', { count: pendingLogCount }) }}
        </VBtn>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */
.logging-view {
  --logging-shell-bg: rgba(var(--v-theme-surface), 0.96);
  --logging-record-bg-even: rgba(var(--v-theme-surface-variant), 0.01);
  --logging-record-bg-odd: rgba(var(--v-theme-surface-variant), 0.005);
  --logging-text: rgba(var(--v-theme-on-surface), 0.88);
  --logging-toolbar-control-size: 2rem;
  --logging-muted: rgba(var(--v-theme-on-surface), 0.56);

  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 20rem;
}

.logging-view.is-dark-theme {
  --logging-shell-bg: rgba(var(--v-theme-surface), 0.72);
  --logging-record-bg-even: rgba(var(--v-theme-on-surface), 0.02);
  --logging-record-bg-odd: rgba(var(--v-theme-on-surface), 0.008);
  --logging-border: rgba(var(--v-theme-on-surface), 0.12);
  --logging-shadow: inset 0 1px 0 rgba(255, 255, 255, 4%);
}

.logging-view.is-transparent-theme {
  --logging-shell-bg: transparent;
  --logging-record-bg-even: transparent;
  --logging-record-bg-odd: transparent;
  --logging-border: rgba(var(--v-theme-on-surface), 0.1);
  --logging-shadow: none;
}

.logging-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.logging-search {
  flex: 1 1 9rem;
  min-inline-size: 5rem;
}

.logging-stream-action {
  color: var(--logging-muted);
}

.logging-stream-action.is-live {
  color: rgb(var(--v-theme-success));
}

.logging-search :deep(.v-field) {
  border-radius: var(--app-field-radius);
  background: transparent !important;
  box-shadow: none !important;
}

.logging-search :deep(.v-field__outline),
.logging-search :deep(.v-field__overlay) {
  display: none;
}

.logging-search :deep(.v-field__input) {
  padding-inline-start: 0;
}

.logging-level-select {
  flex: 0 0 7rem;
  min-inline-size: 7rem;
}

.logging-level-toggle {
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  border-radius: var(--app-control-radius);
  background: transparent;
  block-size: var(--logging-toolbar-control-size);
  box-shadow: none !important;
}

.logging-level-toggle :deep(.logging-level-toggle__button) {
  border-color: rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 0;
  block-size: 100%;
  color: var(--logging-muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0;
  min-inline-size: auto;
  padding-inline: 1.125rem;
  text-transform: none;
}

.logging-level-toggle :deep(.logging-level-toggle__button--debug) {
  color: rgb(var(--v-theme-secondary));
}

.logging-level-toggle :deep(.logging-level-toggle__button--info) {
  color: rgb(var(--v-theme-success));
}

.logging-level-toggle :deep(.logging-level-toggle__button--warning) {
  color: rgb(var(--v-theme-warning));
}

.logging-level-toggle :deep(.logging-level-toggle__button--error) {
  color: rgb(var(--v-theme-error));
}

.logging-level-toggle :deep(.logging-level-toggle__button--active) {
  background: rgba(var(--v-theme-primary), 0.16);
  color: rgb(var(--v-theme-primary));
}

.logging-level-select :deep(.v-field) {
  border-radius: var(--app-field-radius);
  background: transparent !important;
  box-shadow: none !important;
}

.logging-level-select :deep(.v-field__outline),
.logging-level-select :deep(.v-field__overlay) {
  display: none;
}

.logging-level-select :deep(.v-field__input) {
  padding-inline: 0;
}

@media (width >= 960px) {
  .logging-toolbar {
    padding-block-start: 0.25rem;
  }

  .logging-search,
  .logging-stream-action {
    align-self: center;
  }

  .logging-search :deep(.v-field) {
    display: flex;
    align-items: center;
    block-size: var(--logging-toolbar-control-size);
    min-block-size: var(--logging-toolbar-control-size);
  }

  .logging-search :deep(.v-field__field),
  .logging-search :deep(.v-field__input),
  .logging-search :deep(.v-field__prepend-inner),
  .logging-search :deep(.v-field__clearable) {
    align-items: center;
    min-block-size: var(--logging-toolbar-control-size);
  }

  .logging-search :deep(.v-field__input) {
    padding-block: 0;
  }

  .logging-search :deep(.v-field__prepend-inner),
  .logging-search :deep(.v-field__clearable) {
    padding-block: 0;
  }

  .logging-stream-action {
    block-size: var(--logging-toolbar-control-size);
    inline-size: var(--logging-toolbar-control-size);
  }
}

.logging-shell {
  position: relative;
  overflow: auto;
  flex: 1 1 auto;
  padding: 0.875rem;
  border: 1px solid var(--logging-border);
  background: linear-gradient(180deg, var(--logging-shell-bg), rgba(var(--v-theme-surface), 0.9));
  box-shadow: var(--logging-shadow);
}

.logging-view.is-transparent-theme .logging-shell {
  backdrop-filter: none;
  background: transparent;
}

.logging-loading-overlay {
  position: sticky;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
  background: linear-gradient(180deg, rgba(var(--v-theme-surface), 0.72), rgba(var(--v-theme-surface), 0.64));
  inset-block-start: 0;
  margin-block-end: 0.75rem;
  margin-inline: -0.875rem;
  padding-block: 0.5rem 0.75rem;
  padding-inline: 0.875rem;
}

.logging-view.is-dark-theme .logging-loading-overlay {
  background: linear-gradient(180deg, rgba(var(--v-theme-surface), 0.62), rgba(var(--v-theme-surface), 0.52));
}

.logging-view.is-transparent-theme .logging-loading-overlay {
  backdrop-filter: none;
  background: transparent;
}

.logging-loading-overlay :deep(.initial-loading-container) {
  min-block-size: 10rem;
}

.logging-live-progress :deep(.v-progress-linear__background) {
  opacity: 0.12;
}

.logging-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: 100%;
  color: var(--logging-muted);
  gap: 0.5rem;
  min-block-size: 16rem;
}

.logging-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-inline-size: 100%;
}

.logging-record {
  display: grid;
  align-items: start;
  grid-template-columns: 11rem minmax(0, 1fr);
}

.logging-record-time {
  color: rgb(var(--v-theme-primary));
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.5;
  padding-block: 0.625rem;
  white-space: nowrap;
}

.logging-record-panel {
  display: flex;
  align-items: stretch;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.04);
  border-radius: var(--app-surface-radius);
  gap: 0.75rem;
  min-inline-size: 0;
  padding-block: 0.5rem;
  padding-inline: 0.5rem;
}

.logging-record-panel.is-even {
  background: var(--logging-record-bg-even);
}

.logging-record-panel.is-odd {
  background: var(--logging-record-bg-odd);
}

.logging-view.is-dark-theme .logging-record-panel {
  border-color: rgba(var(--v-theme-on-surface), 0.08);
}

.logging-record-accent {
  flex: 0 0 auto;
  align-self: flex-start;
  border-radius: 999px;
  background-color: rgba(var(--v-theme-on-surface), 0.24);
  block-size: 0.5rem;
  inline-size: 0.5rem;
  margin-block-start: 0.45rem;
}

.logging-record-accent.is-burst {
  align-self: stretch;
  border-radius: 999px;
  block-size: auto;
  inline-size: 0.5rem;
  margin-block-start: 0;
}

.logging-record-lines {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.125rem;
  min-inline-size: 0;
}

.logging-record-line {
  display: flex;
  align-items: flex-start;
  color: var(--logging-text);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.8125rem;
  gap: 0.75rem;
  line-height: 1.6;
  min-inline-size: max-content;
}

.logging-shell.is-wrap .logging-record-line {
  min-inline-size: 0;
}

.logging-record-level {
  flex: 0 0 4rem;
  font-weight: 700;
  min-inline-size: 4rem;
}

.logging-record-body {
  color: var(--logging-text);
  min-inline-size: 0;
  white-space: pre;
}

.logging-record-app,
.logging-record-inline-time {
  flex: 0 0 auto;
  color: var(--logging-muted);
}

.logging-record-app {
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.logging-shell.is-wrap .logging-record-body {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.logging-record-level.level-trace,
.logging-record-level.level-debug {
  color: rgb(var(--v-theme-secondary));
}

.logging-record-level.level-info {
  color: rgb(var(--v-theme-success));
}

.logging-record-level.level-warning {
  color: rgb(var(--v-theme-warning));
}

.logging-record-level.level-error,
.logging-record-level.level-critical {
  color: rgb(var(--v-theme-error));
}

.logging-record-level.level-plain {
  color: var(--logging-muted);
}

.logging-record-accent.level-trace,
.logging-record-accent.level-debug {
  background-color: rgb(var(--v-theme-secondary));
}

.logging-record-accent.level-info {
  background-color: rgb(var(--v-theme-success));
}

.logging-record-accent.level-warning {
  background-color: rgb(var(--v-theme-warning));
}

.logging-record-accent.level-error,
.logging-record-accent.level-critical {
  background-color: rgb(var(--v-theme-error));
}

.logging-record-accent.level-plain {
  background-color: rgba(var(--v-theme-on-surface), 0.24);
}

.logging-latest-action {
  position: sticky;
  display: flex;
  justify-content: flex-end;
  inset-block-end: 0.75rem;
  margin-block-start: 0.75rem;
  pointer-events: none;
}

.logging-latest-action :deep(.v-btn) {
  box-shadow: 0 8px 24px rgba(15, 23, 42, 16%);
  pointer-events: auto;
}

@media (width <= 960px) {
  .logging-view {
    flex: 1 1 auto;
    block-size: auto;
    min-block-size: 0;
  }

  .logging-record {
    gap: 0.375rem;
    grid-template-columns: 9.5rem minmax(0, 1fr);
  }

  .logging-record-level {
    flex-basis: 4.75rem;
    min-inline-size: 4.75rem;
  }
}

@media (width <= 640px) {
  .logging-view {
    gap: 0.5rem;
    min-block-size: 0;
  }

  .logging-record {
    gap: 0.25rem;
    grid-template-columns: minmax(0, 1fr);
  }

  .logging-record-time {
    padding-block: 0;
  }

  .logging-record-panel {
    padding-block: 0.5rem;
    padding-inline: 0.625rem;
  }

  .logging-record-line {
    gap: 0.5rem;
  }

  .logging-shell {
    padding: 0.625rem;
  }

  .logging-loading-overlay {
    margin-inline: -0.625rem;
    padding-inline: 0.625rem;
  }
}
</style>
