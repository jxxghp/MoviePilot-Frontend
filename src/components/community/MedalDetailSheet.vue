<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VDialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import MedalEmblem from '@/components/community/MedalEmblem.vue'
import MedalTierProgress from '@/components/community/MedalTierProgress.vue'
import MedalTierNameplate from '@/components/community/MedalTierNameplate.vue'
import {
  MEDAL_CATALOG,
  OFFICIAL_REPOSITORIES,
  medalMetaLine,
  medalName,
  type CodeFacts,
  type CommunityMedalRecord,
  type PluginFacts,
} from '@/utils/communityMedals'

/**
 * 勋章详情：叠在展台上的次级面板，沿用全站对话框的卡片材质。只讲当前这一枚：规则、阶梯勋章的档位进度、
 * 编剧的逐仓贡献记录、布景的插件安装量（先列安装量最高的 5 个，展开后随面板一起滚动查看全部），
 * 以及一句数据来源说明和刷新。
 */
const props = defineProps<{
  modelValue: boolean
  record: CommunityMedalRecord
  /** 已核验的 GitHub 登录名，用于构造贡献证据链接 */
  login: string | null
  /** 名单更新时间的展示文本，空串时不显示 */
  updated: string
  loading: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; refresh: [] }>()

const { t, locale } = useI18n()
const entry = computed(() => MEDAL_CATALOG[props.record.key])
const meta = computed(() => medalMetaLine(props.record, t))
const code = computed(() => (props.record.key === 'code' ? (props.record.facts as CodeFacts | undefined) : undefined))
const plugin = computed(() =>
  props.record.key === 'plugin' ? (props.record.facts as PluginFacts | undefined) : undefined,
)
const repositories = computed(() =>
  [...(code.value?.repositories ?? [])].sort(
    (a, b) => Math.max(b.commits, b.merged_prs) - Math.max(a.commits, a.merged_prs),
  ),
)
const plugins = computed(() => [...(plugin.value?.plugins ?? [])].sort((a, b) => b.installs - a.installs))
const allPlugins = ref(false)
const shownPlugins = computed(() => (allPlugins.value ? plugins.value : plugins.value.slice(0, 5)))
watch(
  () => props.record.key,
  () => {
    allPlugins.value = false
  },
)

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

/** 按当前界面语言格式化贡献与安装数量。 */
function format(value: number) {
  return value.toLocaleString(locale.value)
}

/** 只为白名单官方仓库和已验证账号构造 GitHub 证据链接，不信任外部任意 URL。 */
function evidenceUrl(repository: string, kind: 'commits' | 'prs'): string | null {
  if (!(OFFICIAL_REPOSITORIES as readonly string[]).includes(repository) || !props.login) return null
  const base = 'https://github.com/jxxghp/' + encodeURIComponent(repository)
  const login = encodeURIComponent(props.login)
  return kind === 'commits'
    ? base + '/commits?author=' + login
    : base + '/pulls?q=' + encodeURIComponent('is:pr is:merged author:' + props.login)
}
</script>

