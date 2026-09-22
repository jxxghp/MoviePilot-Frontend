<script setup lang="ts">
import type { AgentPetActionName, AgentPetIntent } from '../types'
import { getAgentPetActionDuration } from '../agentPetActions'

const props = withDefaults(
  defineProps<{
    action?: AgentPetActionName | null
    intent?: AgentPetIntent
    thinking?: boolean
  }>(),
  {
    action: null,
    intent: 'idle',
    thinking: false,
  },
)
</script>

<template>
  <span
    class="agent-assistant-fab__bot"
    :data-agent-pet-action="props.action || undefined"
    :data-agent-pet-intent="props.intent"
    :data-agent-pet-thinking="props.thinking ? 'true' : undefined"
    :style="
      props.action ? { '--agent-pet-action-duration': `${getAgentPetActionDuration(props.action)}ms` } : undefined
    "
    aria-hidden="true"
  >
    <span class="agent-assistant-fab__head">
      <!-- 天线固定在头壳上，点头和侧倾时保持连接。 -->
      <span class="agent-assistant-fab__antenna" />
      <span class="agent-assistant-fab__face">
        <span class="agent-assistant-fab__eye agent-assistant-fab__eye--left" />
        <span class="agent-assistant-fab__eye agent-assistant-fab__eye--right" />
      </span>
    </span>
    <span class="agent-assistant-fab__body">
      <span class="agent-assistant-fab__core" />
    </span>
    <span class="agent-assistant-fab__arm agent-assistant-fab__arm--left" />
    <span class="agent-assistant-fab__arm agent-assistant-fab__arm--right" />
    <span class="agent-assistant-fab__leg agent-assistant-fab__leg--left" />
    <span class="agent-assistant-fab__leg agent-assistant-fab__leg--right" />
  </span>
</template>

<style src="./cssRobot.scss" lang="scss"></style>
