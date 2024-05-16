<script lang="ts" setup>
import { RenderProps } from '@/api/types'
import { type PropType } from 'vue'

// 输入参数
const elementProps = defineProps({
  config: Object as PropType<RenderProps>,
})
</script>

<template>
  <Component :is="elementProps.config?.component" v-if="!elementProps.config?.html" v-bind="elementProps.config?.props">
    {{ elementProps.config?.text }}
    <template v-for="(content, name) in elementProps.config?.slots || []" :key="name" v-slot:[name]="{ _props }">
      <slot :name="name" v-bind="_props">
        <DashboardRender v-for="(slotItem, slotIndex) in content || []" :key="slotIndex" :config="slotItem" />
      </slot>
    </template>
    <DashboardRender
      v-for="(innerItem, innerIndex) in elementProps.config?.content || []"
      :key="innerIndex"
      :config="innerItem"
    />
  </Component>
  <Component
    :is="elementProps.config?.component"
    v-if="elementProps.config?.html"
    v-bind="elementProps.config?.props"
    v-html="elementProps.config?.html"
  />
</template>
