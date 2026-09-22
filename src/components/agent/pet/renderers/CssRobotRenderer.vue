<script setup lang="ts">
import type { AgentPetActionName, AgentPetIntent } from '../types'

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
    aria-hidden="true"
  >
    <span class="agent-assistant-fab__antenna" />
    <span class="agent-assistant-fab__head">
      <span class="agent-assistant-fab__face">
        <span class="agent-assistant-fab__eye agent-assistant-fab__eye--left" />
        <span class="agent-assistant-fab__eye agent-assistant-fab__eye--right" />
        <span class="agent-assistant-fab__smile" />
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
