<script setup lang="ts">
import AgentAssistantEntry from './AgentAssistantEntry.vue'
import AgentAssistantPanel from './AgentAssistantPanel.vue'

type AgentAssistantEntryRef = InstanceType<typeof AgentAssistantEntry>

const panelOpen = ref(false)
const thinking = ref(false)
const entryRef = ref<AgentAssistantEntryRef | null>(null)

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
  <AgentAssistantEntry ref="entryRef" :active="!panelOpen" :thinking="thinking" @open="openPanel" />
  <AgentAssistantPanel v-model="panelOpen" @assistant-preview="handleAssistantPreview" @thinking-change="thinking = $event" />
</template>
