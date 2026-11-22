<script lang="ts" setup>
import type { CustomRule } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

const CustomRuleInfoDialog = defineAsyncComponent(() => import('@/components/dialog/CustomRuleInfoDialog.vue'))

const { t } = useI18n()

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

// 提炼规则中已生效的筛选条件摘要，便于在卡片网格中快速区分规则用途。
const conditionTags = computed(() => {
  const tags: Array<{ key: string; icon: string; label: string; title: string }> = []
  if (props.rule.include) {
    tags.push({
      key: 'include',
      icon: 'mdi-plus-circle-outline',
      label: t('customRule.field.include'),
      title: `${t('customRule.field.include')}: ${props.rule.include}`,
    })
  }
  if (props.rule.exclude) {
    tags.push({
      key: 'exclude',
      icon: 'mdi-minus-circle-outline',
      label: t('customRule.field.exclude'),
      title: `${t('customRule.field.exclude')}: ${props.rule.exclude}`,
    })
  }
  if (props.rule.size_range) {
    tags.push({
      key: 'size',
      icon: 'mdi-harddisk',
      label: props.rule.size_range,
      title: `${t('customRule.field.sizeRange')}: ${props.rule.size_range}`,
    })
  }
  if (props.rule.seeders) {
    tags.push({
      key: 'seeders',
      icon: 'mdi-upload-outline',
      label: props.rule.seeders,
      title: `${t('customRule.field.seeders')}: ${props.rule.seeders}`,
    })
  }
  if (props.rule.publish_time) {
    tags.push({
      key: 'publish_time',
      icon: 'mdi-clock-outline',
      label: props.rule.publish_time,
      title: `${t('customRule.field.publishTime')}: ${props.rule.publish_time}`,
    })
  }
  return tags
})

const visibleTags = computed(() => conditionTags.value.slice(0, 2))
const overflowCount = computed(() => Math.max(0, conditionTags.value.length - 2))
</script>

<template>
  <VCard
    variant="flat"
    class="app-card-shell app-card-colorful mp-setting-card mp-setting-card--interactive"
    style="--app-card-accent-rgb: 99, 102, 241"
    @click="openRuleInfoDialog"
  >
    <div class="mp-setting-card__header">
      <div class="mp-setting-card__icon mp-setting-card__icon--tinted mp-setting-card__icon--sm" aria-hidden="true">
        <VIcon icon="mdi-filter-variant" size="20" />
      </div>
      <div class="mp-setting-card__heading">
        <div class="mp-setting-card__title-row">
          <span class="mp-setting-card__title" :title="props.rule.name">{{ props.rule.name }}</span>
        </div>
        <div class="mp-setting-card__subtitle">
          <span class="mp-setting-card__code" :title="props.rule.id">{{ props.rule.id }}</span>
        </div>
      </div>
      <div class="mp-setting-card__actions">
        <IconBtn class="mp-setting-card__action cursor-move" :aria-label="t('settingCard.dragSort')" @click.stop>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
        <VDialogCloseBtn inner-class="mp-setting-card__action mp-setting-card__action--danger" @click="onClose" />
      </div>
    </div>

    <div class="mp-setting-card__dock">
      <div v-if="visibleTags.length > 0" class="mp-setting-card__chips">
        <span v-for="tag in visibleTags" :key="tag.key" class="mp-setting-card__chip" :title="tag.title">
          <VIcon :icon="tag.icon" size="12" class="shrink-0" />
          <span>{{ tag.label }}</span>
        </span>
        <span v-if="overflowCount > 0" class="mp-setting-card__chip num">
          <span>{{ `+${overflowCount}` }}</span>
        </span>
      </div>
      <span v-else class="mp-setting-card__muted">{{ t('settingCard.noConditions') }}</span>
      <VIcon class="mp-setting-card__chevron" icon="mdi-chevron-right" size="16" />
    </div>
  </VCard>
</template>
