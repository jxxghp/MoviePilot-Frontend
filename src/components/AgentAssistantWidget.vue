<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import mdLinkAttributes from 'markdown-it-link-attributes'
import type { PerfectScrollbarExpose } from 'vue3-perfect-scrollbar'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useAuthStore, useUserStore } from '@/stores'

type AgentMessageRole = 'user' | 'assistant'
type AgentMessageStatus = 'idle' | 'streaming' | 'done' | 'error'
type AgentAttachmentKind = 'audio' | 'file' | 'image'
type AgentChoiceStatus = 'pending' | 'selected' | 'expired'
type InfiniteScrollSide = 'start' | 'end' | 'both'
type InfiniteScrollStatus = 'empty' | 'error' | 'loading' | 'ok'

interface AgentToolCall {
  id: string
  message: string
  status: 'running' | 'done'
}

interface AgentMessageAttachment {
  kind: AgentAttachmentKind
  url: string
  download_url?: string
  name?: string
  mime_type?: string
  size?: number
  local_path?: string
}

interface AgentChoiceButton {
  label: string
  callback_data: string
}

interface AgentChoiceCard {
  id: string
  title?: string
  prompt: string
  buttons: AgentChoiceButton[]
  status: AgentChoiceStatus
  selected_label?: string
  selected_value?: string
}

interface AgentChatMessage {
  id: string
  role: AgentMessageRole
  content: string
  createdAt: number
  status: AgentMessageStatus
  tools: AgentToolCall[]
  attachments: AgentMessageAttachment[]
  choices: AgentChoiceCard[]
}

interface AgentSessionHistoryItem {
  sessionId: string
  clientSessionId?: string
  title: string
  preview?: string
  channel?: string
  source?: string
  createdAt: number
  updatedAt: number
  messages: AgentChatMessage[]
}

interface AgentStreamEvent {
  type: 'start' | 'delta' | 'tool' | 'attachment' | 'choice' | 'done' | 'error'
  attachment?: AgentMessageAttachment
  choice?: Omit<AgentChoiceCard, 'status'>
  content?: string
  message?: string
  session_id?: string
}

interface AgentPendingAttachment {
  id: string
  file: File
  kind: AgentAttachmentKind
  name: string
  mime_type: string
  size: number
  preview_url?: string
}

interface AgentOutgoingFile {
  ref: string
  name?: string
  mime_type?: string
  size?: number
  local_path?: string
  status?: string
}

interface PreparedAgentAttachments {
  images: string[]
  files: AgentOutgoingFile[]
  audioRefs: string[]
  userAttachments: AgentMessageAttachment[]
}

interface AgentServerSession {
  session_id: string
  client_session_id?: string
  title?: string
  preview?: string
  channel?: string
  source?: string
  created_at?: string
  updated_at?: string
  messages?: AgentChatMessage[]
}

const { t } = useI18n()
const display = useDisplay()
const authStore = useAuthStore()
const userStore = useUserStore()

const STORAGE_KEY = 'moviepilot-agent-assistant-state'
const HISTORY_STORAGE_KEY = 'moviepilot-agent-assistant-history'
const HISTORY_PAGE_SIZE = 30
const MAX_LOCAL_HISTORY_SESSIONS = 120
const MAX_PERSISTED_MESSAGES = 30
const HISTORY_TITLE_LENGTH = 36
const HISTORY_ITEM_HEIGHT = 76

const drawer = ref(false)
const inputText = ref('')
const messages = ref<AgentChatMessage[]>([])
const historySessions = ref<AgentSessionHistoryItem[]>([])
const sessionId = ref('')
const sending = ref(false)
const streamError = ref('')
const historyMenuOpen = ref(false)
const messageListRef = ref<PerfectScrollbarExpose | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingAttachments = ref<AgentPendingAttachment[]>([])
const recording = ref(false)
const recordingStartedAt = ref(0)
const recordingDuration = ref(0)
const historyLoading = ref(false)
const historyLoadingMore = ref(false)
const historyPage = ref(1)
const historyHasMore = ref(true)
let abortController: AbortController | null = null
let mediaRecorder: MediaRecorder | null = null
let mediaRecorderStream: MediaStream | null = null
let recordingTimer: number | null = null
let recordingChunks: BlobPart[] = []

const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  typographer: true,
})

md.use(mdLinkAttributes, {
  attrs: {
    target: '_blank',
    rel: 'noopener noreferrer',
  },
})

