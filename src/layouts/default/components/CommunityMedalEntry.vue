<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { medalArt } from '@/utils/communityMedalArt'
import { medalName, type CommunityMedalRecord } from '@/utils/communityMedals'

/**
 * 顶栏的社区勋章入口，和插件、通知图标并排常驻。
 * 三种形态共用顶栏图标的同一个按钮盒子与间距：佩戴了勋章时放那一枚（阶梯勋章按持有档位）的正面小图，
 * 不加底座，放进 32px 的方框；未佩戴时放线框勋章图标，有没看过的新勋章时右上角带一个红点。
 * 小图是构建前按不透明区域裁切并预先缩到 96 像素的资产，缺图时退回线框图标。
 * 功能是否可用由宿主判断，这里只负责呈现。
 */
const props = defineProps<{
  /** 当前佩戴且仍持有的勋章，不佩戴时为空。 */
  worn?: CommunityMedalRecord
  /** 是否有没看过的新勋章，只作用于线框图标。 */
  unseen?: boolean
}>()

const emit = defineEmits<{
  /** 打开勋章展台，参数为要停留的勋章键；空串表示交给展台按新勋章优先选择。 */
  open: [focusMedal: string]
}>()

const { t, locale } = useI18n()
const badge = computed(() => (props.worn ? (medalArt(props.worn.key, props.worn.tier)?.badge ?? null) : null))
</script>

<template>
  <IconBtn
    v-if="props.worn"
    class="community-medal-entry community-medal-entry--worn ms-2"
    :title="t('community.wornLabel', { name: medalName(props.worn.key, locale) })"
    :aria-label="t('community.wornLabel', { name: medalName(props.worn.key, locale) })"
    @click="emit('open', props.worn.key)"
  >
    <img v-if="badge" :src="badge" alt="" class="community-medal-entry__badge" />
    <VIcon v-else icon="mdi-medal-outline" />
  </IconBtn>
  <VBadge v-else-if="props.unseen" dot color="error" :offset-x="5" :offset-y="5" class="ms-2">
    <IconBtn
      class="community-medal-entry"
      :title="t('community.title')"
      :aria-label="`${t('community.title')} · ${t('community.unseen')}`"
      @click="emit('open', '')"
    >
      <VIcon icon="mdi-medal-outline" />
    </IconBtn>
  </VBadge>
  <IconBtn
    v-else
    class="community-medal-entry ms-2"
    :title="t('community.title')"
    :aria-label="t('community.title')"
    @click="emit('open', '')"
  >
    <VIcon icon="mdi-medal-outline" />
  </IconBtn>
</template>

<style lang="scss" scoped>
// 小图本身已按不透明区域裁切成正方形，这里只定显示尺寸，与邻居图标的 40px 按钮同一盒子。
.community-medal-entry__badge {
  display: block;
  block-size: 32px;
  inline-size: 32px;
  object-fit: contain;
}
</style>
