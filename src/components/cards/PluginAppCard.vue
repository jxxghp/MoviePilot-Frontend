<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { Plugin } from '@/api/types'

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
})

// 定义触发的自定义事件
const emit = defineEmits(['install'])

// 提示框
const $toast = useToast()

// 进度框
const progressDialog = ref(false)

// 进度框文本
const progressText = ref('正在安装插件...')

// 图片是否加载完成
const isImageLoaded = ref(false)

// 安装插件
async function installPlugin() {
  try {
    // 显示等待提示框
    progressDialog.value = true
    progressText.value = `正在安装 ${props.plugin?.plugin_name} ${props?.plugin?.plugin_version} 插件...`

    const result: { [key: string]: any } = await api.get(
      `plugin/install/${props.plugin?.id}`,
      {
        params: {
          repo_url: props.plugin?.repo_url,
          force: props.plugin?.has_update,
        },
      },
    )

    // 隐藏等待提示框
    progressDialog.value = false

    if (result.success) {
      $toast.success(`插件 ${props.plugin?.plugin_name} 安装成功！`)

      // 通知父组件刷新
      emit('install')
    }
    else {
      $toast.error(`插件 ${props.plugin?.plugin_name} 安装失败：${result.message}}`)
    }
  }
  catch (error) {
    console.error(error)
  }
}

// 计算图标路径
const iconPath = computed(() => {
  return props.plugin?.plugin_icon?.startsWith('http')
    ? props.plugin?.plugin_icon
    : `/plugin_icon/${props.plugin?.plugin_icon}`
})
</script>

<template>
  <VCard
    :width="props.width"
    :height="props.height"
    @click="installPlugin"
  >
    <div
      class="relative pa-4 text-center card-cover-blurred"
      :style="{ background: `${props.plugin?.plugin_color}` }"
    >
      <div
        v-if="props.plugin?.has_update"
        class="me-n3 absolute top-0 right-5"
      >
        <VIcon
          icon="mdi-new-box"
          class="text-white"
        />
      </div>
      <VAvatar
        size="8rem"
        :class="{ shadow: isImageLoaded }"
      >
        <VImg
          :src="iconPath"
          aspect-ratio="4/3"
          cover
          @load="isImageLoaded = true"
        />
      </VAvatar>
    </div>
    <VCardTitle>{{ props.plugin?.plugin_name }}</VCardTitle>

    <VCardText>
      {{ props.plugin?.plugin_desc }}
    </VCardText>
    <VCardText>
      作者：<a
        :href="props.plugin?.author_url"
        target="_blank"
        @click.stop
      >
        {{ props.plugin?.plugin_author }}
      </a><br>
      版本：{{ props.plugin?.plugin_version }}
    </VCardText>
  </VCard>
  <!-- 安装插件进度框 -->
  <VDialog
    v-model="progressDialog"
    :scrim="false"
    width="25rem"
  >
    <VCard
      color="primary"
    >
      <VCardText class="text-center">
        {{ progressText }}
        <VProgressLinear
          indeterminate
          color="white"
          class="mb-0 mt-1"
        />
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.card-cover-blurred::before {
  position: absolute;
  /* stylelint-disable-next-line property-no-vendor-prefix */
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  background: rgba(29, 39, 59, 48%);
  content: "";
  inset: 0;
}
</style>
