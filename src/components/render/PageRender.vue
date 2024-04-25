<script lang="ts" setup>
import { isNullOrEmptyObject } from '@/@core/utils'
import api from '@/api'
import { type PropType, ref } from 'vue'

// 定议外部事件
const emit = defineEmits(['action'])

// 组件接口
interface RenderProps {
  component: string
  text: string
  html: string
  content?: any
  slots?: any
  props?: any
  events?: any
}

// 输入参数
const elementProps = defineProps({
  config: Object as PropType<RenderProps>,
})

// 元素API事件响应
async function commonAction(api_path: string, method: string, params = {}) {
  if (!api_path || !method) return
  if (method.toUpperCase() === 'GET') {
    await api.get(api_path, {
      params: params,
    })
  } else {
    await api.post(api_path, params)
  }
  emit('action')
}

// 组装事件
let componentEvents: { [key: string]: any } = {}
if (!isNullOrEmptyObject(elementProps.config?.events)) {
  for (const key in elementProps.config?.events) {
    const attr = elementProps.config?.events[key]
    const func = async () => {
      await commonAction(attr['api'], attr['method'], attr['params'])
    }
    componentEvents[key] = func
  }
} else {
  componentEvents = {}
}
</script>

<template>
  <Component
    :is="elementProps.config?.component"
    v-if="!elementProps.config?.html"
    v-bind="elementProps.config?.props"
    v-on="componentEvents"
  >
    {{ elementProps.config?.text }}
    <template v-for="(content, name) in elementProps.config?.slots || []" :key="name" v-slot:[name]="{ _props }">
      <slot :name="name" v-bind="_props">
        <PageRender
          v-for="(slotItem, slotIndex) in content || []"
          :key="slotIndex"
          :config="slotItem"
          @action="emit('action')"
        />
      </slot>
    </template>
    <PageRender
      v-for="(innerItem, innerIndex) in elementProps.config?.content || []"
      :key="innerIndex"
      :config="innerItem"
      @action="emit('action')"
    />
  </Component>
  <Component
    :is="elementProps.config?.component"
    v-if="elementProps.config?.html"
    v-bind="elementProps.config?.props"
    v-html="elementProps.config?.html"
    v-on="componentEvents"
  />
</template>
