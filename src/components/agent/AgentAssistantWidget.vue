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

// 打开 Agent 面板并清空入口预览气泡。
function openPanel() {
  panelOpen.value = true
  entryRef.value?.clearBubbles()
}

// 在面板关闭时展示助手回复预览。
function handleAssistantPreview(value: string) {
  if (panelOpen.value) return

  entryRef.value?.showAssistantReplyPreview(value)
}
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
