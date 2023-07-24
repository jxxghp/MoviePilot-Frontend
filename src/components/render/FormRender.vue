<script lang="ts" setup>
import { type PropType, ref } from 'vue'

// 组件配置
interface RenderProps {
  component: string
  content?: any
  props?: any
}

// 输入参数
const elementProps = defineProps({
  config: Object as PropType<RenderProps>,
})

// 配置表单
const formItem = ref<RenderProps>(elementProps.config || {
  component: 'div',
  props: {},
  content: [],
})
</script>

<template>
  <Component :is="formItem.component" v-bind="formItem.props">
    <FormRender v-for="(innerItem, innerIndex) in (formItem.content || [])" :key="innerIndex" :config="innerItem" />
  </Component>
</template>
