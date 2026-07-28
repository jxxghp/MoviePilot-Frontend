<script setup lang="ts">
import { useDisplay } from 'vuetify'
import type { Plugin } from '@/api/types'
import PageRender from '@/components/render/PageRender.vue'
import api from '@/api'
import { loadRemoteComponent } from '@/utils/federationLoader'
import { usePWA } from '@/composables/usePWA'
import { useToast } from 'vue-toastification'
import { usePluginNativeSubscribe } from '@/composables/usePluginNativeSubscribe'

// 输入参数
const props = defineProps({
  plugin: {
    type: Object as PropType<Plugin>,
  },
  show_switch: {
    type: Boolean,
    default: true,
  },
})

// 定义事件
const emit = defineEmits(['close', 'save', 'switch'])

// 显示器宽度
const display = useDisplay()
// APP
// PWA模式检测
const { appMode } = usePWA()

// 向联邦插件提供主应用 Toast，确保通知沿用统一主题和路由逻辑。
const $toast = useToast()
provide('moviepilot:toast', $toast)

// 向联邦插件同时提供 prop 与 inject 形式的主程序原生订阅入口。
const nativeSubscribe = usePluginNativeSubscribe()
provide('moviepilot:nativeSubscribe', nativeSubscribe)

// 是否刷新
const isRefreshed = ref(false)
// 组件是否已加载成功
const componentLoaded = ref(false)
// 是否正在加载数据
const isLoading = ref(false)

// 渲染模式: 'vuetify' 或 'vue'
const renderMode = ref('vuetify')

// 插件数据页面配置项
let pluginPageItems = ref([])

// Vue 模式：动态加载的组件
const dynamicComponent = defineAsyncComponent({
  // 工厂函数
  loader: async () => {
    try {
      if (!props.plugin?.id) {
        throw new Error('插件ID不存在')
      }

      // 动态加载远程组件
      const module = await loadRemoteComponent(props.plugin.id, 'Page')
      componentLoaded.value = true
      return module
    } catch (error) {
      console.error('加载远程组件失败:', error)
      componentLoaded.value = false
    }
  },
  // 加载中显示的组件
  loadingComponent: {
    template: '<VSkeletonLoader type="card"></VSkeletonLoader>',
  },
  // 添加错误处理
  errorComponent: {
    template: `
      <div class="pa-4">
        <VAlert type="error" title="组件加载错误">
          无法加载组件，请稍后再试
        </VAlert>
      </div>
    `,
  },
  // 添加超时设置
  timeout: 20000,
})

// 调用API读取数据页面UI
async function loadPluginUIData() {
  // 如果正在加载，则不重复加载
  if (isLoading.value) return

  isLoading.value = true
  isRefreshed.value = false
  pluginPageItems.value = []

  try {
    // 如果已经是vue模式且组件已加载成功，不需要再请求模式
    if (renderMode.value === 'vue' && componentLoaded.value) {
      isRefreshed.value = true
      isLoading.value = false
      return
    }

    const result: { [key: string]: any } = await api.get(`plugin/page/${props.plugin?.id}`)
    if (!result || !result.render_mode) {
      console.error(`插件 ${props.plugin?.plugin_name} UI数据加载失败：无效的响应`)
      return
    }
    renderMode.value = result.render_mode
    if (renderMode.value === 'vuetify') {
      // Vuetify模式
      pluginPageItems.value = result.page || []
    }
  } catch (error: any) {
    console.error(error)
  } finally {
    isRefreshed.value = true
    isLoading.value = false
  }
}

// 重新加载数据（可由 PageRender 或 Vue component 触发）
function handleAction(event: any) {
  // 避免在组件已加载的情况下重复调用loadPluginUIData
  if (renderMode.value === 'vue' && componentLoaded.value) {
    return
  }
  loadPluginUIData()
}

onMounted(() => {
  loadPluginUIData()
})
</script>
<template>
  <VDialog scrollable max-width="80rem" :fullscreen="!display.mdAndUp.value">
    <!-- Vuetify 渲染模式 -->
    <VCard
      v-if="renderMode === 'vuetify'"
      :title="`${props.plugin?.plugin_name}`"
    >
      <VDialogCloseBtn @click="emit('close')" />
      <LoadingBanner v-if="!isRefreshed" class="mt-5" />
      <VCardText v-else class="min-h-40">
        <div>
          <PageRender @action="handleAction" v-for="(item, index) in pluginPageItems" :key="index" :config="item" />
          <div v-if="!pluginPageItems || pluginPageItems.length === 0">此插件没有详情页面</div>
        </div>
      </VCardText>
      <VFab
        v-if="show_switch"
        icon="mdi-cog"
        location="bottom"
        size="x-large"
        fixed
        app
        appear
        @click="emit('switch')"
        :class="{ 'mb-10': appMode }"
      />
    </VCard>
    <!-- Vue 渲染模式 -->
    <VCard v-else-if="renderMode === 'vue'">
      <VCardText class="pa-0">
        <component
          :is="dynamicComponent"
          :api="api"
          :native-subscribe="nativeSubscribe"
          :show_switch="show_switch"
          @action="handleAction"
          @switch="emit('switch')"
          @close="emit('close')"
        />
      </VCardText>
    </VCard>
  </VDialog>
</template>
