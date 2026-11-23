<script lang="ts" setup>
// 定义输入参数
const props = defineProps({
  text: String,
})
</script>

<template>
  <div class="w-full text-center text-medium-emphasis text-sm flex flex-col items-center my-5">
    <div class="initial-loading-container">
      <div class="initial-loading-content" :class="{ 'initial-loading-content--with-text': Boolean(props.text) }">
        <div class="wave-loader">
          <div class="wave-dot"></div>
          <div class="wave-dot"></div>
          <div class="wave-dot"></div>
          <div class="wave-dot"></div>
        </div>
        <div class="initial-loading-text" v-if="props.text">{{ props.text }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 初始的加载状态 */
.initial-loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-block-size: 20vh;
}

.initial-loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.wave-loader {
  display: flex;
  align-items: center;
  block-size: 40px;
  gap: 6px;
}

.wave-dot {
  border-radius: 50%;
  animation: wave 1.5s ease-in-out infinite;
  background-color: rgb(var(--v-theme-primary));
  block-size: 8px;
  inline-size: 8px;
}

.wave-dot:nth-child(1) {
  animation-delay: 0s;
}

.wave-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.wave-dot:nth-child(3) {
  animation-delay: 0.4s;
}

.wave-dot:nth-child(4) {
  animation-delay: 0.6s;
}

@keyframes wave {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-15px);
  }
}

.initial-loading-text {
  color: var(--mp-primary-fg);
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 1px;
}
</style>

<style>
/* 仅在携带说明文案的独立加载态浮于玻璃壁纸之上时给予轻量静态阅读衬底，纯波浪点加载保持无框悬浮。 */
html[data-theme='glass'] .initial-loading-content--with-text {
  padding: 1rem 1.75rem;
  border: 1px solid var(--mp-reading-border);
  border-radius: var(--app-surface-radius);
  background: var(--mp-reading-surface);
}

html[data-theme='glass']
  :where(.v-card, .app-surface, .app-surface-static, .v-dialog)
  .initial-loading-content--with-text {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
</style>
