<script lang="ts" setup>
import type { CustomRule } from '@/api/types'
import filter_svg from '@images/svg/filter.svg'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useCardAccentColor } from '@/composables/useCardAccentColor'

const CustomRuleInfoDialog = defineAsyncComponent(() => import('@/components/dialog/CustomRuleInfoDialog.vue'))
const { accentRgb, imageRef, updateAccentColor } = useCardAccentColor('#8A8D93')

// 输入参数
const props = defineProps({
  // 单条规则
  rule: {
    type: Object as PropType<CustomRule>,
    required: true,
  },
  // 所有规则
  rules: {
    type: Array as PropType<CustomRule[]>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'change', 'done'])

/** 打开共享自定义规则配置弹窗。 */
function openRuleInfoDialog() {
  openSharedDialog(
    CustomRuleInfoDialog,
    {
      rule: props.rule,
      rules: props.rules,
    },
    {
      change: (...args: unknown[]) => emit('change', ...args),
      done: () => emit('done'),
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 关闭自定义规则卡片。 */
function onClose() {
  emit('close')
}
</script>

<template>
  <VCard
    variant="tonal"
    class="app-card-shell app-card-colorful"
    :style="{ '--app-card-accent-rgb': accentRgb }"
    @click="openRuleInfoDialog"
  >
    <span class="app-card-top-action absolute top-3 right-12">
      <IconBtn @click.stop>
        <VIcon class="cursor-move" icon="mdi-drag" />
      </IconBtn>
    </span>
    <VDialogCloseBtn @click="onClose" />
    <VCardText class="app-card-summary app-card-summary--double-action app-card-summary--title-subtitle">
      <div class="app-card-summary__content">
        <h5 class="app-card-summary__title text-h6">{{ props.rule.name }}</h5>
        <div class="app-card-summary__subtitle text-body-1">{{ props.rule.id }}</div>
      </div>
      <div class="app-card-summary__media" aria-hidden="true">
        <VImg ref="imageRef" :src="filter_svg" contain class="app-card-summary__image" @load="updateAccentColor" />
      </div>
    </VCardText>
  </VCard>
</template>
