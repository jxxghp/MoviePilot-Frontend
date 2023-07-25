<script lang="ts" setup>
import { type PropType, ref } from 'vue'

// 组件接口
interface RenderProps {
  component: string
  text: string
  content?: any
  props?: any
}

// 输入参数
const elementProps = defineProps({
  config: Object as PropType<RenderProps>,
  handler: Boolean,
})

// 配置元素
const formItem = ref<RenderProps>(elementProps.config || {
  component: 'div',
  text: '',
  props: {},
  content: [],
})
</script>

<template>
  <Component
    :is="formItem.component"
    v-bind="formItem.props"
  >
    {{ formItem.text }}
    <PageRender
      v-for="(innerItem, innerIndex) in (formItem.content || [])"
      :key="innerIndex"
      :config="innerItem"
    />
  </Component>
</template>
