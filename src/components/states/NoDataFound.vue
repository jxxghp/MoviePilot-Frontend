<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import page404 from '@images/pages/404.svg'

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
</script>

<template>
  <div class="no-data-container">
    <!-- 图标容器 -->
    <div class="icon-wrapper">
      <img :src="page404" alt="404" />
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
}

/* 图标样式 */
.icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  inline-size: 15rem;
  margin-block: 0 1rem;
  margin-inline: auto;
}

/* 文字样式 */
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
  margin-inline: auto;
}

.error-description {
  color: rgba(var(--v-theme-on-surface), 0.75);
  font-size: 1rem;
  margin-block-end: 1rem;
  margin-inline: auto;
  max-inline-size: 80%;
}
</style>
