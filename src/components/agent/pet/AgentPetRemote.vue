<script setup lang="ts">
import type { Component } from 'vue'
import { createPluginInstanceApi } from '@/api'
import api from '@/api'
import { AGENT_HOST_INJECTION_KEY, useScopedAgentHost } from '@/composables/useAgentHost'
import { useAgentPetStore } from '@/stores/agentPet'
import type { AgentHostRect, AgentPetContext, AgentPetDeclaration } from '@/types/agentHost'
import { loadRemoteComponent } from '@/utils/federationLoader'
import type { AgentPetActionName, AgentPetIntent } from './types'

/** 联邦形象组件加载超时，超时后回退内置机器人。 */
const AGENT_PET_LOAD_TIMEOUT = 8000

/** 形象私有持久数据的序列化上限（字节）。 */
const AGENT_PET_STATE_MAX_BYTES = 16 * 1024

const props = withDefaults(
  defineProps<{
    /** 当前生效的形象声明。 */
    pet: AgentPetDeclaration
    /** 以下仅 renderer 模式透传给插件组件。 */
    action?: AgentPetActionName | null
    intent?: AgentPetIntent
    thinking?: boolean
    motionActive?: boolean
  }>(),
  {
    action: null,
    intent: 'idle',
    thinking: false,
    motionActive: true,
  },
)

const emit = defineEmits<{
  /** 插件组件已加载并挂载。 */
  ready: []
  /** stage 模式插件上报的气泡锚点。 */
  'bubble-anchor': [rect: AgentHostRect | null]
  /** stage 模式插件声明的拖拽交互状态。 */
  interacting: [value: boolean]
}>()

const petStore = useAgentPetStore()
const remoteComponent = shallowRef<Component | null>(null)
const pluginId = computed(() => props.pet.plugin_id)
const sourcePluginId = computed(() => props.pet.source_plugin_id || props.pet.plugin_id)

// 形象与插件其他联邦组件共享同一条宿主事件总线，卸载时清空本实例的订阅。
const scopedAgent = useScopedAgentHost(pluginId)
provide(AGENT_HOST_INJECTION_KEY, scopedAgent)

const scopedPluginApi = computed(() => createPluginInstanceApi(pluginId.value, sourcePluginId.value))

/** 规整插件上报的矩形，非法值视为隐藏锚点。 */
function normalizeRect(rect: AgentHostRect | null): AgentHostRect | null {
  if (!rect) return null
  const values = [rect.x, rect.y, rect.width, rect.height]
  if (!values.every(value => typeof value === 'number' && Number.isFinite(value))) return null
  return { x: rect.x, y: rect.y, width: Math.max(0, rect.width), height: Math.max(0, rect.height) }
}

/** 形象私有 user config key。 */
function getStateConfigKey() {
  return `user/config/AgentPetState.${props.pet.plugin_id}.${props.pet.key}`
}

const petContext: AgentPetContext = {
  get mode() {
    return props.pet.mode
  },
  get key() {
    return props.pet.key
  },
  setBubbleAnchor(rect) {
    if (props.pet.mode !== 'stage') return
    emit('bubble-anchor', normalizeRect(rect))
  },
  setInteracting(value) {
    if (props.pet.mode !== 'stage') return
    emit('interacting', Boolean(value))
  },
  storage: {
    async get<T = unknown>() {
      const response = await api.get<{ value?: unknown }>(getStateConfigKey(), { feedback: 'silent' })
      return (response?.value ?? null) as T | null
    },
    async set(value: unknown) {
      const serialized = JSON.stringify(value ?? null)
      if (new TextEncoder().encode(serialized).length > AGENT_PET_STATE_MAX_BYTES) {
        throw new Error('AgentPet storage 超过 16KB 上限')
      }
      await api.post(getStateConfigKey(), value ?? null, { feedback: 'silent' })
    },
  },
}

let loadGeneration = 0

/** 在超时内加载联邦形象组件，失败或超时记录到 store 以回退内置机器人。 */
async function loadPetComponent(pet: AgentPetDeclaration) {
  const generation = ++loadGeneration
  remoteComponent.value = null
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('timeout')), AGENT_PET_LOAD_TIMEOUT)
    })
    const component = (await Promise.race([
      loadRemoteComponent(pet.plugin_id, pet.component || 'AgentPet'),
      timeout,
    ])) as Component
    if (generation !== loadGeneration) return
    if (!component) throw new Error('empty component')
    remoteComponent.value = markRaw(component)
    await nextTick()
    if (generation === loadGeneration) emit('ready')
  } catch (error) {
    if (generation !== loadGeneration) return
    const reason = error instanceof Error && error.message === 'timeout' ? '加载超时' : '加载失败'
    petStore.markFailed(pet, reason, error)
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

watch(
  () => `${props.pet.plugin_id}:${props.pet.key}:${props.pet.component}`,
  () => {
    void loadPetComponent(props.pet)
  },
  { immediate: true },
)

// 插件组件运行时抛错时回退内置机器人，并阻止错误继续冒泡到应用级处理。
onErrorCaptured(error => {
  petStore.markFailed(props.pet, '运行时出错', error)
  return false
})

onBeforeUnmount(() => {
  loadGeneration++
  if (props.pet.mode === 'stage') emit('bubble-anchor', null)
})
</script>

<template>
  <component
    :is="remoteComponent"
    v-if="remoteComponent && props.pet.mode === 'stage'"
    :agent="scopedAgent"
    :pet="petContext"
    :api="scopedPluginApi"
    :plugin-id="pluginId"
    :source-plugin-id="sourcePluginId"
  />
  <component
    :is="remoteComponent"
    v-else-if="remoteComponent"
    :agent="scopedAgent"
    :pet="petContext"
    :api="scopedPluginApi"
    :plugin-id="pluginId"
    :source-plugin-id="sourcePluginId"
    :action="props.action"
    :intent="props.intent"
    :thinking="props.thinking"
    :motion-active="props.motionActive"
  />
</template>
