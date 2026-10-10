<script setup lang="ts">
import type { AgentPetDeclaration } from '@/types/agentHost'
import CssRobotRenderer from './renderers/CssRobotRenderer.vue'
import type { AgentPetActionName, AgentPetIntent, AgentPetRendererKind } from './types'

// 插件形象按需加载，未启用插件形象时入口不引入联邦加载链路。
const AgentPetRemote = defineAsyncComponent(() => import('./AgentPetRemote.vue'))

const props = withDefaults(
  defineProps<{
    action?: AgentPetActionName | null
    intent?: AgentPetIntent
    renderer?: AgentPetRendererKind
    thinking?: boolean
    /** renderer 模式的插件形象；为空或加载完成前使用内置机器人。 */
    pet?: AgentPetDeclaration | null
    motionActive?: boolean
  }>(),
  {
    action: null,
    intent: 'idle',
    renderer: 'css-robot',
    thinking: false,
    pet: null,
    motionActive: true,
  },
)

const rendererPet = computed(() => (props.pet?.mode === 'renderer' ? props.pet : null))
const remoteReadyId = ref('')
const rendererPetId = computed(() =>
  rendererPet.value ? `${rendererPet.value.plugin_id}:${rendererPet.value.key}` : '',
)
// 插件组件加载完成前继续显示内置机器人，避免入口出现空白。
const showBuiltinRenderer = computed(() => !rendererPet.value || remoteReadyId.value !== rendererPetId.value)

watch(rendererPetId, () => {
  remoteReadyId.value = ''
})
</script>

<template>
  <span v-if="rendererPet" v-show="!showBuiltinRenderer" class="agent-pet-renderer" data-agent-pet-renderer="remote">
    <AgentPetRemote
      :key="rendererPetId"
      :pet="rendererPet"
      :action="props.action"
      :intent="props.intent"
      :thinking="props.thinking"
      :motion-active="props.motionActive"
      @ready="remoteReadyId = rendererPetId"
    />
  </span>
  <CssRobotRenderer
    v-if="props.renderer === 'css-robot' && showBuiltinRenderer"
    :action="props.action"
    :intent="props.intent"
    :thinking="props.thinking"
  />
</template>

<style lang="scss" scoped>
// 插件 renderer 填满入口触发热区，入口的拖拽、贴边和气泡定位保持不变。
.agent-pet-renderer {
  position: absolute;
  display: block;
  inset: 0;
}
</style>
