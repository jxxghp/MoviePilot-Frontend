<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/** 探索与订阅列表共用的无框流式筛选轨道，移动端默认仅常驻首行并支持原位平滑展开。 */
interface Props {
  /** 已生效的次级筛选数量，移动端收起态以数字角标提示当前处于过滤状态。 */
  activeCount?: number
  /** 是否存在可折叠的次级筛选行。 */
  collapsible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  activeCount: 0,
  collapsible: true,
})

const { t } = useI18n()

// 移动端默认收起次级筛选行，把首屏空间留给海报；桌面端由 CSS 始终展开。
const isExpanded = ref(false)

/** 切换移动端次级筛选展开状态。 */
function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div class="app-filter-bar">
    <div class="app-filter-bar__head">
      <div class="app-filter-bar__primary">
        <slot name="primary" />
      </div>
      <button
        v-if="props.collapsible"
        type="button"
        class="app-filter-toggle-pill"
        :class="{ 'is-active': props.activeCount > 0 || isExpanded }"
        :aria-expanded="isExpanded"
        @click="toggleExpanded"
      >
        <VIcon :icon="isExpanded ? 'mdi-chevron-up' : 'mdi-filter-variant'" size="14" />
        <span>{{ isExpanded ? t('common.collapse') : t('common.filter') }}</span>
        <span v-if="!isExpanded && props.activeCount > 0" class="app-filter-toggle-pill__count num">
          {{ props.activeCount }}
        </span>
      </button>
    </div>

    <div v-if="$slots.default" class="app-filter-collapsible" :class="{ 'is-expanded': isExpanded }">
      <div class="app-filter-collapsible__inner">
        <slot />
      </div>
    </div>
  </div>
</template>