<template>
  <VDialog v-model="visible" max-width="520" scrollable class="medal-detail-sheet">
    <VCard>
      <VCardItem>
        <template #prepend>
          <MedalEmblem :medal-key="record.key" :size="22" class="medal-detail-sheet__emblem" />
        </template>
        <VCardTitle>{{ medalName(record.key, locale) }}</VCardTitle>
        <VCardSubtitle v-if="record.tier" class="medal-detail-sheet__nameplate">
          <MedalTierNameplate :tier="record.tier" compact>{{ meta }}</MedalTierNameplate>
        </VCardSubtitle>
        <VCardSubtitle v-else-if="meta">{{ meta }}</VCardSubtitle>
        <VDialogCloseBtn @click="visible = false" />
      </VCardItem>
      <VDivider />
      <VCardText class="medal-detail-sheet__body">
        <section>
          <h3 class="medal-detail-sheet__heading">{{ t('community.detail.rules') }}</h3>
          <p>{{ t('community.medals.' + record.key + '.rule') }}</p>
          <p v-if="record.note && entry.how === 'manual'" class="text-medium-emphasis">
            {{ t('community.detail.note', { note: record.note }) }}
          </p>
        </section>

        <section v-if="entry.kind === 'ladder'">
          <h3 class="medal-detail-sheet__heading">{{ t('community.detail.progress') }}</h3>
          <MedalTierProgress :record="record" />
        </section>

        <section v-if="code">
          <h3 class="medal-detail-sheet__heading">
            {{ t('community.detail.contributions', { count: format(code.total) }) }}
          </h3>
          <p class="text-caption text-medium-emphasis">{{ t('community.detail.evidenceHint') }}</p>
          <ul class="medal-detail-sheet__list">
            <li v-for="item in repositories" :key="item.repository" class="medal-detail-sheet__row">
              <div class="medal-detail-sheet__row-main">
                <span class="font-weight-medium">{{ item.repository }}</span>
                <span class="text-caption text-medium-emphasis">{{ t('community.areas.' + item.area) }}</span>
              </div>
              <div class="medal-detail-sheet__links">
                <component
                  :is="evidenceUrl(item.repository, 'prs') ? 'a' : 'span'"
                  :href="evidenceUrl(item.repository, 'prs') ?? undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ t('community.detail.mergedPrs', { count: item.merged_prs }) }}
                </component>
                <component
                  :is="evidenceUrl(item.repository, 'commits') ? 'a' : 'span'"
                  :href="evidenceUrl(item.repository, 'commits') ?? undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ t('community.detail.commits', { count: item.commits }) }}
                </component>
              </div>
            </li>
          </ul>
        </section>

        <section v-if="plugin">
          <h3 class="medal-detail-sheet__heading">
            {{ t('community.detail.installs', { count: format(plugin.installs) }) }}
          </h3>
          <ul class="medal-detail-sheet__list">
            <li v-for="item in shownPlugins" :key="item.market + item.id" class="medal-detail-sheet__row">
              <div class="medal-detail-sheet__row-main">
                <span class="font-weight-medium">{{ item.name }}</span>
                <span class="text-caption text-medium-emphasis">{{ item.market }}</span>
              </div>
              <span class="medal-detail-sheet__value">{{ format(item.installs) }}</span>
            </li>
          </ul>
          <VBtn
            v-if="plugins.length > 5"
            variant="text"
            color="default"
            size="small"
            class="mt-1"
            :append-icon="allPlugins ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            :aria-expanded="allPlugins"
            @click="allPlugins = !allPlugins"
          >
            {{ allPlugins ? t('community.detail.collapse') : t('community.detail.showAll', { count: plugins.length }) }}
          </VBtn>
        </section>

        <section class="medal-detail-sheet__footer">
          <div class="text-caption text-medium-emphasis">
            <div>{{ t('community.detail.source') }}</div>
            <div v-if="updated">{{ t('community.updated', { time: updated }) }}</div>
          </div>
          <VBtn
            variant="text"
            color="default"
            size="small"
            prepend-icon="mdi-refresh"
            :loading="loading"
            @click="emit('refresh')"
          >
            {{ t('community.refresh') }}
          </VBtn>
        </section>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.medal-detail-sheet {
  &__nameplate {
    padding-block: 2px;
    opacity: 1;
    white-space: normal;
  }

  &__emblem {
    color: rgb(var(--v-theme-primary));
  }

  &__body {
    display: grid;
    gap: 20px;

    p {
      margin: 0;
      text-wrap: pretty;
    }

    section {
      display: grid;
      gap: 8px;
    }
  }

  &__heading {
    font-size: 0.9375rem;
    font-weight: 600;
  }

  &__list {
    display: grid;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  &__row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
    justify-content: space-between;
    padding-block: 10px;
    border-block-end: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
    overflow-wrap: anywhere;
  }

  &__row-main {
    display: grid;
    min-inline-size: 0;
  }

  &__value {
    font-variant-numeric: tabular-nums;
  }

  // 证据链接用正文色加下划线，主题色不用于文字，玻璃主题下也清楚。
  &__links {
    display: flex;
    gap: 12px;
    font-size: 0.8125rem;

    a {
      color: rgb(var(--v-theme-on-surface));
      text-decoration: underline;
      text-decoration-color: rgba(var(--v-theme-on-surface), 0.35);
      text-underline-offset: 2px;
    }
  }

  &__footer {
    display: flex !important;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    padding-block-start: 4px;
    border-block-start: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
}
</style>
