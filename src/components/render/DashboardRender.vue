<script lang="ts" setup>
import { RenderProps } from '@/api/types'
import { type PropType } from 'vue'

// 输入参数
const elementProps = defineProps({
  // 仪表盘失活时仅卸载依赖已连接 DOM 的图表，保留静态结构和其他控件状态。
  active: {
    type: Boolean,
    default: true,
  },
  config: Object as PropType<RenderProps>,
})

const canRenderComponent = computed(() => elementProps.active || elementProps.config?.component !== 'VApexChart')
</script>

<template>
  <Component
    :is="elementProps.config?.component"
    v-if="canRenderComponent && !elementProps.config?.html"
    v-bind="elementProps.config?.props"
  >
    {{ elementProps.config?.text }}
    <template v-for="(content, name) in elementProps.config?.slots || []" :key="name" v-slot:[name]="{ _props }">
      <slot :name="name" v-bind="_props">
        <DashboardRender
          v-for="(slotItem, slotIndex) in content || []"
          :key="slotIndex"
          :active="elementProps.active"
          :config="slotItem"
        />
      </slot>
    </template>
    <DashboardRender
      v-for="(innerItem, innerIndex) in elementProps.config?.content || []"
      :key="innerIndex"
      :active="elementProps.active"
      :config="innerItem"
    />
  </Component>
  <Component
    :is="elementProps.config?.component"
    v-if="canRenderComponent && elementProps.config?.html"
    v-bind="elementProps.config?.props"
    v-html="elementProps.config?.html"
  />
</template>
