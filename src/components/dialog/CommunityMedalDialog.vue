<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMediaQuery, usePreferredReducedMotion } from '@vueuse/core'
import VDialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import MedalDetailSheet from '@/components/community/MedalDetailSheet.vue'
import MedalEmblem from '@/components/community/MedalEmblem.vue'
import MedalStage from '@/components/community/MedalStage.vue'
import GithubTokenAuthDialog from '@/components/github/GithubTokenAuthDialog.vue'
import { useAgentPetSuspension } from '@/composables/useAgentPetSuspension'
import { useGithubTokenAuth } from '@/composables/useGithubTokenAuth'
import type { CommunityProfile } from '@/composables/useCommunityContribution'
import { medalArt } from '@/utils/communityMedalArt'
import { preloadMedalImages } from '@/utils/communityMedalEngrave'
import { composeShareImage, downloadBlob } from '@/utils/communityMedalShare'
import {
  MEDAL_CATALOG,
  MEDAL_KEYS,
  knownMedals,
  markMedalSeen,
  medalEngraving,
  medalMetaLine,
  medalName,
  medalSeenToken,
  medalTierLine,
  medalTimeLine,
  unseenMedalKeys,
  type CommunityMedalRecord,
  type MedalKey,
} from '@/utils/communityMedals'

/**
 * 社区勋章展台：头像菜单打开的居中全屏展示。背后的页面按主题背景色压暗并模糊，勋章直接浮在画面中央，
 * 下方是名称、一句说明与一行等级或时间，再下面是切换标签（线描徽记，有未读点）和三个动作。
 * 规则、进度与贡献记录放进“详情”面板，展台本身只讲这枚勋章是什么。
 *
 * 状态：持有勋章时默认停在第一枚没看过的勋章，看到哪枚就记哪枚看过；没有勋章时介绍七枚勋章与获得方式；
 * 实例开启了勋章但没配置 GitHub Token 时引导配置，直接在这里走 GitHub 设备授权，授权后由头像菜单重新核验。
 */
const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    profile: CommunityProfile
    loading?: boolean
    failed?: boolean
    /** 佩戴在头像旁的勋章键，空串表示不佩戴 */
    wornMedal?: string
    /** 没有未读勋章时打开停在这一枚，例如从头像旁的佩戴勋章点进来 */
    focusMedal?: string
  }>(),
  { modelValue: true, loading: false, failed: false, wornMedal: '', focusMedal: '' },
)
const emit = defineEmits<{
  close: []
  'update:modelValue': [value: boolean]
  refresh: []
  'update:wornMedal': [value: string]
}>()

const { t, locale } = useI18n()
const motion = usePreferredReducedMotion()
const reducedMotion = computed(() => motion.value === 'reduce')
// 触屏设备的提示说“轻点”，有鼠标时说“点击”。
const coarsePointer = useMediaQuery('(pointer: coarse)')
const medals = computed(() => knownMedals(props.profile.medals))

// 还没看过的勋章：切换标签上的未读点，看到哪枚就去掉哪枚的点。名单变化（例如配置 Token 后首次拿到勋章）
// 时重新计算，并停在第一枚没看过的勋章上。
const fresh = ref<MedalKey[]>([])
const picked = ref<MedalKey | null>(null)
watch(
  () => [props.profile.user_id, medals.value.map(medalSeenToken).join(',')],
  () => {
    fresh.value = unseenMedalKeys(props.profile.user_id, medals.value)
    if (!medals.value.some(item => item.key === picked.value)) {
      const focus = medals.value.find(item => item.key === props.focusMedal)?.key
      picked.value = fresh.value[0] ?? focus ?? null
    }
    // 展台打开后在后台预解码所有持有勋章的图，切换时不再等网络与解码。
    preloadMedalImages(medals.value.map(item => medalArt(item.key, item.tier)))
  },
  { immediate: true },
)
const current = computed<CommunityMedalRecord | undefined>(
  () => medals.value.find(item => item.key === picked.value) ?? medals.value[0],
)
const unconfigured = computed(() => props.profile.state === 'unconfigured' && medals.value.length === 0)
const detailsOpen = ref(false)
// 展台打开期间请求宿主隐藏右下角的助手形象，关闭或卸载时归还。
useAgentPetSuspension(() => props.modelValue)
/** 勋章正对时外形在展台里的上下边；文字按它对齐，不同外形的勋章与标题间距一致。 */
const medalBounds = ref<{ top: number; bottom: number } | null>(null)
const stageStyle = computed(() => ({
  '--medal-tone': current.value ? MEDAL_CATALOG[current.value.key].palette.tone : 'transparent',
  '--medal-top': String(medalBounds.value?.top ?? 0.08),
  '--medal-bottom': String(medalBounds.value?.bottom ?? 0.92),
}))
const saving = ref(false)
const saveFailed = ref(false)
const stage = ref<{ snapshot: () => Promise<string | null> } | null>(null)

