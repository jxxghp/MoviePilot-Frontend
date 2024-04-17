<script lang="ts" setup>
import { type PropType, ref } from 'vue'

// 组件接口
interface RenderProps {
  component: string
  text: string
  html: string
  content?: any
  slots?: any
  props?: any
}

// 输入参数
const elementProps = defineProps({
  config: Object as PropType<RenderProps>,
})

// 配置元素
const formItem = ref<RenderProps>(elementProps.config ?? {
  component: 'div',
  text: '',
  html: '',
  props: {},
  content: [],
  slots: {},
})
</script>

<template>
  <Component
    :is="formItem.component"
    v-if="!formItem.html"
    v-bind="formItem.props"
  >
    {{ formItem.text }}
    <template v-for="(content, name) in (formItem.slots || [])" :key="name" v-slot:[name]="{_props}">
      <slot :name="name" v-bind="_props">
        <PageRender
          v-for="(slotItem, slotIndex) in (content || [])"
          :key="slotIndex"
          :config="slotItem"
        />
      </slot>
    </template>
    <PageRender
      v-for="(innerItem, innerIndex) in (formItem.content || [])"
      :key="innerIndex"
      :config="innerItem"
    />
  </Component>
  <Component
    :is="formItem.component"
    v-if="formItem.html"
    v-bind="formItem.props"
    v-html="formItem.html"
  />
</template>
