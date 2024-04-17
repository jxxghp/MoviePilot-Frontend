<script lang="ts" setup>
interface Props {
  color?: string
  message?: string
}

const props = defineProps<Props>()
</script>

<template>
  <div class="absolute top-2 right-2 flex items-center justify-between p-2 shadow">
    <VBadge :color="props.color" bordered>
      <template #badge>          
        <VIcon icon="mdi-pulse"></VIcon>
      </template>
    </VBadge>
  </div>
</template>