watch(
  current,
  medal => {
    if (medal && props.modelValue) {
      markMedalSeen(props.profile.user_id, medal)
      fresh.value = fresh.value.filter(key => key !== medal.key)
    }
    saveFailed.value = false
  },
  { immediate: true },
)

const engravingOf = (record: CommunityMedalRecord) =>
  medalEngraving(record, { t, locale: locale.value, login: props.profile.login })
const engraving = computed(() => (current.value ? engravingOf(current.value) : { title: '', lines: [] }))
const meta = computed(() => (current.value ? medalMetaLine(current.value, t) : ''))
/** 前后相邻的勋章，展台在后台先搭好。 */
const upcoming = computed(() => {
  const list = medals.value
  const index = list.findIndex(item => item.key === current.value?.key)
  if (index < 0 || list.length < 2) return []
  const neighbours = [list[(index + 1) % list.length], list[(index - 1 + list.length) % list.length]]
  return [...new Set(neighbours)]
    .filter(item => item.key !== current.value?.key)
    .map(item => ({ medalKey: item.key, tier: item.tier, engraving: engravingOf(item) }))
})
const updated = computed(() => {
  const time = props.profile.generated_at
    ? new Date(props.profile.generated_at)
    : props.profile.checked_at
      ? new Date(props.profile.checked_at * 1000)
      : null
  return time && !Number.isNaN(time.getTime())
    ? time.toLocaleString(locale.value, { dateStyle: 'short', timeStyle: 'short' })
    : ''
})
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const githubAuth = useGithubTokenAuth('settings')
const githubAuthDialogVisible = ref(false)

/** 在展台里直接发起 GitHub 设备授权，与系统设置页同一套流程。 */
async function startGithubAuthorization() {
  githubAuthDialogVisible.value = true
  if (await githubAuth.startAuth()) {
    githubAuth.openAuthPage()
    void githubAuth.pollAuth()
  }
}

/** 关闭授权弹窗时停止前端轮询。 */
function cancelGithubAuthorization() {
  githubAuth.cancelAuth()
  githubAuthDialogVisible.value = false
}

function close() {
  visible.value = false
}

function toggleWear() {
  if (!current.value) return
  emit('update:wornMedal', props.wornMedal === current.value.key ? '' : current.value.key)
}

