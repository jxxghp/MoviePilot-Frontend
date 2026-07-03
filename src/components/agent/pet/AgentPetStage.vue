<script setup lang="ts">
import CssRobotRenderer from './renderers/CssRobotRenderer.vue'
import type { AgentPetActionName, AgentPetIntent, AgentPetRendererKind } from './types'

const props = withDefaults(
  defineProps<{
    action?: AgentPetActionName | null
    intent?: AgentPetIntent
    renderer?: AgentPetRendererKind
    thinking?: boolean
  }>(),
  {
    action: null,
    intent: 'idle',
    renderer: 'css-robot',
    thinking: false,
  },
)
</script>

<template>
  <CssRobotRenderer
    v-if="props.renderer === 'css-robot'"
    :action="props.action"
    :intent="props.intent"
    :thinking="props.thinking"
  />
</template>
