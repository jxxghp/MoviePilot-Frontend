<script lang="ts" setup>
import type { SubscribeSource } from '@/utils/subscribeSource'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  // 已归类的订阅来源
  source: SubscribeSource
}>()

const { t } = useI18n()

// 头像或插件 Logo 加载失败时退回首字圆点或拼图图标，避免出现破图
const imageFailed = ref(false)

watch(
  () => props.source.image,
  () => {
    imageFailed.value = false
  },
)

const showImage = computed(() => props.source.kind !== 'other' && !!props.source.image && !imageFailed.value)

// 徽标只画图形，名字放进悬停提示；提示写明来源类别，插件来源与账号来源区分开
const tooltip = computed(() =>
  props.source.kind === 'plugin'
    ? t('subscribe.sourceFromPlugin', { name: props.source.name })
    : t('subscribe.sourceSubscriber', { name: props.source.name }),
)
</script>

<template>
  <span class="subscribe-source-mark" role="img" :aria-label="tooltip" :data-source-kind="props.source.kind">
    <img
      v-if="showImage"
      :src="props.source.image"
      alt=""
      class="subscribe-source-mark__shape subscribe-source-mark__image"
      @error="imageFailed = true"
    />
    <span v-else-if="props.source.kind === 'plugin'" class="subscribe-source-mark__shape subscribe-source-mark__plugin">
      <VIcon icon="mdi-puzzle-outline" size="12" />
    </span>
    <span
      v-else
      class="subscribe-source-mark__shape subscribe-source-mark__dot"
      :style="{ backgroundColor: props.source.color }"
    >
      {{ props.source.initial }}
    </span>
    <!-- 原生 title 需要停顿约 1 秒且卡片上浮时会被取消，改用 Vuetify 提示即时显示 -->
    <VTooltip activator="parent" location="top">{{ tooltip }}</VTooltip>
  </span>
</template>

<style scoped>
.subscribe-source-mark {
  display: inline-flex;
}

/* 圆形徽标用柔和投影从海报或背景图上浮起，不加硬描边环 */
.subscribe-source-mark__shape {
  display: inline-grid;
  flex: none;
  border-radius: 50%;
  block-size: 18px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 45%);
  inline-size: 18px;
  place-items: center;
}

.subscribe-source-mark__image {
  object-fit: cover;
}

.subscribe-source-mark__dot {
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  text-shadow: none;
}

/* 插件没有可用 Logo 时，用与洗版徽标一致的深色半透明底加白色拼图图标 */
.subscribe-source-mark__plugin {
  backdrop-filter: blur(6px);
  background: rgba(0, 0, 0, 75%);
  color: #fff;
}
</style>
