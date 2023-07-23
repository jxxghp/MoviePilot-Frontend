<script lang="ts" setup>
import { type PropType, ref } from 'vue'

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
  <Component :is="item.component" v-for="(item, index) in formItems" :key="index">
    <FormRender v-for="(innerItem, innerIndex) in (item.content || [])" :key="innerIndex" :config="innerItem" />
  </Component>
</template>
