<script lang="ts" setup>
import { isNullOrEmptyObject } from '@/@core/utils'
import api from '@/api'
import { type PropType } from 'vue'
import { RenderProps } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'

const ProgressDialog = defineAsyncComponent(() => import('../dialog/ProgressDialog.vue'))

// 定议外部事件
const emit = defineEmits(['action'])

// 输入参数
const props = defineProps({
  config: Object as PropType<RenderProps>,
})

// 进度框文本
const progressText = ref('正在处理...')

let progressDialogController: ReturnType<typeof openSharedDialog> | null = null

// 打开共享进度弹窗，避免渲染节点直接持有弹窗实例。
function openProgressDialog() {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text: progressText.value }, {}, { closeOn: false })
}

// 关闭当前共享进度弹窗。
function closeProgressDialog() {
  progressDialogController?.close()
  progressDialogController = null
}

// 元素API事件响应
async function commonAction(api_path: string, method: string, params = {}) {
  if (!api_path || !method) return
  openProgressDialog()
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
  } finally {
    closeProgressDialog()
  }
}

// 组装事件
let componentEvents = reactive<{ [key: string]: any }>({})
watchEffect(() => {
  if (!isNullOrEmptyObject(props.config?.events)) {
    for (const key in props.config?.events) {
      const attr = props.config?.events[key]
      const func = async () => {
        await commonAction(attr['api'], attr['method'], attr['params'])
      }
      componentEvents[key] = func
    }
  }
})
</script>

<template>
  <Component :is="config?.component" v-if="!config?.html" v-bind="config?.props" v-on="componentEvents">
    {{ config?.text }}
    <PageRender
      v-for="(innerItem, innerIndex) in config?.content || []"
      :key="innerIndex"
      :config="innerItem"
      @action="emit('action')"
    />
  </Component>
  <Component
    :is="config?.component"
    v-if="config?.html"
    v-bind="config?.props"
    v-html="config?.html"
    v-on="componentEvents"
  />
</template>
