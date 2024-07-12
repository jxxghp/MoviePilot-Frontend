<script lang="ts" setup>
import type { PropType } from 'vue'

// 输入参数
const props = defineProps({
  history: Object as PropType<{ [key: string]: string }>,
  cutoff: String,
})

const version_delta = computed(() => {
  const { cutoff, history = {} } = props
  if (!cutoff) return props.history

  // history -> all entries before cutoff == key
  const keys = Object.keys(history)
  const index = keys.indexOf(`v${cutoff}`)
  if (index === -1) return props.history

  return keys.slice(0, index).reduce((acc, key) => {
    acc[key] = history[key]
    return acc
  }, {} as { [key: string]: string })
})
</script>

<template>
  <VCardText>
    <VList>
      <VListItem v-for="(value, key) in version_delta" :key="key">
        <VListItemTitle class="font-bold text-lg">
          {{ key }}
        </VListItemTitle>
        <div class="text-gray-500">
          {{ value }}
        </div>
      </VListItem>
    </VList>
  </VCardText>
</template>
