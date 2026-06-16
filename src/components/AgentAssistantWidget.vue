<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import mdLinkAttributes from 'markdown-it-link-attributes'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useAuthStore, useUserStore } from '@/stores'

type AgentMessageRole = 'user' | 'assistant'
type AgentMessageStatus = 'idle' | 'streaming' | 'done' | 'error'
type AgentAttachmentKind = 'audio' | 'file' | 'image'

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
}

interface AgentChatMessage {
  id: string
  role: AgentMessageRole
  content: string
  createdAt: number
  status: AgentMessageStatus
  tools: AgentToolCall[]
  attachments: AgentMessageAttachment[]
}

interface AgentStreamEvent {
  type: 'start' | 'delta' | 'tool' | 'attachment' | 'done' | 'error'
  attachment?: AgentMessageAttachment
  content?: string
  message?: string
  session_id?: string
}

const { t } = useI18n()
const display = useDisplay()
const authStore = useAuthStore()
const userStore = useUserStore()

const STORAGE_KEY = 'moviepilot-agent-assistant-state'
const MAX_PERSISTED_MESSAGES = 30

const drawer = ref(false)
const drawerViewportHeight = ref('100dvh')
const inputText = ref('')
const messages = ref<AgentChatMessage[]>([])
const sessionId = ref('')
const sending = ref(false)
const streamError = ref('')
const messageListRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
let abortController: AbortController | null = null

const md = new MarkdownIt({
  html: false,
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

const canSend = computed(() => inputText.value.trim().length > 0 && !sending.value)
// 窄屏下直接全屏，避免聊天内容被压成半屏窄栏。
const drawerWidth = computed(() => (display.mdAndDown.value ? '100vw' : '30rem'))
const hasMessages = computed(() => messages.value.length > 0)
const currentUserName = computed(() => userStore.getUserName || t('common.user'))
const drawerStyle = computed(() => ({
  '--agent-assistant-viewport-height': drawerViewportHeight.value,
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
    tools: Array.isArray(message.tools) ? message.tools : [],
  })) as AgentChatMessage[]
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      sessionId.value = createSessionId()
      return
    }

    const state = JSON.parse(raw)
    sessionId.value = state.sessionId || createSessionId()
    messages.value = normalizeStoredMessages(state.messages)
  } catch (error) {
    sessionId.value = createSessionId()
  }
}

function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      sessionId: sessionId.value,
      messages: messages.value.slice(-MAX_PERSISTED_MESSAGES),
    }),
  )
}

function renderMarkdown(value: string) {
  if (!value) return ''
  return md.render(value)
}

function resolveApiUrl(path: string) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/'
  return `${baseUrl.replace(/\/?$/, '/')}${path.replace(/^\//, '')}`
}

function scrollToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      if (!messageListRef.value) return
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
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

function addMessage(role: AgentMessageRole, content: string, status: AgentMessageStatus = 'idle') {
  const message: AgentChatMessage = {
    id: createId(role),
    role,
    content,
    createdAt: Date.now(),
    status,
    attachments: [],
    tools: [],
  }
  messages.value.push(message)
  persistState()
  scrollToBottom()
  return message
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
    case 'done':
      if (assistantMessage.status !== 'error') {
        assistantMessage.status = 'done'
      }
      markToolsDone(assistantMessage)
      break
    case 'error':
      assistantMessage.status = 'error'
      streamError.value = event.message || t('agentAssistant.error')
      if (!assistantMessage.content) assistantMessage.content = streamError.value
      markToolsDone(assistantMessage)
      break
    case 'start':
    default:
      break
  }

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

