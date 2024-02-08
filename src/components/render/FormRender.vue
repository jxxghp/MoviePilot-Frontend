<script lang="ts" setup>
import { type PropType, ref } from 'vue'

// 组件接口
interface RenderProps {
  component: string
  text: string
  html: string
  content?: any
  props?: any
}

// 输入参数
const elementProps = defineProps({
  config: Object as PropType<RenderProps>,
  form: Object as PropType<any>,
})

// 配置元素
const formItem = ref<RenderProps>(elementProps.config ?? {
  component: 'div',
  text: '',
  html: '',
  props: {},
  content: [],
})

// 配置数据
const formData = ref<any>(elementProps.form || {})
</script>

<template>
  <Component
    :is="formItem.component"
    v-if="!formItem.html"
    v-bind="formItem.props"
    v-model="formData[formItem.props?.model || '']"
    v-model:value="formData[formItem.props?.modelvalue || '']"
  >
    {{ formItem.text }}
    <FormRender
      v-for="(innerItem, innerIndex) in (formItem.content || [])"
      :key="innerIndex"
      v-model="formData[innerItem.props?.model || '']"
      v-model:value="formData[formItem.props?.modelvalue || '']"
      :config="innerItem"
      :form="formData"
    />
  </Component>
  <Component
    :is="formItem.component"
    v-if="formItem.html"
    v-bind="formItem.props"
    v-html="formItem.html"
  />
</template>