/** 保存竖版分享图：实时渲染时截正面朝前的一帧，否则用正面图。 */
async function save() {
  if (!current.value || !stage.value) return
  saving.value = true
  saveFailed.value = false
  try {
    const src = await stage.value.snapshot()
    if (!src) throw new Error('snapshot unavailable')
    const title = medalName(current.value.key, locale.value)
    const line = [
      medalTierLine(current.value, t),
      props.profile.login ? t('community.awardedTo', { login: '@' + props.profile.login }) : '',
      medalTimeLine(current.value, t),
    ]
      .filter(Boolean)
      .join(' · ')
    const blob = await composeShareImage({
      src,
      tone: MEDAL_CATALOG[current.value.key].palette.tone,
      title,
      line,
      font: getComputedStyle(document.body).fontFamily,
    })
    downloadBlob(blob, `MoviePilot-${title}.png`)
  } catch {
    saveFailed.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <VDialog
    v-model="visible"
    fullscreen
    :scrim="false"
    class="medal-showcase-dialog"
    content-class="medal-showcase-dialog__content"
    :aria-label="t('community.title')"
  >
    <div class="medal-showcase">
      <!-- 点击背景关闭，与其他浮层一致 -->
      <div class="medal-showcase__veil" aria-hidden="true" @click="close" />
      <VDialogCloseBtn inner-class="medal-showcase__close" @click="close" />

      <div class="medal-showcase__column">
        <VAlert
          v-if="failed || profile.stale"
          type="warning"
          variant="tonal"
          density="compact"
          class="medal-showcase__alert"
        >
          {{ t('community.stale') }}
        </VAlert>

        <template v-if="current">
          <div class="medal-showcase__stage" :class="{ 'is-dimmed': detailsOpen }" :style="stageStyle">
            <MedalStage
              ref="stage"
              :medal-key="current.key"
              :engraving="engraving"
              :tier="current.tier"
              :reduced-motion="reducedMotion"
              :upcoming="upcoming"
              @bounds="medalBounds = $event"
            />
          </div>

          <div class="medal-showcase__caption">
            <h2 class="medal-showcase__name">{{ medalName(current.key, locale) }}</h2>
            <p class="medal-showcase__summary">{{ t('community.medals.' + current.key + '.summary') }}</p>
            <p v-if="meta" class="medal-showcase__meta">{{ meta }}</p>
            <p class="medal-showcase__hint">{{ coarsePointer ? t('community.hintTouch') : t('community.hint') }}</p>
          </div>

          <div
            v-if="medals.length > 1"
            class="medal-showcase__chips"
            role="group"
            :aria-label="t('community.switcher')"
          >
            <button
              v-for="item in medals"
              :key="item.key"
              type="button"
              class="medal-showcase__chip"
              :aria-pressed="item.key === current.key"
              :aria-label="medalName(item.key, locale)"
              @click="picked = item.key"
            >
              <MedalEmblem :medal-key="item.key" />
              <span>{{ medalName(item.key, locale) }}</span>
              <span v-if="fresh.includes(item.key)" class="medal-showcase__dot" aria-hidden="true" />
            </button>
          </div>

          <div class="medal-showcase__actions">
            <VBtn variant="text" color="default" :aria-pressed="wornMedal === current.key" @click="toggleWear">
              <template #prepend>
                <VIcon
                  :icon="wornMedal === current.key ? 'mdi-check-circle' : 'mdi-account-star-outline'"
                  :color="wornMedal === current.key ? 'primary' : undefined"
                />
              </template>
              {{ wornMedal === current.key ? t('community.wearing') : t('community.wear') }}
            </VBtn>
            <VBtn variant="text" color="default" prepend-icon="mdi-download" :loading="saving" @click="save">
              {{ t('community.save') }}
            </VBtn>
            <VBtn variant="text" color="default" prepend-icon="mdi-text-box-outline" @click="detailsOpen = true">
              {{ t('community.details') }}
            </VBtn>
          </div>
          <p v-if="saveFailed" class="medal-showcase__error" role="status">{{ t('community.saveFailed') }}</p>
        </template>

        <div v-else-if="unconfigured" class="medal-showcase__empty">
          <VIcon icon="mdi-medal-outline" size="44" class="medal-showcase__empty-icon" />
          <h2 class="medal-showcase__name">{{ t('community.title') }}</h2>
          <p class="medal-showcase__summary">{{ t('community.unconfigured') }}</p>
          <p class="medal-showcase__meta">{{ t('community.unconfiguredHint') }}</p>
          <VBtn color="primary" variant="flat" prepend-icon="mdi-github" @click="startGithubAuthorization">
            {{ t('community.configureToken') }}
          </VBtn>
        </div>

        <div v-else class="medal-showcase__empty">
          <h2 class="medal-showcase__name">{{ t('community.title') }}</h2>
          <p class="medal-showcase__summary">{{ t('community.emptyIntro') }}</p>
          <ul class="medal-showcase__catalog">
            <li v-for="key in MEDAL_KEYS" :key="key" class="medal-showcase__catalog-item">
              <span class="medal-showcase__catalog-emblem">
                <MedalEmblem :medal-key="key" :size="22" />
              </span>
              <div>
                <div class="medal-showcase__catalog-name">
                  {{ medalName(key, locale) }}
                  <span class="medal-showcase__catalog-how">{{ t('community.how.' + MEDAL_CATALOG[key].how) }}</span>
                </div>
                <p>{{ t('community.medals.' + key + '.summary') }}</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </VDialog>
  <MedalDetailSheet
    v-if="current"
    v-model="detailsOpen"
    :record="current"
    :login="profile.login"
    :updated="updated"
    :loading="loading"
    @refresh="emit('refresh')"
  />
  <GithubTokenAuthDialog
    v-model="githubAuthDialogVisible"
    :session="githubAuth.session.value"
    :status="githubAuth.status.value"
    :loading="githubAuth.loading.value"
    :polling="githubAuth.polling.value"
    :error="githubAuth.error.value"
    :popup-blocked="githubAuth.popupBlocked.value"
    @open="githubAuth.openAuthPage"
    @poll="githubAuth.pollAuth"
    @cancel="cancelGithubAuthorization"
  />
</template>

<style lang="scss">
// 全屏展台：不画卡片与深色展台，背后的页面用主题背景色压暗并模糊，浅色主题下是浅色的纱，
// 深色与玻璃主题下是深色的纱，文字都用主题的前景色。
// 纱层铺满整个视口，不带圆角与外边距；全站小屏全屏弹窗顶部两角带圆角，这里用更具体的选择器覆盖。
.v-dialog.medal-showcase-dialog > .v-overlay__content.medal-showcase-dialog__content {
  inline-size: 100%;
  max-inline-size: none;
  block-size: 100%;
  max-block-size: none;
  margin: 0;
  border-radius: 0 !important;
  background: transparent;
  box-shadow: none;
}

.medal-showcase {
  position: relative;
  display: flex;
  justify-content: center;
  min-block-size: 100%;
  color: rgb(var(--v-theme-on-background));
  overflow-y: auto;
  padding-block: max(56px, env(safe-area-inset-top)) max(32px, env(safe-area-inset-bottom));
  padding-inline: 16px;
  // 展台边长：桌面最大 420，窄屏按视口宽度，矮屏按视口高度。
  --stage-size: min(420px, calc(100vw - 32px), 56dvh);

  &__veil {
    position: fixed;
    background: rgba(var(--v-theme-background), 0.8);
    backdrop-filter: blur(22px) saturate(1.15);
    inset: 0;
  }

  .medal-showcase__close {
    position: fixed;
    z-index: 2;
    inset-block-start: max(12px, env(safe-area-inset-top));
    inset-inline-end: max(12px, env(safe-area-inset-right));
  }

  &__column {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    inline-size: min(100%, 560px);
    margin-block: auto;
    text-align: center;
  }

  &__alert {
    inline-size: 100%;
    margin-block-end: 12px;
    text-align: start;
  }

  // 勋章直接浮在纱上，脚下一团勋章自己颜色的柔光。
  // 按勋章正对时的实际外形收紧上下留白：上方去掉一部分空白，下方与标题保持固定的 20px 间距。
  &__stage {
    position: relative;
    inline-size: var(--stage-size);
    margin-block: calc(var(--medal-top) * var(--stage-size) * -0.5)
      calc(20px - (1 - var(--medal-bottom)) * var(--stage-size));
    transition: opacity 0.25s ease;

    // 详情面板打开时淡出勋章，面板后面不再透出一大块模糊的亮色。
    &.is-dimmed {
      opacity: 0.08;
    }

    &::before {
      position: absolute;
      background: radial-gradient(
        closest-side,
        color-mix(in srgb, var(--medal-tone) 34%, transparent),
        color-mix(in srgb, var(--medal-tone) 10%, transparent) 55%,
        transparent
      );
      content: '';
      filter: blur(12px);
      inset: 18% 8% 2%;
    }

    // 浅色主题下纱是浅色的，补一团更浓的同色光和一道柔和的落影，勋章仍有浮起的感觉。
    .v-theme--light &::before {
      background: radial-gradient(
        closest-side,
        color-mix(in srgb, var(--medal-tone) 48%, transparent),
        color-mix(in srgb, var(--medal-tone) 16%, transparent) 55%,
        transparent
      );
    }

    .v-theme--light &::after {
      position: absolute;
      background: radial-gradient(closest-side, rgba(0, 0, 0, 0.22), transparent);
      block-size: 6%;
      content: '';
      filter: blur(6px);
      inset-block-start: calc(var(--medal-bottom) * 100% - 1%);
      inset-inline: 22%;
    }
  }

  &__caption {
    display: grid;
    gap: 4px;
    margin-block-start: 4px;
  }

  &__name {
    font-size: clamp(1.75rem, 1.4rem + 1.4vw, 2.25rem);
    font-weight: 700;
    letter-spacing: 0.1em;
    line-height: 1.25;
  }

  &__summary {
    margin: 0;
    font-size: 1rem;
    text-wrap: balance;
  }

  &__meta {
    margin: 0;
    color: rgba(var(--v-theme-on-background), var(--v-medium-emphasis-opacity));
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  &__hint {
    margin: 4px 0 0;
    color: rgba(var(--v-theme-on-background), var(--v-medium-emphasis-opacity));
    font-size: 0.75rem;
  }

  // 桌面一行放下全部切换标签，可超出文字栏宽度；窄屏每行四个，余下的居中。
  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    inline-size: max-content;
    max-inline-size: calc(100vw - 32px);
    margin-block-start: 20px;

    @media (width <= 600px) {
      inline-size: 100%;

      > .medal-showcase__chip {
        flex: 0 0 calc(25% - 6px);
        justify-content: center;
        padding-inline: 6px;
      }
    }
  }

  &__chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 36px;
    padding-inline: 12px 14px;
    border: 1px solid rgba(var(--v-theme-on-background), 0.16);
    border-radius: 999px;
    background: rgba(var(--v-theme-surface), 0.5);
    color: rgba(var(--v-theme-on-background), var(--v-medium-emphasis-opacity));
    font-size: 0.875rem;
    transition:
      border-color 0.15s,
      background-color 0.15s,
      color 0.15s;

    &:hover {
      color: rgb(var(--v-theme-on-background));
    }

    &[aria-pressed='true'] {
      border-color: rgba(var(--v-theme-primary), 0.7);
      background: rgba(var(--v-theme-primary), 0.14);
      color: rgb(var(--v-theme-on-background));
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: 2px;
    }
  }

  &__dot {
    position: absolute;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: rgb(var(--v-theme-error));
    inset-block-start: 2px;
    inset-inline-end: 4px;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    justify-content: center;
    margin-block-start: 16px;
  }

  &__error {
    margin: 4px 0 0;
    color: rgb(var(--v-theme-error));
    font-size: 0.8125rem;
  }

  &__empty {
    display: grid;
    gap: 8px;
    justify-items: center;
    inline-size: 100%;

    > .v-btn {
      margin-block-start: 12px;
    }
  }

  &__empty-icon {
    color: rgba(var(--v-theme-on-background), var(--v-medium-emphasis-opacity));
  }

  &__catalog {
    display: grid;
    gap: 4px;
    inline-size: 100%;
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
    text-align: start;
  }

  &__catalog-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    padding: 12px;
    border-radius: var(--app-surface-radius);
    background: rgba(var(--v-theme-surface), 0.55);

    p {
      margin: 2px 0 0;
      color: rgba(var(--v-theme-on-background), var(--v-medium-emphasis-opacity));
      font-size: 0.875rem;
      text-wrap: pretty;
    }
  }

  &__catalog-emblem {
    display: grid;
    inline-size: 40px;
    block-size: 40px;
    border: 1px solid rgba(var(--v-theme-on-background), 0.14);
    border-radius: 50%;
    color: rgb(var(--v-theme-primary));
    place-items: center;
  }

  &__catalog-name {
    font-weight: 600;
  }

  &__catalog-how {
    margin-inline-start: 6px;
    color: rgba(var(--v-theme-on-background), var(--v-medium-emphasis-opacity));
    font-size: 0.75rem;
    font-weight: 400;
  }
}
</style>
