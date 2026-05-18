<script lang="ts" setup>
import type { CustomRule, FilterRuleGroup } from '@/api/types'
import filter_group_svg from '@images/svg/filter-group.svg'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useCardAccentColor } from '@/composables/useCardAccentColor'

const FilterRuleGroupInfoDialog = defineAsyncComponent(() => import('@/components/dialog/FilterRuleGroupInfoDialog.vue'))

// 获取i18n实例
const { t } = useI18n()
const { accentRgb, imageRef, updateAccentColor } = useCardAccentColor('#8A8D93')

// 输入参数
const props = defineProps({
  // 单个规则组
  group: {
    type: Object as PropType<FilterRuleGroup>,
    required: true,
  },
  // 所有规则组
  groups: {
    type: Array as PropType<FilterRuleGroup[]>,
    required: true,
  },
  // 媒体类型字典
  categories: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
  // 自定义规则列表
  custom_rules: Array as PropType<CustomRule[]>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'change', 'done'])

/** 打开共享过滤规则组配置弹窗。 */
function openGroupInfoDialog() {
  openSharedDialog(
    FilterRuleGroupInfoDialog,
    {
      group: props.group,
      groups: props.groups,
      categories: props.categories,
      custom_rules: props.custom_rules,
    },
    {
      change: (...args: unknown[]) => emit('change', ...args),
      done: () => emit('done'),
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 关闭过滤规则组卡片。 */
function onClose() {
  emit('close')
}
</script>

<template>
  <VCard
    variant="tonal"
    class="app-card-shell app-card-colorful"
    :style="{ '--app-card-accent-rgb': accentRgb }"
    @click="openGroupInfoDialog"
  >
    <span class="app-card-top-action absolute top-3 right-12">
      <IconBtn @click.stop>
        <VIcon class="cursor-move" icon="mdi-drag" />
      </IconBtn>
    </span>
    <VDialogCloseBtn @click="onClose" />
    <VCardText class="app-card-summary app-card-summary--double-action app-card-summary--title-subtitle">
      <div class="app-card-summary__content">
        <h5 class="app-card-summary__title text-h6">{{ props.group.name }}</h5>
        <div class="app-card-summary__subtitle text-body-1">
          <span v-if="!props.group.category">{{ props.group.media_type || t('common.all') }}</span>
          <span v-else>{{ props.group.category }}</span>
        </div>
      </div>
      <div class="app-card-summary__media" aria-hidden="true">
        <VImg ref="imageRef" :src="filter_group_svg" contain class="app-card-summary__image" @load="updateAccentColor" />
      </div>
    </VCardText>
  </VCard>
</template>
