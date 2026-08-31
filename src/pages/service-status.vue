<script setup lang="ts">
import ThemeLogoMark from '@/components/misc/ThemeLogoMark.vue'
import router from '@/router'
import { getInitializationState } from '@/utils/initialization'
import { useTheme } from 'vuetify'

const SERVICE_STATUS_RETRY_MS = 1500

const { t } = useI18n()
const theme = useTheme()
const themeClass = computed(() => 'service-status-page--' + theme.global.name.value)
let retryTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false

/** 轮询后端初始化状态；首次连通后再根据明确结果进入登录或初始化页面。 */
async function checkServiceStatus() {
  try {
    const initialized = await getInitializationState(true)
    if (disposed) return
    await router.replace(initialized ? '/login' : '/initialize')
  } catch {
    if (disposed) return
    retryTimer = setTimeout(() => {
      void checkServiceStatus()
    }, SERVICE_STATUS_RETRY_MS)
  }
}

onMounted(() => {
  void checkServiceStatus()
})

onBeforeUnmount(() => {
  disposed = true
  if (retryTimer) clearTimeout(retryTimer)
})
</script>

<template>
  <main class="service-status-page" :class="themeClass">
    <div class="service-status-page__ambient service-status-page__ambient--one" aria-hidden="true" />
    <div class="service-status-page__ambient service-status-page__ambient--two" aria-hidden="true" />

    <section class="service-status-shell" aria-labelledby="service-status-title">
      <VCard class="service-status-card" elevation="0">
        <div class="service-status-card__topline" aria-hidden="true" />
        <div class="service-status-brand-mark">
          <ThemeLogoMark class="service-status-brand-logo" decorative />
        </div>

        <div class="service-status-kicker">{{ t('serviceStatus.kicker') }}</div>
        <h1 id="service-status-title" class="service-status-title">{{ t('serviceStatus.title') }}</h1>
        <p class="service-status-subtitle">{{ t('serviceStatus.subtitle') }}</p>

        <div class="service-status-progress" role="status" aria-live="polite">
          <VProgressCircular indeterminate color="primary" :size="22" :width="2" />
          <span>{{ t('serviceStatus.checking') }}</span>
        </div>

        <div class="service-status-hint">
          <VIcon icon="mdi-information-outline" size="16" />
          <span>{{ t('serviceStatus.automatic') }}</span>
        </div>
      </VCard>
      <p class="service-status-copyright">MoviePilot · {{ new Date().getFullYear() }}</p>
    </section>
  </main>
</template>

<style lang="scss" scoped>
.service-status-page {
  --service-status-surface: rgba(var(--v-theme-surface), 0.94);
  --service-status-border: rgba(var(--v-theme-on-surface), 0.1);
  position: relative;
  display: grid;
  min-block-size: 100dvh;
  overflow: hidden;
  background: rgb(var(--v-theme-background));
  color: rgb(var(--v-theme-on-background));
  isolation: isolate;
  place-items: center;
}

.service-status-page__ambient {
  position: absolute;
  z-index: -1;
  border-radius: 999px;
  pointer-events: none;
}

.service-status-page__ambient--one {
  inset-block-start: -18rem;
  inset-inline-start: -14rem;
  inline-size: 38rem;
  block-size: 38rem;
  background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.2), transparent 68%);
}

.service-status-page__ambient--two {
  inset-inline-end: -12rem;
  inset-block-end: -24rem;
  inline-size: 42rem;
  block-size: 42rem;
  background: radial-gradient(circle, rgba(var(--v-theme-info), 0.16), transparent 66%);
}

.service-status-shell {
  inline-size: min(92vw, 31rem);
  text-align: center;
}

.service-status-card {
  position: relative;
  overflow: hidden;
  padding: clamp(2rem, 7vw, 3.5rem);
  border: 1px solid var(--service-status-border);
  border-radius: 1.5rem;
  background: var(--service-status-surface);
  box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(20px);
}

.service-status-card__topline {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 15%;
  block-size: 2px;
  background: linear-gradient(90deg, transparent, rgb(var(--v-theme-primary)), transparent);
}

.service-status-brand-mark {
  display: inline-grid;
  inline-size: 5rem;
  block-size: 5rem;
  margin-block-end: 1.5rem;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 1.4rem;
  background: rgba(var(--v-theme-primary), 0.08);
  place-items: center;
}

.service-status-brand-logo {
  font-size: 1.15rem;
}

.service-status-kicker {
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.service-status-title {
  margin-block: 0.65rem 0.8rem;
  font-size: clamp(1.65rem, 5vw, 2.15rem);
  font-weight: 700;
  letter-spacing: -0.035em;
}

.service-status-subtitle {
  max-inline-size: 24rem;
  margin: 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.95rem;
  line-height: 1.7;
}

.service-status-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  margin-block-start: 2rem;
  color: rgba(var(--v-theme-on-surface), 0.86);
  font-size: 0.9rem;
  font-weight: 600;
}

.service-status-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  margin-block-start: 1.25rem;
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 0.78rem;
}

.service-status-copyright {
  margin-block-start: 1.25rem;
  color: rgba(var(--v-theme-on-background), 0.4);
  font-size: 0.75rem;
}

@media (max-width: 480px) {
  .service-status-card {
    padding-inline: 1.5rem;
  }

  .service-status-hint {
    align-items: flex-start;
  }
}
</style>