const canSend = computed(
  () =>
    (inputText.value.trim().length > 0 || pendingAttachments.value.length > 0) && !sending.value && !recording.value,
)
const canRecord = computed(() => !sending.value && !recording.value)
const recordingTimeText = computed(() => {
  const seconds = Math.max(0, recordingDuration.value)
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60

  return `${minutes}:${String(remainSeconds).padStart(2, '0')}`
})
// 窄屏下直接全屏，避免聊天内容被压成半屏窄栏。
const drawerWidth = computed(() => (display.mdAndDown.value ? '100vw' : '30rem'))
const hasMessages = computed(() => messages.value.length > 0)
const hasHistorySessions = computed(() => historySessions.value.length > 0)
const currentUserName = computed(() => userStore.getUserName || t('common.user'))
const drawerStyle = computed(() => ({
  '--agent-assistant-panel-width': drawerWidth.value,
}))

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createSessionId() {
  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeStoredMessages(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.slice(-MAX_PERSISTED_MESSAGES).map(message => ({
    ...message,
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    choices: Array.isArray(message.choices) ? message.choices : [],
    tools: Array.isArray(message.tools) ? message.tools : [],
  })) as AgentChatMessage[]
}

function parseServerTime(value?: string) {
  if (!value) return Date.now()
  const parsed = Date.parse(value.replace(' ', 'T'))

  return Number.isFinite(parsed) ? parsed : Date.now()
}

// 规范化本地历史会话，过滤无效数据并按最近更新时间排序。
function normalizeHistorySessions(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map(item => {
      const messages = normalizeStoredMessages(item?.messages)
      const sessionIdValue = typeof item?.sessionId === 'string' ? item.sessionId : ''
      if (!sessionIdValue || (messages.length === 0 && !item?.title && !item?.preview)) return null

      const firstMessageTime = messages[0]?.createdAt || Date.now()
      const lastMessageTime = messages.at(-1)?.createdAt || firstMessageTime

      return {
        sessionId: sessionIdValue,
        clientSessionId: typeof item?.clientSessionId === 'string' ? item.clientSessionId : undefined,
        title:
          typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : buildSessionHistoryTitle(messages),
        preview: typeof item?.preview === 'string' ? item.preview : undefined,
        channel: typeof item?.channel === 'string' ? item.channel : undefined,
        source: typeof item?.source === 'string' ? item.source : undefined,
        createdAt: Number(item?.createdAt) || firstMessageTime,
        updatedAt: Number(item?.updatedAt) || lastMessageTime,
        messages,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b!.updatedAt - a!.updatedAt)
    .slice(0, MAX_LOCAL_HISTORY_SESSIONS) as AgentSessionHistoryItem[]
}

function normalizeServerSession(item: AgentServerSession, withMessages = false): AgentSessionHistoryItem | null {
  const sessionIdValue = typeof item?.session_id === 'string' ? item.session_id : ''
  if (!sessionIdValue) return null

  const messages = normalizeStoredMessages(item.messages || [])
  const createdAt = parseServerTime(item.created_at)
  const updatedAt = parseServerTime(item.updated_at)

  return {
    sessionId: sessionIdValue,
    clientSessionId: item.client_session_id,
    title:
      item.title?.trim() ||
      (messages.length ? buildSessionHistoryTitle(messages) : t('agentAssistant.untitledSession')),
    preview: item.preview,
    channel: item.channel,
    source: item.source,
    createdAt,
    updatedAt,
    messages: withMessages ? messages : [],
  }
}

function getHistoryIdentity(session: AgentSessionHistoryItem) {
  return session.clientSessionId || session.sessionId
}

function dedupeHistorySessions(sessions: AgentSessionHistoryItem[]) {
  const serverSessions = sessions.filter(item => item.sessionId.startsWith('web-agent:'))
  const serverClientIds = new Set(serverSessions.map(getHistoryIdentity))
  const seen = new Set<string>()
  const deduped: AgentSessionHistoryItem[] = []

  for (const session of sessions) {
    const identity = getHistoryIdentity(session)
    if (!session.sessionId.startsWith('web-agent:') && serverClientIds.has(identity)) continue
    if (seen.has(identity) || seen.has(session.sessionId)) continue
    seen.add(identity)
    seen.add(session.sessionId)
    deduped.push(session)
  }

  return deduped.sort((a, b) => b.updatedAt - a.updatedAt)
}

async function fetchAgentApi(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {})
  if (authStore.token) headers.set('Authorization', `Bearer ${authStore.token}`)

  const response = await fetch(resolveApiUrl(path), {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())

  const result = await response.json()
  if (!result?.success) throw new Error(result?.message || t('agentAssistant.error'))

  return result.data
}

// 从 localStorage 读取历史会话索引，读取失败时回退为空列表。
function restoreHistorySessions() {
  try {
    historySessions.value = normalizeHistorySessions(JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]'))
  } catch (error) {
    historySessions.value = []
  }
}

async function loadServerHistorySessions() {
  historyPage.value = 1
  historyHasMore.value = true
  historyLoading.value = true
  try {
    const data = await fetchAgentApi(`message/agent/sessions?page=1&count=${HISTORY_PAGE_SIZE}`)
    const sessions = Array.isArray(data)
      ? (data
          .map(item => normalizeServerSession(item as AgentServerSession))
          .filter(Boolean) as AgentSessionHistoryItem[])
      : []
    historySessions.value = dedupeHistorySessions(sessions)
    historyHasMore.value = sessions.length >= HISTORY_PAGE_SIZE
    persistHistorySessions()
  } catch (error) {
    restoreHistorySessions()
    historyHasMore.value = false
  } finally {
    historyLoading.value = false
  }
}

async function loadMoreServerHistorySessions(options?: { done?: (status: InfiniteScrollStatus) => void }) {
  if (historyLoading.value || historyLoadingMore.value || !historyHasMore.value) {
    options?.done?.(historyHasMore.value ? 'ok' : 'empty')
    return
  }

  historyLoadingMore.value = true
  try {
    const nextPage = historyPage.value + 1
    const data = await fetchAgentApi(`message/agent/sessions?page=${nextPage}&count=${HISTORY_PAGE_SIZE}`)
    const sessions = Array.isArray(data)
      ? (data
          .map(item => normalizeServerSession(item as AgentServerSession))
          .filter(Boolean) as AgentSessionHistoryItem[])
      : []
    const existingIds = new Set(historySessions.value.map(item => item.sessionId))
    historySessions.value = dedupeHistorySessions([
      ...historySessions.value,
      ...sessions.filter(item => !existingIds.has(item.sessionId)),
    ]).slice(0, MAX_LOCAL_HISTORY_SESSIONS)
    historyPage.value = nextPage
    historyHasMore.value = sessions.length >= HISTORY_PAGE_SIZE
    persistHistorySessions()
    options?.done?.(sessions.length ? 'ok' : 'empty')
  } catch (error) {
    options?.done?.('error')
  } finally {
    historyLoadingMore.value = false
  }
}

async function handleHistoryInfiniteLoad({
  done,
}: {
  side: InfiniteScrollSide
  done: (status: InfiniteScrollStatus) => void
}) {
  await loadMoreServerHistorySessions({ done })
}

async function loadServerHistorySession(targetSessionId: string) {
  const data = await fetchAgentApi(`message/agent/sessions/${encodeURIComponent(targetSessionId)}`)
  const session = normalizeServerSession(data as AgentServerSession, true)
  if (!session) throw new Error(t('agentAssistant.historyLoadFailed'))

  historySessions.value = dedupeHistorySessions([
    session,
    ...historySessions.value.filter(item => item.sessionId !== targetSessionId),
  ]).slice(0, MAX_LOCAL_HISTORY_SESSIONS)
  persistHistorySessions()

  return session
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const latestSession = historySessions.value[0]
      if (latestSession?.messages.length) {
        sessionId.value = latestSession.sessionId
        messages.value = normalizeStoredMessages(latestSession.messages)
      } else {
        sessionId.value = createSessionId()
      }

      return
    }

    const state = JSON.parse(raw)
    sessionId.value = state.sessionId || createSessionId()
    messages.value = normalizeStoredMessages(state.messages)
    upsertCurrentSessionHistory()
  } catch (error) {
    sessionId.value = createSessionId()
  }
}

// 将历史会话列表写入 localStorage，空间不足时保留最近的一半会话重试。
function persistHistorySessions() {
  const sessions = dedupeHistorySessions(historySessions.value).slice(0, MAX_LOCAL_HISTORY_SESSIONS)
  historySessions.value = sessions

  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(sessions))
  } catch (error) {
    const retainedCount = Math.max(1, Math.ceil(sessions.length / 2))
    historySessions.value = sessions.slice(0, retainedCount)

    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historySessions.value))
    } catch (retryError) {
      // 浏览器本地空间不足时放弃本次历史写入，不影响当前对话继续使用。
    }
  }
}

// 生成会话列表里显示的短标题，优先取第一条用户消息。
function buildSessionHistoryTitle(sessionMessages: AgentChatMessage[]) {
  const firstUserMessage = sessionMessages.find(message => message.role === 'user' && getMessageSummaryText(message))
  const firstReadableMessage = firstUserMessage || sessionMessages.find(message => getMessageSummaryText(message))
  const title = firstReadableMessage ? getMessageSummaryText(firstReadableMessage) : ''

  return truncateHistoryText(title || t('agentAssistant.untitledSession'), HISTORY_TITLE_LENGTH)
}

function getSessionChannelLabel(session: AgentSessionHistoryItem) {
  if (session.channel === 'WebAgent') return t('agentAssistant.webAgentChannel')

  const parts = [session.channel, session.source].filter(Boolean)
  if (!parts.length) return t('agentAssistant.unknownChannel')

  return parts.join(' / ')
}

// 提取消息的可读摘要，纯附件消息会使用附件名称或附件占位文本。
function getMessageSummaryText(message: AgentChatMessage) {
  const text = message.content.replace(/\s+/g, ' ').trim()
  if (text) return text

  const firstAttachment = message.attachments[0]
  if (firstAttachment) return firstAttachment.name || t('agentAssistant.attachmentMessage')

  return ''
}

// 按指定长度截断历史列表文本，避免长提示词撑开面板。
function truncateHistoryText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value

  return `${value.slice(0, maxLength).trim()}...`
}

// 将当前会话同步到历史索引，空会话不会进入历史列表。
function upsertCurrentSessionHistory() {
  if (!sessionId.value || messages.value.length === 0) return

  const storedMessages = normalizeStoredMessages(messages.value)
  const existingSession = historySessions.value.find(item => item.sessionId === sessionId.value)
  const createdAt = existingSession?.createdAt || storedMessages[0]?.createdAt || Date.now()
  const updatedAt = storedMessages.at(-1)?.createdAt || Date.now()
  const nextSession: AgentSessionHistoryItem = {
    sessionId: sessionId.value,
    clientSessionId: existingSession?.clientSessionId || sessionId.value,
    title: buildSessionHistoryTitle(storedMessages),
    preview: existingSession?.preview,
    channel: existingSession?.channel || 'WebAgent',
    source: existingSession?.source || 'web-agent',
    createdAt,
    updatedAt,
    messages: storedMessages,
  }

  historySessions.value = dedupeHistorySessions([
    nextSession,
    ...historySessions.value.filter(item => item.sessionId !== sessionId.value),
  ]).slice(0, MAX_LOCAL_HISTORY_SESSIONS)

  persistHistorySessions()
}

async function saveCurrentSessionToServer() {
  if (!sessionId.value || messages.value.length === 0) return

  await fetchAgentApi(`message/agent/sessions/${encodeURIComponent(sessionId.value)}/display`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: buildSessionHistoryTitle(messages.value),
      messages: normalizeStoredMessages(messages.value),
    }),
  })
}

