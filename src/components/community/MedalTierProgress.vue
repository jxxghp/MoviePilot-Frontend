<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MEDAL_TIERS, tierProgress, type CommunityMedalRecord } from '@/utils/communityMedals'

/**
 * 阶梯勋章的档位进度：一条横向轨道上四个节点（初光、共建、卓越、核心与各自门槛），已达到的点亮，
 * 当前档加强；当前档到下一档之间按实际数值画出进度，并说明距下一档还差多少，到核心时说明已达最高档。
 */
const props = defineProps<{ record: CommunityMedalRecord }>()
const { t, locale } = useI18n()
const progress = computed(() => tierProgress(props.record))
const unit = computed(() => (props.record.key === 'code' ? 'contributions' : 'installs'))

/**
 * 数量的写法：中文按“万”简写（2.1 万），不足一万写原数，后面带一个空格与量词隔开（12 次）；
 * 其他语言用紧凑记法（21K）。
 */
function amount(value: number): string {
  if (locale.value.startsWith('zh')) {
    if (value < 10000) return value.toLocaleString(locale.value) + ' '
    const tenThousands = value / 10000
    return (tenThousands >= 100 ? Math.round(tenThousands) : Math.round(tenThousands * 10) / 10) + ' 万'
  }
  return new Intl.NumberFormat(locale.value, { notation: value >= 10000 ? 'compact' : 'standard' }).format(value)
}

const status = computed(() => {
  const value = progress.value
  if (!value) return ''
  if (!value.next) return t('community.progress.top')
  if (value.remaining === null) return ''
  return t('community.progress.' + unit.value, {
    tier: t('community.tiers.' + value.next),
    amount: amount(value.remaining),
  })
})

/** 进度线：节点等距排开，已达档之间全亮，当前档到下一档按比例亮。 */
const fill = computed(() => {
  const value = progress.value
  if (!value || value.tier === 0) return 0
  const segments = MEDAL_TIERS.length - 1
  return Math.min(1, (value.tier - 1 + (value.next ? value.fraction : 0)) / segments)
})
</script>

<template>
  <div v-if="progress" class="medal-tier-progress">
    <div class="medal-tier-progress__track" :style="{ '--fill': fill }">
      <div
        v-for="tier in MEDAL_TIERS"
        :key="tier"
        class="medal-tier-progress__node"
        :class="{ 'is-reached': progress.tier >= tier, 'is-current': progress.tier === tier }"
        :aria-current="progress.tier === tier ? 'step' : undefined"
      >
        <span class="medal-tier-progress__dot" />
        <span class="medal-tier-progress__name">{{ t('community.tiers.' + tier) }}</span>
        <span class="medal-tier-progress__threshold">{{ t('community.thresholds.' + record.key + '.' + tier) }}</span>
      </div>
    </div>
    <p v-if="status" class="medal-tier-progress__status">{{ status }}</p>
  </div>
</template>

<style lang="scss" scoped>
.medal-tier-progress {
  display: grid;
  gap: 12px;

  &__track {
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));

    // 底线与进度线从第一个节点中心画到最后一个节点中心。
    &::before,
    &::after {
      position: absolute;
      block-size: 2px;
      border-radius: 1px;
      content: '';
      inset-block-start: 6px;
      inset-inline-start: 12.5%;
    }

    &::before {
      background: rgba(var(--v-theme-on-surface), 0.14);
      inline-size: 75%;
    }

    &::after {
      background: rgb(var(--v-theme-primary));
      inline-size: calc(75% * var(--fill));
    }
  }

  &__node {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 2px;
    justify-items: center;
    min-inline-size: 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-align: center;

    &.is-reached {
      color: rgb(var(--v-theme-on-surface));
    }
  }

  &__dot {
    box-sizing: border-box;
    inline-size: 14px;
    block-size: 14px;
    margin-block-end: 6px;
    border: 2px solid rgba(var(--v-theme-on-surface), 0.28);
    border-radius: 50%;
    background: rgb(var(--v-theme-surface));

    .is-reached & {
      border-color: rgb(var(--v-theme-primary));
      background: rgb(var(--v-theme-primary));
    }

    .is-current & {
      box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.22);
    }
  }

  &__name {
    font-size: 0.875rem;
    line-height: 1.3;

    .is-current & {
      font-weight: 700;
    }
  }

  &__threshold {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    opacity: 0.8;
  }

  &__status {
    margin: 0;
    font-size: 0.875rem;
    text-align: center;
  }
}
</style>
