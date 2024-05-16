<script lang="ts" setup>
import { isNullOrEmptyObject } from '@/@core/utils'
import api from '@/api'
import { type PropType } from 'vue'
import ProgressDialog from '../dialog/ProgressDialog.vue'
import { RenderProps } from '@/api/types'

// 定议外部事件
const emit = defineEmits(['action'])

// 输入参数
const elementProps = defineProps({
  config: Object as PropType<RenderProps>,
})

// 进度框
const progressDialog = ref(false)

// 进度框文本
const progressText = ref('正在处理...')

// 元素API事件响应
async function commonAction(api_path: string, method: string, params = {}) {
  if (!api_path || !method) return
  progressDialog.value = true
  try {
    if (method.toUpperCase() === 'GET') {
      await api.get(api_path, {
        params: params,
      })
    } else {
      await api.post(api_path, params)
    }
    emit('action')
  } catch (error) {
    console.error(error)
  }
  progressDialog.value = false
}

// 组装事件
let componentEvents = reactive<{ [key: string]: any }>({})
watchEffect(() => {
  if (!isNullOrEmptyObject(elementProps.config?.events)) {
    for (const key in elementProps.config?.events) {
      const attr = elementProps.config?.events[key]
      const func = async () => {
        await commonAction(attr['api'], attr['method'], attr['params'])
      }
      componentEvents[key] = func
    }
  }
})
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
  <!-- 进度框 -->
  <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />
</template>
