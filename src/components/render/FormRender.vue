<script lang="ts" setup>
import { type PropType, ref } from 'vue'

// 组件配置
interface RenderProps {
  component: string
  content: any
  props: any
}

// 输入参数
const elementProps = defineProps({
  config: Array as PropType<RenderProps[]>,
})

// 配置表单
const formItems = ref(elementProps.config)
</script>

<template>
  <Component :is="item.component" v-for="(item, index) in formItems" :key="index" v-bind="item.props">
    <FormRender v-for="(innerItem, innerIndex) in (item.content || [])" :key="innerIndex" :config="innerItem" />
  </Component>
</template>