// 持久化当前会话状态，并按需同步到历史会话列表。
function persistState(options: { syncHistory?: boolean } = {}) {
  const { syncHistory = true } = options

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessionId: sessionId.value,
        messages: messages.value.slice(-MAX_PERSISTED_MESSAGES),
      }),
    )
  } catch (error) {
    // 浏览器本地空间不足时保留内存态，避免发送过程被持久化异常打断。
  }

  if (syncHistory) upsertCurrentSessionHistory()
}

function renderMarkdown(value: string) {
  if (!value) return ''
  return md.render(value)
}

function resolveApiUrl(path: string) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/'
  return `${baseUrl.replace(/\/?$/, '/')}${path.replace(/^\//, '')}`
}

// 获取 PerfectScrollbar 内部滚动元素，供自动滚动和滚动条刷新使用。
function getMessageScrollerElement() {
  return messageListRef.value?.ps?.element || null
}

function scrollToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const scroller = getMessageScrollerElement()
      if (!scroller) return

      messageListRef.value?.ps?.update()
      scroller.scrollTop = scroller.scrollHeight
      messageListRef.value?.ps?.update()
    })
  })
}

// 新会话展示空态时必须回到顶部，避免复用上一段长会话的滚动位置导致空白。
function scrollToTop() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const scroller = getMessageScrollerElement()
      if (!scroller) return

      messageListRef.value?.ps?.update()
      scroller.scrollTop = 0
      messageListRef.value?.ps?.update()
    })
  })
}

function syncInputHeight() {
  nextTick(() => {
    const input = inputRef.value
    if (!input) return

    input.style.blockSize = 'auto'
    input.style.blockSize = `${Math.min(input.scrollHeight, 120)}px`
  })
}

// 刷新消息数组引用，确保流式回调中的消息字段变更能稳定触发当前会话视图更新。
function refreshMessageList() {
  messages.value = [...messages.value]
}

// 添加一条聊天消息，并返回消息列表中的响应式对象供后续流式更新使用。
function addMessage(
  role: AgentMessageRole,
  content: string,
  status: AgentMessageStatus = 'idle',
  attachments: AgentMessageAttachment[] = [],
) {
  const message: AgentChatMessage = {
    id: createId(role),
    role,
    content,
    createdAt: Date.now(),
    status,
    attachments,
    choices: [],
    tools: [],
  }
  messages.value.push(message)
  const reactiveMessage = messages.value[messages.value.length - 1]

  persistState()
  scrollToBottom()
  return reactiveMessage
}

function normalizeToolMessage(message: string) {
  return message.replace(/^=>\s*/, '').trim()
}

function markToolsDone(message: AgentChatMessage) {
  message.tools.forEach(tool => {
    tool.status = 'done'
  })
}

function applyStreamEvent(event: AgentStreamEvent, assistantMessage: AgentChatMessage) {
  switch (event.type) {
    case 'delta':
      assistantMessage.content += event.content || ''
      break
    case 'tool':
      markToolsDone(assistantMessage)
      assistantMessage.tools.push({
        id: createId('tool'),
        message: normalizeToolMessage(event.message || ''),
        status: 'running',
      })
      break
    case 'attachment':
      if (event.attachment?.url) {
        assistantMessage.attachments.push(event.attachment)
      }
      break
    case 'choice':
      if (event.choice?.id) {
        assistantMessage.choices.push({
          ...event.choice,
          status: 'pending',
        })
      }
      break
    case 'done':
      if (assistantMessage.status !== 'error') {
        assistantMessage.status = 'done'
      }
      markToolsDone(assistantMessage)
      break
    case 'error':
      assistantMessage.status = 'error'
      // 后端流式错误已经以 AI 消息展示，避免底部提示条重复且持续占位。
      assistantMessage.content ||= event.message || t('agentAssistant.error')
      markToolsDone(assistantMessage)
      break
    case 'start':
      if (event.session_id) sessionId.value = event.session_id
      break
    default:
      break
  }

  refreshMessageList()
  persistState()
  scrollToBottom()
}

function parseSseBlock(block: string) {
  const data = block
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')

  if (!data) return null
  return JSON.parse(data) as AgentStreamEvent
}

async function readAgentStream(response: Response, assistantMessage: AgentChatMessage) {
  if (!response.body) {
    throw new Error(t('agentAssistant.noStream'))
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\n\n/)
    buffer = blocks.pop() || ''

    for (const block of blocks) {
      const event = parseSseBlock(block)
      if (event) applyStreamEvent(event, assistantMessage)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    const event = parseSseBlock(buffer)
    if (event) applyStreamEvent(event, assistantMessage)
  }
}

function resolveAttachmentUrl(url?: string) {
  if (!url) return ''
  if (/^(https?:|data:|blob:|\/)/.test(url)) return url

  return resolveApiUrl(url)
}

function getAttachmentDownloadUrl(attachment: AgentMessageAttachment) {
  return resolveAttachmentUrl(attachment.download_url || attachment.url)
}

function getAttachmentName(attachment: AgentMessageAttachment) {
  return attachment.name || (attachment.kind === 'image' ? 'image' : 'attachment')
}

function getAttachmentIcon(attachment: { kind: AgentAttachmentKind }) {
  if (attachment.kind === 'audio') return 'mdi-volume-high'
  if (attachment.kind === 'image') return 'mdi-image-outline'
  return 'mdi-file-outline'
}

function formatAttachmentSize(size?: number) {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function getFileKind(file: File): AgentAttachmentKind {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'file'
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  const nextAttachments = files.map(file => {
    const kind = getFileKind(file)

    return {
      id: createId('attachment'),
      file,
      kind,
      name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size: file.size,
      preview_url: kind === 'image' ? URL.createObjectURL(file) : undefined,
    }
  })

  pendingAttachments.value.push(...nextAttachments)
  input.value = ''
}

function removePendingAttachment(id: string) {
  const attachment = pendingAttachments.value.find(item => item.id === id)
  if (attachment?.preview_url) URL.revokeObjectURL(attachment.preview_url)
  pendingAttachments.value = pendingAttachments.value.filter(item => item.id !== id)
}

function clearPendingAttachments() {
  pendingAttachments.value.forEach(item => {
    if (item.preview_url) URL.revokeObjectURL(item.preview_url)
  })
  pendingAttachments.value = []
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error(t('agentAssistant.uploadFailed')))
    reader.readAsDataURL(file)
  })
}

async function uploadAgentAttachment(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('session_id', sessionId.value)

  const response = await fetch(resolveApiUrl('message/agent/upload'), {
    method: 'POST',
    headers: {
      ...(authStore.token ? { Authorization: `Bearer ${authStore.token}` } : {}),
    },
    body: formData,
    credentials: 'include',
  })

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())

  const result = await response.json()
  if (!result?.success) throw new Error(result?.message || t('agentAssistant.uploadFailed'))

  return result.data as AgentMessageAttachment & AgentOutgoingFile
}

async function prepareAgentAttachments(items: AgentPendingAttachment[]): Promise<PreparedAgentAttachments> {
  const images: string[] = []
  const files: AgentOutgoingFile[] = []
  const audioRefs: string[] = []
  const userAttachments: AgentMessageAttachment[] = []

  for (const item of items) {
    const imageDataUrl = item.kind === 'image' ? await readFileAsDataUrl(item.file) : ''
    const uploaded = await uploadAgentAttachment(item.file)
    const displayAttachment: AgentMessageAttachment = {
      kind: item.kind,
      url: item.kind === 'image' ? imageDataUrl : uploaded.url,
      download_url: uploaded.download_url || uploaded.url,
      name: item.name,
      mime_type: item.mime_type,
      size: item.size,
    }

    if (imageDataUrl) images.push(imageDataUrl)
    const outgoingFile = {
      ref: uploaded.ref || uploaded.url,
      name: uploaded.name || item.name,
      mime_type: uploaded.mime_type || item.mime_type,
      size: uploaded.size || item.size,
      local_path: uploaded.local_path,
      status: uploaded.status || 'ready',
    }

    if (item.kind === 'audio') {
      audioRefs.push(outgoingFile.ref)
    } else {
      files.push(outgoingFile)
    }
    userAttachments.push(displayAttachment)
  }

  return { images, files, audioRefs, userAttachments }
}

