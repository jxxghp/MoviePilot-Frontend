<script lang="ts" setup>
import type { Plugin } from '@/api/types'
import noImage from '@images/logos/plugin.png'
import api from '@/api'
import { useDisplay } from 'vuetify'
import PageRender from '@/components/render/PageRender.vue'


// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>
})

// 插件数据页面配置项
let pluginPageItems = ref([])

// 图片是否加载完成
const isImageLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

// 插件数据页面
const pluginPageDialog = ref(false)

// 计算图标路径
const iconPath: Ref<string> = computed(() => {
  if (!props.plugin?.plugin_icon || imageLoadError.value) return noImage
  // 如果是网络图片则使用代理后返回
  if (props.plugin?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(props.plugin?.plugin_icon)}`
  return `./plugin_icon/${props.plugin?.plugin_icon}`
})

// 调用API读取数据页面
async function loadPluginPage() {
  try {
    const result: [] = await api.get(`plugin/page/${props.plugin?.id}`)
    if (result) pluginPageItems.value = result
  } catch (error) {
    console.error(error)
  }
}

// 显示插件数据页
async function showPluginPage() {
  // 加载数据
  await loadPluginPage()
  pluginPageDialog.value = true
}
</script>
<template>
  <div class="text-center">
    <VAvatar size="6rem" @click="showPluginPage" class="cursor-pointer">
      <VImg
        ref="imageRef"
        :src="iconPath"
        aspect-ratio="4/3"
        cover
        :class="{ shadow: isImageLoaded }"
        @error="imageLoadError = true"
      />
    </VAvatar>
    <div style="padding-block-start: 10px;">
      <VChip
        :text="props.plugin?.plugin_name"
        size="small"
        @click="showPluginPage"
      />
    </div>
  </div>
  <!-- 插件数据页面 -->
  <VDialog v-model="pluginPageDialog" scrollable max-width="80rem" :fullscreen="!display.mdAndUp.value">
    <VCard :title="`${props.plugin?.plugin_name}`" class="rounded-t">
      <DialogCloseBtn v-model="pluginPageDialog" />
      <VCardText class="min-h-40">
        <PageRender v-for="(item, index) in pluginPageItems" :key="index" :config="item" />
      </VCardText>
    </VCard>
  </VDialog>
</template>
