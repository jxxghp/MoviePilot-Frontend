<script lang="ts" setup>
import type { Plugin } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { getDominantColor } from '@/@core/utils/image'
import { isNullOrEmptyObject } from '@/@core/utils'
import { formatDownloadCount } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

const PluginMarketDetailDialog = defineAsyncComponent(() => import('@/components/dialog/PluginMarketDetailDialog.vue'))
const PluginVersionHistoryDialog = defineAsyncComponent(() => import('@/components/dialog/PluginVersionHistoryDialog.vue'))

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
  count: Number,
})

// 定义触发的自定义事件
const emit = defineEmits(['install'])

// 多语言
const { t } = useI18n()

// 背景颜色
const backgroundColor = ref('#28A9E1')

// 图片对象
const imageRef = ref<any>()

// 获取当前插件的标签
const pluginLabels = computed(() => {
  if (!props.plugin?.plugin_label) return []

  return props.plugin.plugin_label
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
})

// 图片是否加载完成
const isImageLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

// 图片加载完成
async function imageLoaded() {
  isImageLoaded.value = true
  const imageElement = imageRef.value?.$el.querySelector('img') as HTMLImageElement
  // 从图片中提取背景色
  backgroundColor.value = await getDominantColor(imageElement)
}

// 计算图标路径
const iconPath: Ref<string> = computed(() => {
  if (imageLoadError.value) return getLogoUrl('plugin')
  // 如果是网络图片则使用代理后返回
  if (props.plugin?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(
      props.plugin?.plugin_icon,
    )}&cache=true`

  return `./plugin_icon/${props.plugin?.plugin_icon}`
})

// 访问插件页面
function visitPluginPage() {
  // 将raw.githubusercontent.com转换为项目地址
  let repoUrl = props.plugin?.repo_url
  if (props.plugin?.is_local || repoUrl?.startsWith('local://')) {
    repoUrl = props.plugin?.author_url
  }
  if (repoUrl) {
    if (repoUrl.includes('raw.githubusercontent.com')) {
      if (!repoUrl.endsWith('/')) repoUrl += '/'

      if (repoUrl.split('/').length < 6) repoUrl = `${repoUrl}main/`

      try {
        const [user, repo] = repoUrl.split('/').slice(-4, -2)
        repoUrl = `https://github.com/${user}/${repo}`
      } catch (error) {
        return
      }
    }
  } else {
    repoUrl = props.plugin?.author_url
  }
  window.open(repoUrl, '_blank')
}

// 显示更新日志
function showUpdateHistory() {
  openSharedDialog(
    PluginVersionHistoryDialog,
    { plugin: props.plugin },
    {},
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 打开共享插件市场详情弹窗。 */
function showPluginDetail() {
  openSharedDialog(
    PluginMarketDetailDialog,
    {
      plugin: props.plugin,
      count: props.count,
    },
    {
      install: () => emit('install'),
    },
    { closeOn: ['close', 'install', 'update:modelValue'] },
  )
}

// 弹出菜单
const dropdownItems = ref([
  {
    title: t('plugin.projectHome'),
    value: 1,
    show: true,
    props: {
      prependIcon: 'mdi-github',
      click: visitPluginPage,
    },
  },
  {
    title: t('plugin.updateHistory'),
    value: 2,
    show: !isNullOrEmptyObject(props.plugin?.history || {}),
    props: {
      prependIcon: 'mdi-update',
      click: showUpdateHistory,
    },
  },
])

</script>

<template>
  <div>
    <VHover>
      <template #default="hover">
        <VCard
          v-bind="hover.props"
          :width="props.width"
          :height="props.height"
          @click="showPluginDetail"
          class="flex flex-col h-full"
          :class="{
            'transition transform-cpu duration-300 -translate-y-1': hover.isHovering,
          }"
        >
          <div
            class="flex-grow"
            :style="`background: linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.5) 100%), linear-gradient(${backgroundColor} 0%, ${backgroundColor} 100%)`"
          >
            <VCardText class="px-2 pt-2 pb-0">
              <VCardTitle
                class="text-white px-2 pb-0 text-lg text-shadow whitespace-nowrap overflow-hidden text-ellipsis"
              >
                {{ props.plugin?.plugin_name }}
                <span class="text-sm mt-1 text-gray-200"> v{{ props.plugin?.plugin_version }} </span>
              </VCardTitle>
            </VCardText>
            <div class="relative flex flex-row items-start px-2 justify-between grow">
              <div class="relative flex-1 min-w-0">
                <div
                  class="text-white text-sm px-2 py-1 text-shadow overflow-hidden ..."
                  :class="{ 'line-clamp-3': !props.plugin?.plugin_label, 'line-clamp-2': props.plugin?.plugin_label }"
                >
                  {{ props.plugin?.plugin_desc }}
                </div>
                <!-- 插件标签 -->
                <div v-if="pluginLabels.length > 0" class="plugin-app-card__tags-section px-2">
                  <VChip
                    v-for="tag in pluginLabels"
                    :key="tag"
                    size="x-small"
                    variant="tonal"
                    color="info"
                    class="me-1 mb-1"
                    tile
                  >
                    {{ tag }}
                  </VChip>
                </div>
              </div>
              <div class="relative flex-shrink-0 self-center pb-3">
                <VAvatar size="48">
                  <VImg
                    ref="imageRef"
                    :src="iconPath"
                    aspect-ratio="4/3"
                    cover
                    @load="imageLoaded"
                    @error="imageLoadError = true"
                  />
                </VAvatar>
              </div>
            </div>
          </div>
          <VCardText
            class="flex flex-col align-self-baseline justify-between px-2 py-2 w-full overflow-hidden max-h-10 min-h-10"
          >
            <div class="flex flex-nowrap items-center w-full pe-10">
              <div class="flex flex-nowrap max-w-40 items-center align-middle">
                <VIcon icon="mdi-github" class="me-1" />
                <a
                  class="overflow-hidden text-ellipsis whitespace-nowrap"
                  :href="props.plugin?.author_url"
                  target="_blank"
                  @click.stop
                >
                  {{ props.plugin?.plugin_author }}
                </a>
              </div>
              <div v-if="props.count" class="ms-2 flex-shrink-0 download-count align-middle items-center">
                <VIcon size="small" icon="mdi-download" />
                <span class="text-sm">{{ formatDownloadCount(props.count) }}</span>
              </div>
            </div>
            <div class="absolute bottom-0 right-0">
              <IconBtn @click.stop>
                <VIcon size="small" icon="mdi-dots-vertical" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem v-for="(item, i) in dropdownItems" v-show="item.show" :key="i" @click="item.props.click">
                      <template #prepend>
                        <VIcon :icon="item.props.prependIcon" />
                      </template>
                      <VListItemTitle v-text="item.title" />
                    </VListItem>
                  </VList>
                </VMenu>
              </IconBtn>
            </div>
          </VCardText>
        </VCard>
      </template>
    </VHover>
  </div>
</template>