async function streamAgentMessage(
  text: string,
  images: string[] = [],
  files: AgentOutgoingFile[] = [],
  audioRefs: string[] = [],
  userAttachments: AgentMessageAttachment[] = [],
  echoUser = true,
) {
  const content = text.trim()
  if (!content && !images.length && !files.length && !audioRefs.length) return

  if (echoUser) addMessage('user', content, 'done', userAttachments)
  const assistantMessage = addMessage('assistant', '', 'streaming')

  abortController = new AbortController()

  try {
    const response = await fetch(resolveApiUrl('message/agent/stream'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authStore.token ? { Authorization: `Bearer ${authStore.token}` } : {}),
      },
      body: JSON.stringify({
        text: content,
        session_id: sessionId.value,
        images,
        files,
        audio_refs: audioRefs,
        echo_user: echoUser,
      }),
      credentials: 'include',
      signal: abortController.signal,
    })

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`.trim())
    }

    await readAgentStream(response, assistantMessage)
    if (assistantMessage.status === 'streaming') {
      assistantMessage.status = 'done'
      markToolsDone(assistantMessage)
      refreshMessageList()
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      assistantMessage.status = 'done'
      markToolsDone(assistantMessage)
      refreshMessageList()
      return
    }

    assistantMessage.status = 'error'
    assistantMessage.content = error?.message || t('agentAssistant.error')
    markToolsDone(assistantMessage)
    refreshMessageList()
  } finally {
    abortController = null
    persistState()
    try {
      await saveCurrentSessionToServer()
      await loadServerHistorySessions()
    } catch (error) {
      // 服务端历史保存失败时保留本地兜底历史，不影响当前会话继续交互。
    }
    scrollToBottom()
  }
}

async function sendMessage() {
  const text = inputText.value.trim()
  const attachments = [...pendingAttachments.value]
  if ((!text && !attachments.length) || sending.value) return

  streamError.value = ''
  inputText.value = ''
  clearPendingAttachments()
  syncInputHeight()
  sending.value = true

  try {
    const prepared = await prepareAgentAttachments(attachments)
    await streamAgentMessage(text, prepared.images, prepared.files, prepared.audioRefs, prepared.userAttachments)
  } catch (error: any) {
    // 附件准备失败同样落到对话消息里，底部提示条只保留给没有消息承载的本地错误。
    addMessage('assistant', error?.message || t('agentAssistant.uploadFailed'), 'error')
  } finally {
    sending.value = false
  }
}

function getRecorderMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || ''
}

function getRecordingFileExtension(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

function stopRecordingStream() {
  mediaRecorderStream?.getTracks().forEach(track => track.stop())
  mediaRecorderStream = null
}

function clearRecordingTimer() {
  if (recordingTimer === null) return

  window.clearInterval(recordingTimer)
  recordingTimer = null
}

function finishRecordingState() {
  recording.value = false
  recordingStartedAt.value = 0
  recordingDuration.value = 0
  mediaRecorder = null
  clearRecordingTimer()
  stopRecordingStream()
}

async function startVoiceRecording() {
  if (!canRecord.value) return
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    streamError.value = t('agentAssistant.recordUnsupported')
    return
  }

  try {
    streamError.value = ''
    recordingChunks = []
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = getRecorderMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)

    mediaRecorderStream = stream
    mediaRecorder = recorder
    recording.value = true
    recordingStartedAt.value = Date.now()
    recordingDuration.value = 0
    recordingTimer = window.setInterval(() => {
      recordingDuration.value = Math.floor((Date.now() - recordingStartedAt.value) / 1000)
    }, 500)

    recorder.ondataavailable = event => {
      if (event.data.size > 0) recordingChunks.push(event.data)
    }
    recorder.onstop = () => {
      const recordedMimeType = recorder.mimeType || mimeType || 'audio/webm'
      const audioBlob = new Blob(recordingChunks, { type: recordedMimeType })
      const extension = getRecordingFileExtension(recordedMimeType)
      const file = new File([audioBlob], `voice-${Date.now()}.${extension}`, { type: recordedMimeType })

      finishRecordingState()
      recordingChunks = []

      if (audioBlob.size <= 0) {
        streamError.value = t('agentAssistant.recordFailed')
        return
      }

      pendingAttachments.value.push({
        id: createId('recording'),
        file,
        kind: 'audio',
        name: file.name,
        mime_type: recordedMimeType,
        size: file.size,
      })
      sendMessage()
    }
    recorder.onerror = () => {
      finishRecordingState()
      recordingChunks = []
      streamError.value = t('agentAssistant.recordFailed')
    }
    recorder.start()
  } catch (error: any) {
    finishRecordingState()
    recordingChunks = []
    streamError.value = error?.message || t('agentAssistant.recordPermissionDenied')
  }
}

function stopVoiceRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    finishRecordingState()
    return
  }

  mediaRecorder.stop()
}

function cancelVoiceRecording() {
  if (mediaRecorder) {
    mediaRecorder.ondataavailable = null
    mediaRecorder.onstop = null
    mediaRecorder.onerror = null
    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
  }
  mediaRecorder = null
  recordingChunks = []
  finishRecordingState()
}

function toggleVoiceRecording() {
  if (recording.value) {
    stopVoiceRecording()
    return
  }

  startVoiceRecording()
}

async function handleChoiceClick(choice: AgentChoiceCard, button: AgentChoiceButton) {
  if (sending.value || choice.status !== 'pending') return

  sending.value = true
  streamError.value = ''

  try {
    const response = await fetch(resolveApiUrl('message/agent/callback'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authStore.token ? { Authorization: `Bearer ${authStore.token}` } : {}),
      },
      body: JSON.stringify({
        session_id: sessionId.value,
        callback_data: button.callback_data,
      }),
      credentials: 'include',
    })

    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())

    const result = await response.json()
    if (!result?.success) throw new Error(result?.message || t('agentAssistant.choiceExpired'))

    choice.status = 'selected'
    choice.selected_label = result.data?.feedback?.selected_label || button.label
    choice.selected_value = result.data?.feedback?.selected_value || result.data?.message
    refreshMessageList()
    persistState()

    await streamAgentMessage(String(result.data?.message || ''), [], [], [], [], false)
  } catch (error: any) {
    choice.status = 'expired'
    streamError.value = error?.message || t('agentAssistant.choiceExpired')
    refreshMessageList()
    persistState()
  } finally {
    sending.value = false
  }
}

function stopGeneration() {
  abortController?.abort()
}

function startNewSession() {
  stopGeneration()
  sessionId.value = createSessionId()
  messages.value = []
  streamError.value = ''
  historyMenuOpen.value = false
  clearPendingAttachments()
  persistState()
  scrollToTop()
}

// 从历史列表恢复指定会话，同时把它设为当前本地会话。
async function loadHistorySession(targetSessionId: string) {
  if (sending.value) return

  let historySession = historySessions.value.find(item => item.sessionId === targetSessionId)
  if (!historySession) return

  try {
    stopGeneration()
    if (!historySession.messages.length) {
      historySession = await loadServerHistorySession(targetSessionId)
    }
    sessionId.value = historySession.sessionId
    messages.value = normalizeStoredMessages(historySession.messages)
    streamError.value = ''
    historyMenuOpen.value = false
    clearPendingAttachments()
    persistState({ syncHistory: false })
    scrollToBottom()
  } catch (error: any) {
    streamError.value = error?.message || t('agentAssistant.historyLoadFailed')
  }
}

// 删除指定历史会话；若删除的是当前会话，则切换到新的空会话。
async function deleteHistorySession(targetSessionId: string) {
  if (sending.value && targetSessionId === sessionId.value) return

  try {
    await fetchAgentApi(`message/agent/sessions/${encodeURIComponent(targetSessionId)}`, {
      method: 'DELETE',
    })
  } catch (error) {
    // 删除接口失败时仍允许清理本地兜底历史，避免坏记录一直挡在列表里。
  } finally {
    historySessions.value = historySessions.value.filter(item => item.sessionId !== targetSessionId)
    persistHistorySessions()
  }

  if (targetSessionId === sessionId.value) startNewSession()
}

// 判断历史项是否为当前打开的会话，用于高亮列表状态。
function isCurrentHistorySession(targetSessionId: string) {
  return targetSessionId === sessionId.value
}

// 格式化历史会话时间，显示为本地日期和时间。
function formatHistoryTime(timestamp: number) {
  if (!timestamp) return ''

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function openDrawer() {
  drawer.value = true
  scrollToBottom()
}

function closeDrawer() {
  drawer.value = false
}

function syncAgentAssistantOpenState(isOpen: boolean) {
  if (typeof document === 'undefined') return

  const roots = [document.documentElement, document.body]
  roots.forEach(root => {
    if (isOpen) {
      root.setAttribute('data-agent-assistant-open', 'true')
      return
    }

    root.removeAttribute('data-agent-assistant-open')
  })

  if (isOpen) {
    document.documentElement.style.setProperty('--agent-assistant-fab-offset', drawerWidth.value)
  } else {
    document.documentElement.style.removeProperty('--agent-assistant-fab-offset')
  }
}

function clearAgentAssistantOpenState() {
  syncAgentAssistantOpenState(false)
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && drawer.value) closeDrawer()
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  sendMessage()
}

watch(drawer, syncAgentAssistantOpenState, { immediate: true })
watch(drawerWidth, () => {
  if (drawer.value) syncAgentAssistantOpenState(true)
})

onMounted(() => {
  restoreHistorySessions()
  restoreState()
  loadServerHistorySessions()
  syncInputHeight()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onScopeDispose(clearAgentAssistantOpenState)
onScopeDispose(clearPendingAttachments)
onScopeDispose(cancelVoiceRecording)
onScopeDispose(() => {
  if (typeof window === 'undefined') return

  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <button
    v-if="!drawer"
    class="agent-assistant-fab"
    type="button"
    :aria-label="t('agentAssistant.title')"
    :title="t('agentAssistant.title')"
    @click="openDrawer"
  >
    <VIcon class="agent-assistant-fab__icon" icon="lucide:bot" size="21" />
  </button>

  <aside
    v-show="drawer"
    class="agent-assistant-panel"
    :style="drawerStyle"
    role="dialog"
    :aria-label="t('agentAssistant.title')"
  >
    <div class="agent-assistant-shell">
      <header class="agent-assistant-header">
        <div class="agent-assistant-title">
          <div class="agent-assistant-title__mark">
            <VIcon icon="lucide:bot" size="22" />
          </div>
          <div>
            <div class="text-subtitle-1 font-weight-semibold">{{ t('agentAssistant.title') }}</div>
            <div class="agent-assistant-status">
              {{ sending ? t('agentAssistant.thinking') : t('agentAssistant.ready') }}
            </div>
          </div>
        </div>
        <div class="d-flex align-center gap-1">
          <VMenu
            v-model="historyMenuOpen"
            :close-on-content-click="false"
            content-class="agent-assistant-history-overlay"
            location="bottom end"
            offset="8"
            max-width="360"
            :z-index="2103"
          >
            <template #activator="{ props }">
              <IconBtn v-bind="props" :title="t('agentAssistant.history')" :aria-label="t('agentAssistant.history')">
                <VIcon icon="mdi-history" />
              </IconBtn>
            </template>
            <VCard class="agent-assistant-history-menu" elevation="10">
              <div class="agent-assistant-history-menu__header">
                <span>{{ t('agentAssistant.history') }}</span>
              </div>
              <VDivider />
              <div
                class="agent-assistant-history-list"
                :class="{ 'agent-assistant-history-list--empty': historyLoading || !hasHistorySessions }"
              >
                <div v-if="historyLoading" class="agent-assistant-history-empty">
                  {{ t('agentAssistant.historyLoading') }}
                </div>
                <div v-else-if="!hasHistorySessions" class="agent-assistant-history-empty">
                  {{ t('agentAssistant.noHistory') }}
                </div>
                <VInfiniteScroll
                  v-else
                  mode="intersect"
                  side="end"
                  :items="historySessions"
                  class="agent-assistant-history-infinite"
                  @load="handleHistoryInfiniteLoad"
                >
                  <VVirtualScroll renderless :items="historySessions" :item-height="HISTORY_ITEM_HEIGHT">
                    <template #default="{ item: historySession, itemRef }">
                      <button
                        :ref="itemRef"
                        :key="historySession.sessionId"
                        class="agent-assistant-history-item"
                        :class="{ 'is-active': isCurrentHistorySession(historySession.sessionId) }"
                        type="button"
                        :disabled="sending"
                        @click="loadHistorySession(historySession.sessionId)"
                      >
                        <span class="agent-assistant-history-item__content">
                          <span class="agent-assistant-history-item__title">{{ historySession.title }}</span>
                          <span class="agent-assistant-history-item__channel">
                            {{ getSessionChannelLabel(historySession) }}
                          </span>
                          <span class="agent-assistant-history-item__time">
                            {{ formatHistoryTime(historySession.updatedAt) }}
                          </span>
                        </span>
                        <IconBtn
                          size="x-small"
                          :disabled="sending"
                          :title="t('agentAssistant.deleteHistory')"
                          :aria-label="t('agentAssistant.deleteHistory')"
                          @click.stop="deleteHistorySession(historySession.sessionId)"
                        >
                          <VIcon icon="mdi-delete-outline" size="16" />
                        </IconBtn>
                      </button>
                    </template>
                  </VVirtualScroll>
                  <template #empty />
                  <template #loading>
                    <div class="agent-assistant-history-loading">
                      {{ t('agentAssistant.historyLoading') }}
                    </div>
                  </template>
                </VInfiniteScroll>
              </div>
            </VCard>
          </VMenu>
          <IconBtn
            :disabled="sending"
            :title="t('agentAssistant.newChat')"
            :aria-label="t('agentAssistant.newChat')"
            @click="startNewSession"
          >
            <VIcon icon="mdi-message-plus-outline" />
          </IconBtn>
          <IconBtn :title="t('common.close')" :aria-label="t('common.close')" @click="closeDrawer">
            <VIcon icon="mdi-close" />
          </IconBtn>
        </div>
      </header>

      <PerfectScrollbar
        ref="messageListRef"
        tag="main"
        class="agent-assistant-messages"
        :class="{ 'agent-assistant-messages--has-content': hasMessages }"
        :options="{ wheelPropagation: false }"
      >
        <div v-if="!hasMessages" class="agent-assistant-empty">
          <div class="agent-assistant-empty__mark">
            <VIcon icon="lucide:sparkles" size="28" />
          </div>
          <div class="agent-assistant-empty__title">{{ t('agentAssistant.emptyTitle') }}</div>
          <div class="agent-assistant-empty__subtitle">{{ t('agentAssistant.emptySubtitle') }}</div>
        </div>

        <div
          v-for="message in messages"
          :key="message.id"
          class="agent-assistant-message"
          :class="`agent-assistant-message--${message.role}`"
        >
          <div class="agent-assistant-message__meta">
            <VIcon :icon="message.role === 'user' ? 'mdi-account-circle-outline' : 'lucide:bot'" size="16" />
            <span>{{ message.role === 'user' ? currentUserName : t('agentAssistant.assistant') }}</span>
          </div>

          <div v-if="message.tools.length" class="agent-assistant-tools">
            <div v-for="tool in message.tools" :key="tool.id" class="agent-assistant-tool">
              <VIcon
                :icon="
                  tool.status === 'running' && message.status === 'streaming'
                    ? 'line-md:loading-twotone-loop'
                    : 'mdi-check-circle-outline'
                "
                size="16"
              />
              <span>{{ tool.message }}</span>
            </div>
          </div>

          <div
            v-if="message.content"
            class="agent-assistant-message__bubble markdown-body"
            v-html="renderMarkdown(message.content)"
          />

          <div v-if="message.choices.length" class="agent-assistant-choices">
            <div v-for="choice in message.choices" :key="choice.id" class="agent-assistant-choice">
              <div v-if="choice.title" class="agent-assistant-choice__title">{{ choice.title }}</div>
              <div class="agent-assistant-choice__prompt">{{ choice.prompt }}</div>
              <div v-if="choice.status === 'selected'" class="agent-assistant-choice__selected">
                <VIcon icon="mdi-check-circle-outline" size="16" />
                <span>{{ t('agentAssistant.choiceSelected', { option: choice.selected_label }) }}</span>
              </div>
              <div v-else-if="choice.status === 'expired'" class="agent-assistant-choice__selected is-expired">
                <VIcon icon="mdi-alert-circle-outline" size="16" />
                <span>{{ t('agentAssistant.choiceExpired') }}</span>
              </div>
              <div class="agent-assistant-choice__buttons">
                <VBtn
                  v-for="button in choice.buttons"
                  :key="button.callback_data"
                  size="small"
                  rounded="lg"
                  variant="tonal"
                  color="primary"
                  :disabled="sending || choice.status !== 'pending'"
                  @click="handleChoiceClick(choice, button)"
                >
                  {{ button.label }}
                </VBtn>
              </div>
            </div>
          </div>

          <div v-if="message.attachments.length" class="agent-assistant-attachments">
            <div
              v-for="attachment in message.attachments"
              :key="`${message.id}-${attachment.url}`"
              class="agent-assistant-attachment"
              :class="`agent-assistant-attachment--${attachment.kind}`"
            >
              <img
                v-if="attachment.kind === 'image'"
                class="agent-assistant-attachment__image"
                :src="resolveAttachmentUrl(attachment.url)"
                :alt="getAttachmentName(attachment)"
                loading="lazy"
              />

              <template v-else-if="attachment.kind === 'audio'">
                <div class="agent-assistant-attachment__meta">
                  <VIcon :icon="getAttachmentIcon(attachment)" size="18" />
                  <span>{{ getAttachmentName(attachment) }}</span>
                </div>
                <audio class="agent-assistant-attachment__audio" controls :src="resolveAttachmentUrl(attachment.url)" />
                <VBtn
                  class="agent-assistant-surface-btn"
                  :href="getAttachmentDownloadUrl(attachment)"
                  :download="getAttachmentName(attachment)"
                  size="small"
                  variant="tonal"
                  color="primary"
                  prepend-icon="mdi-download"
                >
                  {{ t('agentAssistant.download') }}
                </VBtn>
              </template>

              <template v-else>
                <div class="agent-assistant-attachment__file">
                  <VIcon :icon="getAttachmentIcon(attachment)" size="22" />
                  <div class="agent-assistant-attachment__file-text">
                    <span>{{ getAttachmentName(attachment) }}</span>
                    <small>{{ attachment.mime_type || formatAttachmentSize(attachment.size) }}</small>
                  </div>
                  <VBtn
                    class="agent-assistant-surface-btn"
                    :href="getAttachmentDownloadUrl(attachment)"
                    :download="getAttachmentName(attachment)"
                    icon
                    variant="text"
                    color="primary"
                    :aria-label="t('agentAssistant.download')"
                  >
                    <VIcon icon="mdi-download" />
                  </VBtn>
                </div>
              </template>
            </div>
          </div>

          <div
            v-if="
              !message.content &&
              !message.attachments.length &&
              !message.choices.length &&
              message.status === 'streaming'
            "
            class="agent-assistant-typing"
          >
            <span />
            <span />
            <span />
          </div>
        </div>
      </PerfectScrollbar>

      <footer class="agent-assistant-composer">
        <VAlert v-if="streamError" type="error" variant="tonal" density="compact" class="mb-3">
          {{ streamError }}
        </VAlert>
        <PerfectScrollbar
          v-if="pendingAttachments.length"
          class="agent-assistant-pending-files"
          :options="{ wheelPropagation: false }"
        >
          <div v-for="attachment in pendingAttachments" :key="attachment.id" class="agent-assistant-pending-file">
            <img
              v-if="attachment.kind === 'image' && attachment.preview_url"
              class="agent-assistant-pending-file__preview"
              :src="attachment.preview_url"
              :alt="attachment.name"
            />
            <VIcon v-else :icon="getAttachmentIcon(attachment)" size="18" />
            <div class="agent-assistant-pending-file__text">
              <span>{{ attachment.name }}</span>
              <small>{{ formatAttachmentSize(attachment.size) || attachment.mime_type }}</small>
            </div>
            <IconBtn
              class="agent-assistant-surface-btn"
              size="x-small"
              :disabled="sending"
              :title="t('agentAssistant.removeAttachment')"
              :aria-label="t('agentAssistant.removeAttachment')"
              @click="removePendingAttachment(attachment.id)"
            >
              <VIcon icon="mdi-close" size="16" />
            </IconBtn>
          </div>
        </PerfectScrollbar>
        <div class="agent-assistant-input">
          <input
            ref="fileInputRef"
            class="agent-assistant-file-input"
            type="file"
            multiple
            :disabled="sending"
            @change="handleFileSelection"
          />
          <IconBtn
            class="agent-assistant-attach agent-assistant-surface-btn"
            :disabled="sending || recording"
            :title="t('agentAssistant.attachFile')"
            :aria-label="t('agentAssistant.attachFile')"
            @click="openFilePicker"
          >
            <VIcon icon="mdi-plus" />
          </IconBtn>
          <textarea
            ref="inputRef"
            v-model="inputText"
            class="agent-assistant-textarea"
            rows="1"
            :disabled="sending || recording"
            :placeholder="t('agentAssistant.placeholder')"
            @input="syncInputHeight"
            @keydown="handleInputKeydown"
          />
          <IconBtn
            class="agent-assistant-record agent-assistant-surface-btn"
            :class="{ 'is-recording': recording }"
            :disabled="!recording && !canRecord"
            :title="
              recording
                ? t('agentAssistant.stopRecording', { time: recordingTimeText })
                : t('agentAssistant.recordVoice')
            "
            :aria-label="
              recording
                ? t('agentAssistant.stopRecording', { time: recordingTimeText })
                : t('agentAssistant.recordVoice')
            "
            @click="toggleVoiceRecording"
          >
            <VIcon :icon="recording ? 'mdi-stop-circle-outline' : 'mdi-microphone-outline'" />
          </IconBtn>
          <IconBtn
            class="agent-assistant-send agent-assistant-surface-btn"
            :disabled="!sending && !canSend"
            :title="sending ? t('agentAssistant.stop') : t('common.send')"
            :aria-label="sending ? t('agentAssistant.stop') : t('common.send')"
            @click="sending ? stopGeneration() : sendMessage()"
          >
            <VIcon :icon="sending ? 'mdi-stop' : 'mdi-send'" />
          </IconBtn>
        </div>
      </footer>
    </div>
  </aside>
</template>

<style lang="scss">
.agent-assistant-history-overlay {
  z-index: 2103 !important;
}
</style>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */
/* stylelint-disable no-descending-specificity */

.agent-assistant-fab {
  position: fixed;
  z-index: 1000;
  display: grid;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 999px 0 0 999px;
  backdrop-filter: blur(10px);
  background: rgba(var(--v-theme-surface), 0.86);
  block-size: 2.5rem;
  border-inline-end: 0;
  box-shadow: var(--app-surface-shadow);
  color: rgb(var(--v-theme-primary));
  inline-size: 2.8rem;

  /* 入口避开屏幕正中，放到视觉上更轻的下三分之一位置。 */
  inset-block-start: clamp(8rem, 66.666vh, calc(100vh - 8rem));
  inset-inline-end: 0;
  place-items: center;
  transform: translate(1rem, -50%);
  transition:
    inset-inline-end 0.2s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.agent-assistant-fab:hover {
  box-shadow: var(--app-surface-hover-shadow);
  transform: translate(0, -50%);
}

.agent-assistant-fab__icon {
  transform: rotate(-90deg);
  transition: transform 0.18s ease;
}

.agent-assistant-fab:hover .agent-assistant-fab__icon {
  transform: rotate(0);
}

.agent-assistant-panel {
  position: fixed;
  z-index: 2101;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));

  /* 背景层必须覆盖完整视口，不能跟随 iOS 键盘后的 visual viewport 缩短。 */
  block-size: 100vh !important;
  border-inline-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  box-shadow: var(--app-surface-shadow);
  inline-size: var(--agent-assistant-panel-width, 30rem);
  inset-block-start: 0;
  inset-inline-end: 0;
  max-block-size: none !important;
  min-block-size: 100vh !important;
  overscroll-behavior: contain;
}

@supports (block-size: 100lvh) {
  .agent-assistant-panel {
    block-size: 100lvh !important;
    min-block-size: 100lvh !important;
  }
}

.agent-assistant-shell {
  position: relative;
  display: grid;
  block-size: 100%;
  grid-template-rows: auto 1fr;
  min-block-size: 0;

  --agent-assistant-assistant-bg: rgba(var(--v-theme-surface), 0.92);
  --agent-assistant-assistant-border: rgba(var(--v-theme-on-surface), 0.08);
  --agent-assistant-panel-bg: rgba(var(--v-theme-surface), 0.94);
  --agent-assistant-panel-blur: 10px;
}

.agent-assistant-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-block: calc(env(safe-area-inset-top, 0px) + 0.8rem) 0.8rem;
  padding-inline: 1rem;
}

.agent-assistant-title {
  display: flex;
  align-items: center;
  column-gap: 0.75rem;
  min-inline-size: 0;
}

.agent-assistant-title__mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.12);
  block-size: 2.5rem;
  color: rgb(var(--v-theme-primary));
  inline-size: 2.5rem;
}

.agent-assistant-status {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.78rem;
}

.agent-assistant-history-menu {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  inline-size: min(22rem, calc(100vw - 2rem));
}

.agent-assistant-history-menu__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.9rem;
  font-weight: 700;
  min-block-size: 3rem;
  padding-block: 0.45rem;
  padding-inline: 0.9rem 0.55rem;
}

.agent-assistant-history-list {
  block-size: min(26rem, calc(100vh - 7rem));
  max-block-size: min(26rem, calc(100vh - 7rem));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-block: 0.35rem;
}

.agent-assistant-history-list--empty {
  block-size: auto;
  max-block-size: none;
}

@supports (block-size: 100lvh) {
  .agent-assistant-history-list {
    block-size: min(26rem, calc(100lvh - 7rem));
    max-block-size: min(26rem, calc(100lvh - 7rem));
  }

  .agent-assistant-history-list--empty {
    block-size: auto;
    max-block-size: none;
  }
}

.agent-assistant-history-infinite {
  gap: 0.25rem;
  min-block-size: 100%;
}

.agent-assistant-history-empty {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.85rem;
  padding-block: 1.5rem;
  padding-inline: 1rem;
  text-align: center;
}

.agent-assistant-history-loading {
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 0.75rem;
  padding-block: 0.75rem;
  text-align: center;
}

.agent-assistant-history-item {
  display: grid;
  align-items: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  column-gap: 0.4rem;
  cursor: pointer;
  grid-template-columns: minmax(0, 1fr) auto;
  inline-size: calc(100% - 0.7rem);
  margin-inline: 0.35rem;
  min-block-size: 4.75rem;
  padding-block: 0.55rem;
  padding-inline: 0.65rem 0.25rem;
  text-align: start;
}

.agent-assistant-history-item:hover,
.agent-assistant-history-item.is-active {
  background: rgba(var(--v-theme-primary), 0.1);
}

.agent-assistant-history-item:disabled {
  cursor: default;
  opacity: 0.62;
}

.agent-assistant-history-item__content {
  display: grid;
  min-inline-size: 0;
  row-gap: 0.15rem;
}

.agent-assistant-history-item__title,
.agent-assistant-history-item__channel,
.agent-assistant-history-item__time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-assistant-history-item__title {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.86rem;
  font-weight: 700;
}

.agent-assistant-history-item__channel {
  display: inline-flex;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgba(var(--v-theme-primary), 0.9);
  font-size: 0.68rem;
  font-weight: 700;
  inline-size: fit-content;
  max-inline-size: 100%;
  padding-block: 0.1rem;
  padding-inline: 0.4rem;
}

.agent-assistant-history-item__time {
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 0.7rem;
}

.agent-assistant-messages {
  display: flex;
  box-sizing: border-box;
  flex-direction: column;
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-block: 1rem;
  padding-inline: 1rem;
  scrollbar-width: thin;

  :deep(.ps__rail-x),
  :deep(.ps__rail-y) {
    display: none !important;
  }
}

/* 只有消息态预留输入框空间，避免 iOS 空态被 padding 撑出不可滚动的滚动条。 */
.agent-assistant-messages--has-content {
  padding-block-end: calc(env(safe-area-inset-bottom, 0px) + 6rem);
}

.agent-assistant-empty {
  display: flex;
  box-sizing: border-box;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.7);
  min-block-size: 0;
  padding-block: 2rem 1.25rem;
  padding-inline: 0.25rem;
  text-align: center;
}

.agent-assistant-empty__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-primary));
  margin-block-end: 1rem;
}

.agent-assistant-empty__title {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.35;
}

.agent-assistant-empty__subtitle {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.86rem;
  line-height: 1.55;
  margin-block-start: 0.4rem;
  max-inline-size: 21rem;
}

.agent-assistant-message {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  margin-block-end: 1rem;
}

.agent-assistant-message--user {
  align-items: flex-end;
}

.agent-assistant-message--assistant {
  align-items: flex-start;
}

.agent-assistant-message__meta {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.56);
  column-gap: 0.3rem;
  font-size: 0.75rem;
  margin-block-end: 0.35rem;
}

.agent-assistant-message__bubble {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 16px;
  font-size: 0.92rem;
  line-height: 1.55;
  max-inline-size: min(100%, 34rem);
  min-inline-size: 0;
  padding-block: 0.75rem;
  padding-inline: 0.85rem;
}

.agent-assistant-message--user .agent-assistant-message__bubble {
  border-color: rgba(var(--v-theme-primary), 0.18);
  background: rgba(var(--v-theme-primary), 0.12);
}

.agent-assistant-message--assistant .agent-assistant-message__bubble {
  border-color: var(--agent-assistant-assistant-border);
  backdrop-filter: blur(var(--agent-assistant-panel-blur));
  background: var(--agent-assistant-assistant-bg);
}

.agent-assistant-tools {
  display: grid;
  gap: 0.4rem;
  inline-size: min(100%, 34rem);
  margin-block-end: 0.5rem;
}

.agent-assistant-tool {
  display: flex;
  align-items: center;
  border: 1px solid rgba(25, 178, 160, 28%);
  border-radius: 10px;
  background: rgba(25, 178, 160, 8%);
  color: rgba(var(--v-theme-on-surface), 0.78);
  column-gap: 0.45rem;
  font-size: 0.8rem;
  line-height: 1.35;
  padding-block: 0.45rem;
  padding-inline: 0.6rem;
}

.agent-assistant-choices {
  display: grid;
  gap: 0.55rem;
  inline-size: min(100%, 34rem);
  margin-block-start: 0.5rem;
}

.agent-assistant-choice {
  display: grid;
  border: 1px solid rgba(25, 178, 160, 28%);
  border-radius: 14px;
  backdrop-filter: blur(var(--agent-assistant-panel-blur));
  background: rgba(25, 178, 160, 8%);
  gap: 0.65rem;
  padding-block: 0.75rem;
  padding-inline: 0.8rem;
}

.agent-assistant-choice__title {
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.3;
}

.agent-assistant-choice__prompt {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.92rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.agent-assistant-choice__selected {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(25, 178, 160, 28%);
  border-radius: 10px;
  background: rgba(25, 178, 160, 10%);
  color: rgba(var(--v-theme-on-surface), 0.78);
  column-gap: 0.4rem;
  font-size: 0.8rem;
  inline-size: fit-content;
  max-inline-size: 100%;
  padding-block: 0.35rem;
  padding-inline: 0.5rem;
}

.agent-assistant-choice__selected span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-assistant-choice__selected.is-expired {
  border-color: rgba(var(--v-theme-warning), 0.28);
  background: rgba(var(--v-theme-warning), 0.1);
}

.agent-assistant-choice__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;

  :deep(.v-btn) {
    max-inline-size: 100%;
  }

  :deep(.v-btn__content) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.agent-assistant-typing {
  display: inline-flex;
  border: 1px solid var(--agent-assistant-assistant-border);
  border-radius: 999px;
  backdrop-filter: blur(var(--agent-assistant-panel-blur));
  background: var(--agent-assistant-assistant-bg);
  gap: 0.28rem;
  padding-block: 0.7rem;
  padding-inline: 0.8rem;
}

.agent-assistant-typing span {
  border-radius: 999px;
  animation: agent-typing 1s infinite ease-in-out;
  background: rgba(var(--v-theme-on-surface), 0.54);
  block-size: 0.35rem;
  inline-size: 0.35rem;
}

.agent-assistant-typing span:nth-child(2) {
  animation-delay: 0.15s;
}

.agent-assistant-typing span:nth-child(3) {
  animation-delay: 0.3s;
}

.agent-assistant-composer {
  position: absolute;
  z-index: 2;
  inset-block-end: calc(env(safe-area-inset-bottom, 0px) + 0.85rem);
  inset-inline: 1rem;
  pointer-events: none;
}

.agent-assistant-composer > * {
  pointer-events: auto;
}

.agent-assistant-pending-files {
  display: grid;
  padding: 0.55rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 14px;
  backdrop-filter: blur(var(--agent-assistant-panel-blur));
  background: var(--agent-assistant-panel-bg);
  box-shadow: var(--app-surface-shadow);
  gap: 0.45rem;
  margin-block-end: 0.55rem;
  max-block-size: 8rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.agent-assistant-pending-file {
  display: grid;
  align-items: center;
  border-radius: 10px;
  column-gap: 0.55rem;
  grid-template-columns: auto 1fr auto;
  min-inline-size: 0;
  padding-block: 0.25rem;
  padding-inline: 0.35rem 0.15rem;
}

.agent-assistant-pending-file__preview {
  border-radius: 8px;
  block-size: 2.1rem;
  inline-size: 2.1rem;
  object-fit: cover;
}

.agent-assistant-pending-file__text {
  display: grid;
  min-inline-size: 0;
}

.agent-assistant-pending-file__text span,
.agent-assistant-pending-file__text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-assistant-pending-file__text small {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.72rem;
}

.agent-assistant-input {
  display: grid;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 16px;
  backdrop-filter: blur(var(--agent-assistant-panel-blur));
  background: var(--agent-assistant-panel-bg);
  box-shadow: var(--app-surface-shadow);
  column-gap: 0.25rem;
  grid-template-columns: auto 1fr auto auto;
  min-block-size: 3.25rem;
  padding-inline: 0.35rem;
  pointer-events: auto;
}

.agent-assistant-file-input {
  display: none;
}

// 面板内文件下载、附件和发送按钮使用全局阴影 token，跟随主题阴影设置即时变化。
.agent-assistant-surface-btn {
  box-shadow: var(--app-surface-shadow) !important;
  transition: box-shadow 0.2s ease;
}

@media (hover: hover) {
  .agent-assistant-surface-btn:hover {
    box-shadow: var(--app-surface-hover-shadow) !important;
  }
}

.agent-assistant-attach {
  align-self: center;
}

.agent-assistant-record {
  align-self: center;
}

.agent-assistant-record.is-recording {
  color: rgb(var(--v-theme-error));
}

.agent-assistant-textarea {
  box-sizing: border-box;
  align-self: center;
  padding: 0;
  border: 0;
  background: transparent;
  block-size: 1.5rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font: inherit;
  inline-size: 100%;
  line-height: 1.5rem;
  max-block-size: 7.5rem;
  min-block-size: 1.5rem;
  outline: none;
  overflow-y: auto;
  resize: none;
}

.agent-assistant-textarea::placeholder {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  opacity: 1;
}

.agent-assistant-send {
  align-self: center;
}

.agent-assistant-attachments {
  display: grid;
  gap: 0.55rem;
  inline-size: min(100%, 34rem);
  margin-block-start: 0.5rem;
}

.agent-assistant-attachment {
  overflow: hidden;
  border: 1px solid var(--agent-assistant-assistant-border);
  border-radius: 14px;
  backdrop-filter: blur(var(--agent-assistant-panel-blur));
  background: var(--agent-assistant-assistant-bg);
}

.agent-assistant-attachment__image {
  display: block;
  block-size: auto;
  inline-size: 100%;
  max-block-size: 18rem;
  object-fit: contain;
}

.agent-assistant-attachment--audio {
  display: grid;
  padding: 0.75rem;
  gap: 0.65rem;
}

.agent-assistant-attachment__meta {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.76);
  column-gap: 0.45rem;
  font-size: 0.82rem;
  min-inline-size: 0;
}

.agent-assistant-attachment__meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-assistant-attachment__audio {
  inline-size: 100%;
}

.agent-assistant-attachment__file {
  display: grid;
  align-items: center;
  column-gap: 0.65rem;
  grid-template-columns: auto 1fr auto;
  min-inline-size: 0;
  padding-block: 0.65rem;
  padding-inline: 0.75rem 0.45rem;
}

.agent-assistant-attachment__file-text {
  display: grid;
  min-inline-size: 0;
}

.agent-assistant-attachment__file-text span,
.agent-assistant-attachment__file-text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-assistant-attachment__file-text small {
  color: rgba(var(--v-theme-on-surface), 0.58);
}

.markdown-body {
  overflow-wrap: anywhere;
  word-break: break-word;

  :deep(h1),
  :deep(h2),
  :deep(h3) {
    font-weight: 600;
    line-height: 1.3;
    margin-block: 0.5rem;
  }

  :deep(h1) {
    font-size: 1.5rem;
  }

  :deep(h2) {
    font-size: 1.25rem;
  }

  :deep(h3) {
    font-size: 1.1rem;
  }

  :deep(p) {
    margin-block-end: 0.5rem;
  }

  :deep(p:last-child) {
    margin-block-end: 0;
  }

  :deep(a) {
    color: rgb(var(--v-theme-primary));
    text-decoration: underline;
  }

  :deep(code) {
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.08);
    font-family: monospace;
    padding-block: 0.1rem;
    padding-inline: 0.3rem;
  }

  :deep(pre) {
    overflow: auto;
    padding: 0.75rem;
    border-radius: 10px;
    background: rgba(var(--v-theme-on-surface), 0.08);
    margin-block: 0.5rem;
    max-inline-size: 100%;
  }

  :deep(pre code) {
    padding: 0;
    background: transparent;
  }

  :deep(ul),
  :deep(ol) {
    margin-block-end: 0.5rem;
    padding-inline-start: 1.5rem;
  }

  :deep(ul) {
    list-style-type: disc;
  }

  :deep(ol) {
    list-style-type: decimal;
  }

  :deep(li) {
    display: list-item;
    margin-block: 0.25rem;
  }

  :deep(blockquote) {
    border-inline-start: 4px solid rgba(var(--v-border-color), 0.2);
    color: rgba(var(--v-theme-on-surface), 0.74);
    font-style: italic;
    margin-block: 0.5rem;
    padding-inline-start: 1rem;
  }

  :deep(table) {
    display: block;
    border-collapse: collapse;
    inline-size: max-content;
    margin-block: 0.5rem;
    max-inline-size: 100%;
    overflow-x: auto;
  }

  :deep(th),
  :deep(td) {
    border: 1px solid rgba(var(--v-border-color), 0.16);
    padding-block: 0.4rem;
    padding-inline: 0.65rem;
    text-align: start;
  }

  :deep(th) {
    background: rgba(var(--v-border-color), 0.08);
    font-weight: 600;
  }

  :deep(hr) {
    border: none;
    border-block-start: 1px solid rgba(var(--v-border-color), 0.24);
    margin-block: 1rem;
  }

  :deep(img) {
    block-size: auto;
    max-inline-size: 100%;
  }
}

@keyframes agent-typing {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  40% {
    opacity: 1;
    transform: translateY(-0.18rem);
  }
}

@media (width <= 960px) {
  .agent-assistant-panel {
    inline-size: 100vw !important;
  }
}

@media (width <= 600px) {
  .agent-assistant-empty {
    justify-content: flex-start;
    padding-block-start: 2.75rem;
  }

  .agent-assistant-messages {
    padding-block: 0.85rem;
    padding-inline: 0.85rem;
  }

  .agent-assistant-messages--has-content {
    padding-block-end: calc(env(safe-area-inset-bottom, 0px) + 11.8rem);
  }

  .agent-assistant-composer {
    inset-block-end: calc(env(safe-area-inset-bottom, 0px) + 0.7rem);
    inset-inline: 0.85rem;
  }
}
</style>
