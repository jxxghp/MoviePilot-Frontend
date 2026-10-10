<script setup lang="ts">
import AgentAssistantEntry from './AgentAssistantEntry.vue'
import AgentAssistantPanel from './AgentAssistantPanel.vue'
import { useAgentHostEnvironment } from './useAgentHostEnvironment'
import { useAppActivityLifecycle } from '@/composables/useAppActivityLifecycle'
import { AGENT_ASSISTANT_LAYER_Z_INDEX } from '@/constants/agentAssistant'
import { getAgentPetId, useAgentPetStore } from '@/stores/agentPet'
import type { AgentHostOpenOptions, AgentHostRect } from '@/types/agentHost'
import { agentHost } from '@/utils/agentHost'
import { createAgentPhaseTracker, type AgentStreamPhaseEvent } from '@/utils/agentHostPhase'
import { onAgentAssistantBubble, setAgentAssistantBubbleEntryActive } from '@/utils/agentAssistantBubble'
import { useTheme } from 'vuetify'

// stage 形象按需加载，内置机器人用户不引入联邦加载链路。
const AgentPetRemote = defineAsyncComponent(() => import('./pet/AgentPetRemote.vue'))

type AgentAssistantEntryRef = InstanceType<typeof AgentAssistantEntry>
type AgentAssistantPanelRef = InstanceType<typeof AgentAssistantPanel>

const panelOpen = ref(false)
const thinking = ref(false)
const entryRef = ref<AgentAssistantEntryRef | null>(null)
const panelRef = ref<AgentAssistantPanelRef | null>(null)
const layerRef = ref<HTMLElement | null>(null)
const { allowsDecorativeMotion } = useAppActivityLifecycle()
const theme = useTheme()
const { themeClasses } = theme
const petStore = useAgentPetStore()
const phaseTracker = createAgentPhaseTracker(agentHost)
const ASSISTANT_PREVIEW_INTERVAL = 125
/** 面板滑入动画结束后再测一次矩形，确保 panelRect 与最终位置一致。 */
const PANEL_RECT_SETTLE_DELAY = 320
let assistantPreviewTimer: number | null = null
let assistantPreviewPendingValue = ''
let assistantPreviewLastShownAt = 0
let assistantPreviewHasShown = false
let panelRectTimer: number | null = null
let panelResizeObserver: ResizeObserver | null = null

useAgentHostEnvironment({
  host: agentHost,
  allowsDecorativeMotion,
  dark: () => Boolean(theme.global?.current?.value?.dark),
})

/** 当前生效的插件形象，null 为内置机器人。 */
const effectivePet = computed(() => petStore.effectivePet)
const effectivePetId = computed(() => (effectivePet.value ? getAgentPetId(effectivePet.value) : ''))
const stagePet = computed(() => (effectivePet.value?.mode === 'stage' ? effectivePet.value : null))
const rendererPet = computed(() => (effectivePet.value?.mode === 'renderer' ? effectivePet.value : null))
/** stage 形象加载完成的标识；加载完成前继续显示内置入口，避免页面上没有入口。 */
const stageReadyId = ref('')
const stageActive = computed(() => Boolean(stagePet.value) && stageReadyId.value === effectivePetId.value)
const stageBubbles = computed(() => (stagePet.value?.bubbles === 'self' ? 'self' : 'host'))
/** 内置入口是否挂载：bubbles=self 的 stage 形象完全接管角色与气泡，宿主只推事件。 */
const showEntry = computed(() => !stageActive.value || stageBubbles.value === 'host')
const entryAnchored = computed(() => stageActive.value && stageBubbles.value === 'host')
const bubbleAnchor = shallowRef<AgentHostRect | null>(null)
const petInteracting = ref(false)

function clearAssistantPreviewTimer() {
  if (assistantPreviewTimer === null) return

  window.clearTimeout(assistantPreviewTimer)
  assistantPreviewTimer = null
}

function showPendingAssistantPreview() {
  assistantPreviewTimer = null
  if (panelOpen.value || !assistantPreviewPendingValue) return

  agentHost.emitHostEvent('agent.preview', { text: assistantPreviewPendingValue })
  // 插件声明正在拖拽角色时不弹宿主预览气泡，事件仍照常推送。
  if (!petInteracting.value) entryRef.value?.showAssistantReplyPreview(assistantPreviewPendingValue)
  assistantPreviewLastShownAt = performance.now()
  assistantPreviewHasShown = true
}

// 打开 Agent 面板并清空入口预览气泡。
function openPanel() {
  panelOpen.value = true
  assistantPreviewPendingValue = ''
  clearAssistantPreviewTimer()
  entryRef.value?.clearBubbles()
}

/** 宿主 open：重复调用保持打开，草稿只填入输入框，不发送。 */
function openFromHost(options?: AgentHostOpenOptions) {
  openPanel()
  const draft = typeof options?.draft === 'string' ? options.draft : ''
  if (draft) nextTick(() => panelRef.value?.setDraft(draft))
}

// 面板关闭时限制预览更新频率，避免每个流式 token 都触发气泡布局。
function handleAssistantPreview(value: string) {
  if (panelOpen.value) return

  assistantPreviewPendingValue = value
  const elapsed = performance.now() - assistantPreviewLastShownAt
  if (!assistantPreviewHasShown || elapsed >= ASSISTANT_PREVIEW_INTERVAL) {
    clearAssistantPreviewTimer()
    showPendingAssistantPreview()
    return
  }

  if (assistantPreviewTimer !== null) return
  assistantPreviewTimer = window.setTimeout(showPendingAssistantPreview, ASSISTANT_PREVIEW_INTERVAL - elapsed)
}

