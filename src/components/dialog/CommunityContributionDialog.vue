<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CommunityProfile } from '@/composables/useCommunityContribution'
import { COMMUNITY_BADGE_AREAS, COMMUNITY_BADGE_IMAGES } from '@/utils/communityBadge'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    profile: CommunityProfile
    loading?: boolean
    failed?: boolean
    showAvatarBadge?: boolean
  }>(),
  { modelValue: true, loading: false, failed: false, showAvatarBadge: false },
)
const emit = defineEmits<{
  close: []
  'update:modelValue': [value: boolean]
  refresh: []
  'update:showAvatarBadge': [value: boolean]
}>()
const { t, locale } = useI18n()
const recordsExpanded = ref(false)
const rulesExpanded = ref(false)
const area = computed(() => COMMUNITY_BADGE_AREAS[props.profile.specialty ?? 'ecosystem'])
const badge = computed(() => COMMUNITY_BADGE_IMAGES[props.profile.tier ?? 'bronze'])
const title = computed(() =>
  t('community.honor', {
    tier: t('community.tiers.' + props.profile.tier),
    specialty: t('community.specialties.' + props.profile.specialty),
  }),
)
const groups = computed(() => {
  const summary = new Map<string, { area: string; total: number }>()
  for (const item of props.profile.repositories) {
    const entry = summary.get(item.area) ?? { area: item.area, total: 0 }
    entry.total += Math.max(item.commits, item.merged_prs)
    summary.set(item.area, entry)
  }
  return [...summary.values()]
})
const checkedAt = computed(() =>
  props.profile.checked_at
    ? new Date(props.profile.checked_at * 1000).toLocaleString(locale.value, { dateStyle: 'short', timeStyle: 'short' })
    : '',
)
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 关闭共享浮层，同时支持关闭按钮、Escape 和点击遮罩。 */
function close() {
  visible.value = false
}

/** 只构造白名单仓库和已验证账号的 GitHub 链接，不信任外部任意 URL。 */
function evidenceUrl(repository: string, kind: 'commits' | 'prs') {
  const base = 'https://github.com/jxxghp/' + encodeURIComponent(repository)
  const login = encodeURIComponent(props.profile.login ?? '')
  return kind === 'commits'
    ? base + '/commits?author=' + login
    : base + '/pulls?q=' + encodeURIComponent('is:pr is:merged author:' + (props.profile.login ?? ''))
}
</script>

<template>
  <VDialog
    v-model="visible"
    class="community-contribution-dialog"
    content-class="community-contribution-dialog__content"
    :max-width="440"
    :aria-label="t('community.title')"
    scrollable
  >
    <VCard class="community-contribution-card">
      <div class="community-contribution-card__header">
        <h2 class="text-h6">{{ t('community.title') }}</h2>
        <VBtn icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="close" />
      </div>
      <VCardText class="community-contribution-card__body">
        <VAlert v-if="failed || profile.stale" type="warning" variant="tonal" density="compact" class="mb-3">
          {{ t('community.stale') }}
        </VAlert>

        <div class="community-contribution-card__hero">
          <div class="community-contribution-card__medal">
            <img :src="badge" :alt="title" class="community-contribution-card__logo" />
            <VAvatar :color="area.color" variant="tonal" size="38" class="community-contribution-card__emblem">
              <VIcon :icon="area.icon" size="22" />
            </VAvatar>
          </div>
          <h3 class="text-h6">{{ t('community.thanks') }}</h3>
          <a
            :href="'https://github.com/' + encodeURIComponent(profile.login ?? '')"
            target="_blank"
            rel="noopener noreferrer"
            class="community-contribution-card__identity"
          >
            <VIcon icon="mdi-github" size="20" />
            <span>@{{ profile.login }}</span>
          </a>
          <div class="community-contribution-card__honor" :data-tier="profile.tier">{{ title }}</div>
        </div>

        <VDivider class="my-5" />
        <h3 class="text-subtitle-1 font-weight-bold mb-2">{{ t('community.yourContributions') }}</h3>
        <div v-for="group in groups" :key="group.area" class="community-contribution-card__summary">
          <VIcon
            :icon="COMMUNITY_BADGE_AREAS[group.area as keyof typeof COMMUNITY_BADGE_AREAS].icon"
            size="21"
            color="primary"
          />
          <span>{{ t('community.areas.' + group.area) }}</span>
          <strong>{{ group.total.toLocaleString(locale) }}</strong>
        </div>
        <div class="text-caption text-medium-emphasis mt-2">{{ t('community.evidenceHint') }}</div>

        <VBtn
          color="primary"
          block
          class="mt-5"
          :append-icon="recordsExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          :aria-expanded="recordsExpanded"
          @click="recordsExpanded = !recordsExpanded"
        >
          {{ t('community.viewRecords') }}
        </VBtn>
        <VExpandTransition>
          <div v-if="recordsExpanded" class="community-contribution-card__records">
            <div
              v-for="item in profile.repositories"
              :key="item.repository"
              class="community-contribution-card__record"
            >
              <div class="text-body-2 font-weight-medium">{{ item.repository }}</div>
              <div class="d-flex flex-wrap ga-3 mt-1">
                <a :href="evidenceUrl(item.repository, 'prs')" target="_blank" rel="noopener noreferrer"
                  >{{ t('community.mergedPrs', { count: item.merged_prs }) }} <VIcon icon="mdi-open-in-new" size="13"
                /></a>
                <a :href="evidenceUrl(item.repository, 'commits')" target="_blank" rel="noopener noreferrer"
                  >{{ t('community.commits', { count: item.commits }) }} <VIcon icon="mdi-open-in-new" size="13"
                /></a>
              </div>
            </div>
          </div>
        </VExpandTransition>

        <div class="d-flex justify-center mt-2">
          <VBtn
            variant="text"
            color="primary"
            size="small"
            :aria-expanded="rulesExpanded"
            @click="rulesExpanded = !rulesExpanded"
            >{{ t('community.rules') }}</VBtn
          >
        </div>
        <VExpandTransition>
          <div v-if="rulesExpanded" class="community-contribution-card__rules text-body-2">
            <p>{{ t('community.rulesMethod') }}</p>
            <div
              v-for="(tier, index) in ['bronze', 'silver', 'gold', 'core'] as const"
              :key="tier"
              class="community-contribution-card__tier"
            >
              <img :src="COMMUNITY_BADGE_IMAGES[tier]" alt="" width="36" height="36" />
              <span>{{ t('community.tiers.' + tier) }}</span>
              <span class="text-medium-emphasis">{{ [1, 10, 50, 200][index] }}+</span>
            </div>
            <p class="text-caption text-medium-emphasis mt-3">{{ t('community.rulesScope') }}</p>
          </div>
        </VExpandTransition>

        <VDivider class="my-4" />
        <VSwitch
          :model-value="showAvatarBadge"
          :label="t('community.showAvatarBadge')"
          color="primary"
          density="compact"
          hide-details
          @update:model-value="emit('update:showAvatarBadge', !!$event)"
        />
        <div class="community-contribution-card__footer">
          <span class="text-caption text-medium-emphasis">{{ t('community.updated', { time: checkedAt }) }}</span>
          <VBtn variant="text" size="small" :loading="loading" prepend-icon="mdi-refresh" @click="emit('refresh')">{{
            t('community.refresh')
          }}</VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.v-dialog.community-contribution-dialog {
  justify-content: flex-end;
}

