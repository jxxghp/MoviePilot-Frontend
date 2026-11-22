<script lang="ts" setup>
import { innerFilterRules } from '@/api/constants'
import type { CustomRule, FilterRuleGroup } from '@/api/types'
import { parseRuleCards } from '@/utils/filterRuleGroup'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

const FilterRuleGroupInfoDialog = defineAsyncComponent(
  () => import('@/components/dialog/FilterRuleGroupInfoDialog.vue'),
)

// 获取i18n实例
const { t } = useI18n()

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
    type: Object as PropType<Record<string, unknown>>,
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

// 按适用媒体类型区分规则组图标与强调色，便于同类规则组一眼分辨。
const groupTheme = computed(() => {
  switch (props.group.media_type) {
    case '电影':
      return { icon: 'mdi-movie-open-outline', accentRgb: '59, 130, 246' }
    case '电视剧':
      return { icon: 'mdi-television-classic', accentRgb: '20, 184, 166' }
    case '音乐':
      return { icon: 'mdi-music-note-outline', accentRgb: '236, 72, 153' }
    default:
      return { icon: 'mdi-layers-outline', accentRgb: '139, 92, 246' }
  }
})

const scopeLabel = computed(() => props.group.category || props.group.media_type || t('common.all'))

// 将规则 ID 映射为可读标题，构建规则组卡片底部的优先级与规则摘要。
const ruleTitleMap = computed(() => {
  const map = new Map<string, string>()
  innerFilterRules.forEach(item => map.set(item.value, item.title))
  props.custom_rules?.forEach(rule => map.set(rule.id, rule.name))
  return map
})

const ruleSummary = computed(() => {
  const raw = props.group.rule_string?.trim()
  if (!raw) return { tierCount: 0, previewRules: [] as string[], moreCount: 0 }

  const tiers = parseRuleCards(raw).filter(card => card.rules.length > 0)
  const firstTierRules = tiers[0]?.rules.map(id => ruleTitleMap.value.get(id) || id) || []
  const totalRuleCount = tiers.reduce((sum, card) => sum + card.rules.length, 0)
  const previewRules = firstTierRules.slice(0, 2)
  return {
    tierCount: tiers.length,
    previewRules,
    moreCount: Math.max(0, totalRuleCount - previewRules.length),
  }
})
</script>

<template>
  <VCard
    variant="flat"
    class="app-card-shell app-card-colorful mp-setting-card mp-setting-card--interactive"
    :style="{ '--app-card-accent-rgb': groupTheme.accentRgb }"
    @click="openGroupInfoDialog"
  >
    <div class="mp-setting-card__header">
      <div class="mp-setting-card__icon mp-setting-card__icon--tinted" aria-hidden="true">
        <VIcon :icon="groupTheme.icon" size="22" />
      </div>
      <div class="mp-setting-card__heading">
        <div class="mp-setting-card__title-row">
          <span class="mp-setting-card__title" :title="props.group.name">{{ props.group.name }}</span>
        </div>
        <div class="mp-setting-card__subtitle">
          <span class="mp-setting-card__badge mp-setting-card__badge--accent">{{ scopeLabel }}</span>
          <span v-if="ruleSummary.tierCount > 0" class="mp-setting-card__subtitle-text num">
            {{ t('settingCard.ruleTiers', { count: ruleSummary.tierCount }) }}
          </span>
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
      <div v-if="ruleSummary.previewRules.length > 0" class="mp-setting-card__chips">
        <span
          v-for="(label, idx) in ruleSummary.previewRules"
          :key="`${idx}-${label}`"
          class="mp-setting-card__chip"
          :title="label"
        >
          <span>{{ label }}</span>
        </span>
        <span v-if="ruleSummary.moreCount > 0" class="mp-setting-card__chip num">
          <span>{{ `+${ruleSummary.moreCount}` }}</span>
        </span>
      </div>
      <span v-else class="mp-setting-card__muted">{{ t('settingCard.emptyRules') }}</span>
      <VIcon class="mp-setting-card__chevron" icon="mdi-chevron-right" size="16" />
    </div>
  </VCard>
</template>
