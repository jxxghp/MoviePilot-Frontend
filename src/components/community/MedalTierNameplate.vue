<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MedalTier } from '@/utils/communityMedals'

/** 小尺寸等级铭牌：以细金属边和轻微拉丝区分四档，作为勋章下方的辅助文字。 */
withDefaults(defineProps<{ tier: MedalTier; compact?: boolean }>(), { compact: false })
const { t } = useI18n()
</script>

<template>
  <span class="medal-tier-nameplate" :class="['medal-tier-nameplate--' + tier, { 'is-compact': compact }]">
    <slot>{{ t('community.tiers.' + tier) }}</slot>
  </span>
</template>

<style lang="scss" scoped>
.medal-tier-nameplate {
  // 四档只改变金属色；底色随主题融合，不用外发光和动画抢走勋章的视觉重心。
  --plate-metal: #bd926c;
  --plate-ink: #cfad8e;
  --plate-light-ink: #785333;

  display: inline-block;
  max-inline-size: 100%;
  padding: 1px 7px;
  border: 1px solid color-mix(in srgb, var(--plate-metal) 38%, transparent);
  border-radius: 3px;
  background:
    linear-gradient(115deg, transparent 15%, rgb(255 255 255 / 5%) 45%, transparent 70%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--plate-metal) 12%, rgb(var(--v-theme-surface))),
      color-mix(in srgb, var(--plate-metal) 4%, rgb(var(--v-theme-surface)))
    );
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 6%);
  color: var(--plate-ink);
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.035em;
  line-height: 1.5;
  overflow-wrap: anywhere;
  text-align: center;
  text-wrap: balance;
  vertical-align: middle;

  &--2 {
    --plate-metal: #a6b6c8;
    --plate-ink: #bcc9d8;
    --plate-light-ink: #536579;
  }

  &--3 {
    --plate-metal: #c6a45d;
    --plate-ink: #d7bc81;
    --plate-light-ink: #7d6129;
  }

  &--4 {
    --plate-metal: #bda16e;
    --plate-ink: #dfcba1;
    --plate-light-ink: #6d5835;

    background:
      linear-gradient(115deg, transparent 15%, rgb(255 255 255 / 4%) 45%, transparent 70%),
      color-mix(in srgb, #151719 12%, rgb(var(--v-theme-surface)));
    border-color: color-mix(in srgb, var(--plate-metal) 52%, transparent);
  }

  &.is-compact {
    padding-inline: 6px;
    font-size: 0.75rem;
  }

  [data-glass-color-scheme='light'] & {
    color: var(--plate-light-ink);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 55%);
  }

  @media (forced-colors: active) {
    border-color: CanvasText;
    background: Canvas;
    box-shadow: none;
    color: CanvasText;
  }
}
</style>