.community-contribution-dialog > .v-overlay__content.community-contribution-dialog__content {
  align-self: flex-start;
  margin-block: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-bottom));
  margin-inline: auto max(16px, env(safe-area-inset-right));
  max-block-size: calc(100dvh - 32px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
}

.community-contribution-card {
  color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface));
  border: var(--app-overlay-border);
  border-radius: var(--app-overlay-radius) !important;
  box-shadow: var(--app-overlay-shadow) !important;

  &__header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    padding-block: 16px 8px;
    padding-inline: 24px 16px;
  }

  &__body {
    padding-block: 0 16px !important;
    padding-inline: 24px !important;
  }
  &__hero {
    text-align: center;
  }
  &__hero h3 {
    text-wrap: balance;
  }
  &__medal {
    position: relative;
    inline-size: 232px;
    max-inline-size: 100%;
    margin-inline: auto;
  }
  &__logo {
    display: block;
    inline-size: 100%;
    aspect-ratio: 1;
    object-fit: contain;
  }
  &__emblem {
    position: absolute;
    inset-inline-end: 12px;
    inset-block-end: 20px;
    border: var(--app-overlay-border);
  }
  &__identity {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-block-start: 12px;
    inline-size: fit-content;
    max-inline-size: 100%;
    margin-inline: auto;
    color: inherit;
    overflow-wrap: anywhere;
  }
  // 金属色属于勋章等级，界面本身的表面、文字混色和圆角仍取全局主题 Token。
  &__honor {
    --community-metal: 224, 187, 107;

    display: table;
    max-inline-size: 100%;
    margin-block-start: 12px;
    margin-inline: auto;
    padding-block: 3px;
    padding-inline: 18px;
    border: 1px solid rgba(var(--community-metal), 0.6);
    border-radius: var(--app-control-radius);
    background:
      linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.22),
        transparent 34%,
        rgba(0, 0, 0, 0.12) 70%,
        rgba(255, 255, 255, 0.07)
      ),
      linear-gradient(
        115deg,
        rgba(var(--community-metal), 0.3),
        rgba(var(--community-metal), 0.1) 48%,
        rgba(var(--community-metal), 0.24)
      );
    color: color-mix(in srgb, rgb(var(--v-theme-on-surface)) 62%, rgb(var(--community-metal)));
    font-size: 0.8125rem;
    font-weight: 650;
    letter-spacing: 0.025em;
    line-height: 1.6;
    text-wrap: balance;

    &[data-tier='bronze'] {
      --community-metal: 205, 146, 104;
    }
    &[data-tier='silver'] {
      --community-metal: 181, 198, 214;
    }
    &[data-tier='core'] {
      --community-metal: 198, 187, 223;
    }
  }
  &__summary {
    display: flex;
    align-items: center;
    gap: 12px;
    min-block-size: 44px;
    border-block-end: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
  &__summary strong {
    margin-inline-start: auto;
    font-size: 1.125rem;
  }
  &__records,
  &__rules {
    margin-block-start: 12px;
  }
  &__record {
    padding-block: 12px;
    overflow-wrap: anywhere;
    border-block-end: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
  &__record a {
    color: rgb(var(--v-theme-primary));
    font-size: 0.8125rem;
  }
  &__tier {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-block: 4px;
  }
  &__tier > :last-child {
    margin-inline-start: auto;
  }
  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 8px;
  }

  @media (width <= 600px) {
    &__header {
      padding-inline: 20px 12px;
    }
    &__body {
      padding-inline: 20px !important;
    }
    &__medal {
      inline-size: 192px;
    }
  }
}
@media (width <= 600px) {
  .community-contribution-dialog > .v-overlay__content.community-contribution-dialog__content {
    inline-size: calc(100% - 24px);
    margin-inline: max(12px, env(safe-area-inset-left)) max(12px, env(safe-area-inset-right));
    margin-block: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-bottom));
    max-block-size: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }
}
</style>
