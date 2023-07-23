<script lang="ts" setup>
import type { PropType } from 'vue'

interface RenderProps {
  component: string
  content: any
}

// 输入参数
const props = defineProps({
  config: Array as PropType<RenderProps[]>,
})

// 配置表单
const formItems = ref(props.config)
</script>

<template>
  <Component :is="item.component" v-for="(item, index) in formItems" :key="index" v-bind="$attrs">
    <template v-for="(innerItem, innerIndex) in item.content" :key="innerIndex">
      <FormRender v-if="innerItem.component" :config="innerItem" v-bind="$attrs" />
      <Component :is="innerItem.component" v-else v-bind="innerItem" />
    </template>
  </Component>
</template>