function handleThinkingChange(value: boolean) {
  thinking.value = value
  phaseTracker.handleThinkingChange(value)
}

function handleStreamPhase(event: AgentStreamPhaseEvent) {
  phaseTracker.handleStreamPhase(event)
}

/** 读取面板当前占据的视口矩形。 */
function getPanelElement() {
  return layerRef.value?.querySelector<HTMLElement>('.agent-assistant-panel') ?? null
}

function syncPanelRect() {
  const panel = panelOpen.value ? getPanelElement() : null
  const rect = panel?.getBoundingClientRect()
  agentHost.setState({
    panelRect:
      rect && rect.width > 0 && rect.height > 0
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        : null,
  })
}

function clearPanelRectTracking() {
  if (panelRectTimer !== null) window.clearTimeout(panelRectTimer)
  panelRectTimer = null
  panelResizeObserver?.disconnect()
  panelResizeObserver = null
}

function trackPanelRect() {
  clearPanelRectTracking()
  syncPanelRect()
  if (!panelOpen.value) return

  panelRectTimer = window.setTimeout(() => {
    panelRectTimer = null
    syncPanelRect()
  }, PANEL_RECT_SETTLE_DELAY)
  const panel = getPanelElement()
  if (panel && typeof ResizeObserver !== 'undefined') {
    panelResizeObserver = new ResizeObserver(syncPanelRect)
    panelResizeObserver.observe(panel)
  }
}

function handleStageReady() {
  stageReadyId.value = effectivePetId.value
}

function handleBubbleAnchor(rect: AgentHostRect | null) {
  bubbleAnchor.value = rect
}

function handleInteracting(value: boolean) {
  petInteracting.value = value
}

watch(panelOpen, open => {
  agentHost.setState({ panelOpen: open })
  agentHost.emitHostEvent(open ? 'agent.panel.open' : 'agent.panel.close')
  nextTick(trackPanelRect)
})

// 切换形象即时生效：清空旧形象上报的锚点与交互状态，新的 stage 形象加载完成前保留内置入口。
watch(effectivePetId, () => {
  stageReadyId.value = ''
  bubbleAnchor.value = null
  petInteracting.value = false
})

// bubbles=self 时内置入口不挂载，由宿主保持气泡总线可用，toast 和通知以 agent.bubble 推给形象。
watch(
  [showEntry, panelOpen],
  ([entryVisible, open]) => {
    if (!entryVisible) setAgentAssistantBubbleEntryActive(!open)
  },
  { flush: 'post', immediate: true },
)

const stopBubbleForward = onAgentAssistantBubble(payload => {
  agentHost.emitHostEvent('agent.bubble', {
    id: payload.id,
    kind: payload.kind || 'notification',
    variant: payload.variant || 'default',
    title: payload.title,
    text: payload.text || '',
  })
})

const unbindController = agentHost.bindController({
  open: openFromHost,
  close: () => {
    panelOpen.value = false
  },
})

onMounted(() => {
  agentHost.setState({ available: true, panelOpen: panelOpen.value })
  void petStore.start()
})

onScopeDispose(() => {
  clearAssistantPreviewTimer()
  clearPanelRectTracking()
  stopBubbleForward()
  unbindController()
  if (!showEntry.value) setAgentAssistantBubbleEntryActive(false)
  phaseTracker.reset()
  petStore.stop()
  agentHost.resetState()
})
</script>

<template>
  <!-- 脱离 .v-application 的层叠上下文，确保弹窗打开时入口、消息气泡和面板仍在最上层。 -->
  <Teleport to="body">
    <div ref="layerRef" class="agent-assistant-layer" :class="themeClasses">
      <!--
        stage 形象图层覆盖整个视口但不拦截任何点击，插件自己的元素按需打开 pointer-events；
        层级与入口相同，高于 Vuetify 弹窗和遮罩。focusin 不外泄，避免弹窗焦点陷阱抢回焦点。
      -->
      <div
        v-if="stagePet"
        class="agent-pet-stage-layer"
        :style="{ zIndex: AGENT_ASSISTANT_LAYER_Z_INDEX.entry }"
        data-agent-pet-stage
        @focusin.stop
      >
        <AgentPetRemote
          :key="effectivePetId"
          :pet="stagePet"
          @ready="handleStageReady"
          @bubble-anchor="handleBubbleAnchor"
          @interacting="handleInteracting"
        />
      </div>
      <AgentAssistantEntry
        v-if="showEntry"
        ref="entryRef"
        :active="!panelOpen"
        :motion-active="allowsDecorativeMotion"
        :thinking="thinking"
        :pet="rendererPet"
        :anchored="entryAnchored"
        :anchor-rect="entryAnchored ? bubbleAnchor : null"
        @open="openPanel"
      />
      <AgentAssistantPanel
        ref="panelRef"
        v-model="panelOpen"
        :motion-active="allowsDecorativeMotion"
        @assistant-preview="handleAssistantPreview"
        @thinking-change="handleThinkingChange"
        @stream-phase="handleStreamPhase"
      />
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.agent-pet-stage-layer {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
</style>
