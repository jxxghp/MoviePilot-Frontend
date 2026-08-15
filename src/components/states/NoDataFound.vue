<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

const props = defineProps<Props>()

interface Props {
  errorCode?: string
  errorTitle?: string
  errorDescription?: string
  icon?: string
  iconColor?: string
}

// 逐字符渲染错误码，"0" 替换为旋转的胶卷盘
const codeChars = computed(() => (props.errorCode || '404').split(''))
</script>

<template>
  <div class="no-data-container">
    <!-- 错误码 -->
    <div class="code-wrapper" role="img" :aria-label="props.errorCode || '404'">
      <span class="code-glow" aria-hidden="true" />

      <template v-for="(char, index) in codeChars" :key="index">
        <!-- 胶卷盘替代 "0" -->
        <span v-if="char === '0'" class="reel-holder" aria-hidden="true">
          <svg class="reel" viewBox="0 0 200 200" fill="none">
            <!-- 盘缘 -->
            <circle cx="100" cy="100" r="88" class="reel-rim" />
            <!-- 盘面 6 个镂孔，围绕中心均匀分布 -->
            <g class="reel-holes">
              <circle cx="148" cy="100" r="18" />
              <circle cx="124" cy="141.6" r="18" />
              <circle cx="76" cy="141.6" r="18" />
              <circle cx="52" cy="100" r="18" />
              <circle cx="76" cy="58.4" r="18" />
              <circle cx="124" cy="58.4" r="18" />
            </g>
            <!-- 中心轴孔 -->
            <circle cx="100" cy="100" r="11" class="reel-hub" />
          </svg>
        </span>

        <!-- 普通数字 -->
        <span v-else class="code-digit" aria-hidden="true">{{ char }}</span>
      </template>

      <!-- 漂浮的胶片帧装饰 -->
      <span class="film-chip chip-a" aria-hidden="true" />
      <span class="film-chip chip-b" aria-hidden="true" />
      <span class="film-chip chip-c" aria-hidden="true" />
    </div>

    <!-- 标题 -->
    <div class="error-title">
      {{ props.errorTitle || t('common.noData') }}
    </div>

    <!-- 描述 -->
    <div class="error-description">
      {{ props.errorDescription || t('common.noContent') }}
    </div>

    <!-- 按钮插槽 -->
    <div class="actions-container">
      <slot name="button" />
    </div>
  </div>
</template>

<style scoped>
.no-data-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  inline-size: 100%;
  min-block-size: 300px;
  padding-block-start: 3rem;
  text-align: center;
  animation: rise-in 0.6s ease both;
}

/* ---------- 错误码 ---------- */
.code-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.06em;
  margin-block: 0 1.5rem;
  font-size: clamp(5rem, 16vw, 9rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.02em;
}

.code-digit {
  background: linear-gradient(175deg, rgba(var(--v-theme-primary), 1) 12%, rgba(var(--v-theme-primary), 0.45) 100%);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  text-shadow: none;
}

/* 背景柔光 */
.code-glow {
  position: absolute;
  inset: -30% -10%;
  z-index: -1;
  background: radial-gradient(closest-side, rgba(var(--v-theme-primary), 0.16), transparent 70%);
  animation: breathe 5s ease-in-out infinite;
}

/* ---------- 胶卷盘 ---------- */
.reel-holder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  block-size: 0.92em;
  inline-size: 0.92em;
  margin-inline: 0.06em;
}

.reel {
  block-size: 100%;
  inline-size: 100%;
  animation: reel-spin 24s linear infinite;
}

.reel-rim {
  fill: rgba(var(--v-theme-primary), 0.08);
  stroke: rgba(var(--v-theme-primary), 0.9);
  stroke-width: 9;
}

/* 盘面 6 个镂孔：仅用描边，孔内透出背景色 */
.reel-holes circle {
  stroke: rgba(var(--v-theme-on-surface), 0.5);
  stroke-width: 4;
}

.reel-hub {
  fill: rgba(var(--v-theme-primary), 0.95);
}

/* ---------- 漂浮胶片帧 ---------- */
.film-chip {
  position: absolute;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 4px;
  /* 上下齿孔用重复渐变模拟 */
  background-image:
    repeating-linear-gradient(90deg, transparent 0 6px, rgba(var(--v-theme-on-surface), 0.22) 6px 10px);
  background-position: center top 3px;
  background-repeat: repeat-x;
  background-size: 100% 3px;
  block-size: 14px;
  inline-size: 34px;
  opacity: 0.7;
}

.chip-a {
  inset-block-start: -8%;
  inset-inline-start: 6%;
  rotate: -18deg;
  animation: drift 6s ease-in-out infinite;
}

.chip-b {
  inset-block-end: -6%;
  inset-inline-end: 4%;
  rotate: 14deg;
  animation: drift 7s ease-in-out 1.2s infinite;
}

.chip-c {
  inset-block-start: 12%;
  inset-inline-end: -6%;
  rotate: 26deg;
  animation: drift 8s ease-in-out 2.4s infinite;
}

/* ---------- 文字 ---------- */
.error-title {
  position: relative;
  color: rgba(var(--v-theme-on-surface), 0.95);
  font-size: 1.5rem;
  font-weight: 500;
  margin-block-end: 0.75rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 5%);
}

.error-title::after {
  display: block;
  border-radius: 3px;
  background: linear-gradient(90deg, rgba(var(--v-theme-primary), 0.8), rgba(var(--v-theme-primary), 0.2));
  block-size: 3px;
  content: '';
  inline-size: 60px;
  margin-block-start: 0.5rem;
  margin-inline: auto;
}

.error-description {
  color: rgba(var(--v-theme-on-surface), 0.75);
  font-size: 1rem;
  margin-block-end: 1rem;
  margin-inline: auto;
  max-inline-size: 80%;
}

/* ---------- 动画 ---------- */
@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes breathe {

  0%,
  100% {
    opacity: 0.7;
    transform: scale(1);
  }

  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@keyframes reel-spin {
  to {
    rotate: 360deg;
  }
}

@keyframes drift {

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .no-data-container,
  .code-glow,
  .reel,
  .film-chip {
    animation: none;
  }
}
</style>
