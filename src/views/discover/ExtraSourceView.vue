<script setup lang="ts">
import { DiscoverSource } from '@/api/types'
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import FormRender from '@/components/render/FormRender.vue'
import { cloneDeep, isEqual } from 'lodash-es'

// 输入参数
const props = defineProps<{
  source: DiscoverSource
}>()

// 默认输入参数
let defaultParams = cloneDeep(props.source.filter_params)

// 过滤参数
const filterParams = reactive(cloneDeep(props.source.filter_params))

// 前一次的过滤参数
let previousParams = cloneDeep(props.source.filter_params)

// 当前Key
const currentKey = ref(0)

// 来源筛选契约变化时重建模型；语义相同的来源快照保留用户当前选择。
watch(
  () => props.source.filter_params,
  newDefaultParams => {
    if (isEqual(newDefaultParams, defaultParams)) return

    defaultParams = cloneDeep(newDefaultParams)
    for (const key of Object.keys(filterParams)) delete filterParams[key]
    Object.assign(filterParams, cloneDeep(newDefaultParams))
    previousParams = cloneDeep(newDefaultParams)
  },
  { deep: true },
)

// 类型和过滤参数变化后重新刷新列表
watch(filterParams, newParams => {
  // 检查每个值
  for (const key in newParams) {
    // 如果没有值但有默认值时，设置为默认值
    if (!newParams[key] && defaultParams[key]) {
      filterParams[key] = defaultParams[key]
    }
    // 检查依赖关系
    const depends = props.source?.depends
    if (depends) {
      if (newParams[key] !== previousParams[key]) {
        for (const dependKey in depends) {
          if (key != dependKey && depends[dependKey] && depends[dependKey].includes(key)) {
            filterParams[dependKey] = null
          }
        }
      }
    }
  }
  // 更新 previousParams
  previousParams = cloneDeep(newParams)
  // 刷新界面
  currentKey.value++
})
</script>

<template>
  <div class="px-3">
    <FormRender v-for="(element, index) in source.filter_ui" :key="index" :config="element" :model="filterParams" />
  </div>
  <div>
    <MediaCardListView :key="`${source.api_path}:${currentKey}`" :apipath="source.api_path" :params="filterParams" />
  </div>
</template>

<style>
.v-chip--selected {
  color: rgb(var(--v-theme-primary)) !important;
}
</style>