function getAttachmentIcon(attachment: AgentMessageAttachment) {
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

function getVisibleViewportHeight() {
  if (typeof window === 'undefined') return '100dvh'

  const height = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight

  return height > 0 ? `${Math.round(height)}px` : '100dvh'
}

// iOS 独立模式和地址栏收起时可见高度会变化，抽屉需要跟随真实 viewport。
function syncDrawerViewportHeight() {
  drawerViewportHeight.value = getVisibleViewportHeight()
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || sending.value) return

  streamError.value = ''
  inputText.value = ''
  syncInputHeight()
  addMessage('user', text, 'done')
  const assistantMessage = addMessage('assistant', '', 'streaming')

  abortController = new AbortController()
  sending.value = true

  try {
    const response = await fetch(resolveApiUrl('message/agent/stream'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authStore.token ? { Authorization: `Bearer ${authStore.token}` } : {}),
      },
      body: JSON.stringify({
        text,
        session_id: sessionId.value,
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
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      assistantMessage.status = 'done'
      markToolsDone(assistantMessage)
      return
    }

    assistantMessage.status = 'error'
    assistantMessage.content = error?.message || t('agentAssistant.error')
    streamError.value = assistantMessage.content
    markToolsDone(assistantMessage)
  } finally {
    sending.value = false
    abortController = null
    persistState()
    scrollToBottom()
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
  persistState()
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
  restoreState()
  syncDrawerViewportHeight()
  syncInputHeight()
  window.addEventListener('resize', syncDrawerViewportHeight)
  window.addEventListener('orientationchange', syncDrawerViewportHeight)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.visualViewport?.addEventListener('resize', syncDrawerViewportHeight)
  window.visualViewport?.addEventListener('scroll', syncDrawerViewportHeight)
})

onScopeDispose(clearAgentAssistantOpenState)
onScopeDispose(() => {
  if (typeof window === 'undefined') return

  window.removeEventListener('resize', syncDrawerViewportHeight)
  window.removeEventListener('orientationchange', syncDrawerViewportHeight)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.visualViewport?.removeEventListener('resize', syncDrawerViewportHeight)
  window.visualViewport?.removeEventListener('scroll', syncDrawerViewportHeight)
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
    <VIcon icon="lucide:bot" size="21" />
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

      <main ref="messageListRef" class="agent-assistant-messages">
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
            v-if="!message.content && !message.attachments.length && message.status === 'streaming'"
            class="agent-assistant-typing"
          >
            <span />
            <span />
            <span />
          </div>
        </div>
      </main>

      <footer class="agent-assistant-composer">
        <VAlert v-if="streamError" type="error" variant="tonal" density="compact" class="mb-3">
          {{ streamError }}
        </VAlert>
        <div class="agent-assistant-input">
          <textarea
            ref="inputRef"
            v-model="inputText"
            class="agent-assistant-textarea"
            rows="1"
            :disabled="sending"
            :placeholder="t('agentAssistant.placeholder')"
            @input="syncInputHeight"
            @keydown="handleInputKeydown"
          />
          <IconBtn
            class="agent-assistant-send"
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
  inset-block-start: 50%;
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

.agent-assistant-panel {
  position: fixed;
  z-index: 2101;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
  block-size: var(--agent-assistant-viewport-height, 100dvh) !important;
  border-inline-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  box-shadow: var(--app-surface-shadow);
  inline-size: var(--agent-assistant-panel-width, 30rem);
  inset-block-start: 0;
  inset-inline-end: 0;
  max-block-size: var(--agent-assistant-viewport-height, 100dvh) !important;
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

.agent-assistant-messages {
  overflow-y: auto;
  padding-block: 1rem calc(env(safe-area-inset-bottom, 0px) + 8.4rem);
  padding-inline: 1rem;
  scrollbar-width: thin;
}

.agent-assistant-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.7);
  min-block-size: 100%;
  padding-block: 2rem 1.25rem;
  padding-inline: 0.25rem;
  text-align: center;
}

.agent-assistant-empty__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.1);
  block-size: 3.75rem;
  box-shadow: inset 0 1px 0 rgba(var(--v-theme-on-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  inline-size: 3.75rem;
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
  max-inline-size: min(100%, 34rem);
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

.agent-assistant-input {
  display: grid;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 16px;
  backdrop-filter: blur(var(--agent-assistant-panel-blur));
  background: var(--agent-assistant-panel-bg);
  box-shadow: var(--app-surface-shadow);
  grid-template-columns: 1fr auto;
  min-block-size: 3.25rem;
  padding-inline: 0.85rem 0.35rem;
  pointer-events: auto;
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

  :deep(pre) {
    overflow: auto;
    padding: 0.75rem;
    border-radius: 10px;
    background: rgba(var(--v-theme-on-surface), 0.08);
    margin-block: 0.5rem;
  }

  :deep(code) {
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.08);
    padding-block: 0.1rem;
    padding-inline: 0.3rem;
  }

  :deep(pre code) {
    padding: 0;
    background: transparent;
  }

  :deep(ul),
  :deep(ol) {
    margin-block-end: 0.5rem;
    padding-inline-start: 1.25rem;
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
    padding-block: 0.85rem calc(env(safe-area-inset-bottom, 0px) + 8.2rem);
    padding-inline: 0.85rem;
  }

  .agent-assistant-composer {
    inset-block-end: calc(env(safe-area-inset-bottom, 0px) + 0.7rem);
    inset-inline: 0.85rem;
  }
}
</style>
