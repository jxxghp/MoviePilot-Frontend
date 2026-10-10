<script setup lang="ts">
import type { AgentPetDeclaration } from '@/types/agentHost'

const props = withDefaults(
  defineProps<{
    /** 当前生效的插件形象；为空时直接显示默认插槽中的内置图标。 */
    pet?: AgentPetDeclaration | null
    /** 头像边长，CSS 尺寸。 */
    size?: string
  }>(),
  {
    pet: null,
    size: '1.85rem',
  },
)

/** 头像候选：avatar_url、preview_url 依次尝试，全部失败后退回插槽里的内置图标。 */
const candidates = computed(() =>
  [props.pet?.avatar_url, props.pet?.preview_url].filter((url): url is string => typeof url === 'string' && !!url),
)
const failedCount = ref(0)
const currentUrl = computed(() => candidates.value[failedCount.value] || '')

// 只在候选地址真正变化时重试；形象声明对象被重新读取但地址相同时，保留已失败的结论。
watch(
  () => candidates.value.join('\n'),
  () => {
    failedCount.value = 0
  },
)

function handleError() {
  failedCount.value += 1
}
</script>

<template>
  <img
    v-if="currentUrl"
    :key="currentUrl"
    class="agent-pet-avatar"
    :src="currentUrl"
    :alt="props.pet?.name || ''"
    :style="{ blockSize: props.size, inlineSize: props.size }"
    draggable="false"
    @error="handleError"
  />
  <slot v-else />
</template>

<style lang="scss" scoped>
.agent-pet-avatar {
  display: block;
  flex: 0 0 auto;
  border-radius: var(--app-control-radius, 0.5rem);
  object-fit: cover;
}
</style>
