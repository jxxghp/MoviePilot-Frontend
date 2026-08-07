<script setup lang="ts">
import AgentAssistantEntry from './AgentAssistantEntry.vue'
import AgentAssistantPanel from './AgentAssistantPanel.vue'
import { useAppActivityLifecycle } from '@/composables/useAppActivityLifecycle'
import { useTheme } from 'vuetify'

type AgentAssistantEntryRef = InstanceType<typeof AgentAssistantEntry>

const panelOpen = ref(false)
const thinking = ref(false)
const entryRef = ref<AgentAssistantEntryRef | null>(null)
const { allowsDecorativeMotion } = useAppActivityLifecycle()
const { themeClasses } = useTheme()
const ASSISTANT_PREVIEW_INTERVAL = 125
let assistantPreviewTimer: number | null = null
let assistantPreviewPendingValue = ''
let assistantPreviewLastShownAt = 0
let assistantPreviewHasShown = false

function clearAssistantPreviewTimer() {
  if (assistantPreviewTimer === null) return

  window.clearTimeout(assistantPreviewTimer)
  assistantPreviewTimer = null
}

function showPendingAssistantPreview() {
  assistantPreviewTimer = null
  if (panelOpen.value || !assistantPreviewPendingValue) return

  entryRef.value?.showAssistantReplyPreview(assistantPreviewPendingValue)
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

onScopeDispose(clearAssistantPreviewTimer)
</script>

<template>
  <!-- 脱离 .v-application 的层叠上下文，确保弹窗打开时入口、消息气泡和面板仍在最上层。 -->
  <Teleport to="body">
    <div class="agent-assistant-layer" :class="themeClasses">
      <AgentAssistantEntry
        ref="entryRef"
        :active="!panelOpen"
        :motion-active="allowsDecorativeMotion"
        :thinking="thinking"
        @open="openPanel"
      />
      <AgentAssistantPanel
        v-model="panelOpen"
        :motion-active="allowsDecorativeMotion"
        @assistant-preview="handleAssistantPreview"
        @thinking-change="thinking = $event"
      />
    </div>
  </Teleport>
</template>
