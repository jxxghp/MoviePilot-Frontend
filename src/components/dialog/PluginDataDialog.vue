<script setup lang="ts">
import { useDisplay } from 'vuetify'
import type { Plugin, RenderProps } from '@/api/types'
import PageRender from '@/components/render/PageRender.vue'
import api from '@/api'
import { loadRemoteComponent } from '@/utils/federationLoader'
import { usePWA } from '@/composables/usePWA'
import { useToast } from 'vue-toastification'
import { usePluginNativeSubscribe } from '@/composables/usePluginNativeSubscribe'
import RemoteComponentError from '@/components/misc/RemoteComponentError.vue'
import RemoteComponentLoading from '@/components/misc/RemoteComponentLoading.vue'

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
// 只有成功取得合法页面响应时才允许展示空页面状态。
const loadError = ref(false)
// 组件是否已加载成功
const componentLoaded = ref(false)
// 是否正在加载数据
const isLoading = ref(false)

// 渲染模式: 'vuetify' 或 'vue'
type PluginRenderMode = 'vue' | 'vuetify'
const renderMode = ref<PluginRenderMode>('vuetify')

// 插件数据页面配置项
const pluginPageItems = ref<RenderProps[]>([])

function isPluginRenderMode(value: unknown): value is PluginRenderMode {
  return value === 'vue' || value === 'vuetify'
}

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
      throw error
    }
  },
  // 加载中显示的组件
  loadingComponent: RemoteComponentLoading,
  // 添加错误处理
  errorComponent: RemoteComponentError,
  // 添加超时设置
  timeout: 20000,
})

// 调用API读取数据页面UI
async function loadPluginUIData() {
  // 如果正在加载，则不重复加载
  if (isLoading.value) return

  isLoading.value = true
  isRefreshed.value = false
  loadError.value = false
  pluginPageItems.value = []

  try {
    // 如果已经是vue模式且组件已加载成功，不需要再请求模式
    if (renderMode.value === 'vue' && componentLoaded.value) {
      isRefreshed.value = true
      isLoading.value = false
      return
    }

    const result = (await api.get(`plugin/page/${props.plugin?.id}`)) as {
      page?: RenderProps[]
      render_mode?: string
    }
    if (!result || !isPluginRenderMode(result.render_mode)) {
      console.error(`插件 ${props.plugin?.plugin_name} UI数据加载失败：无效的响应`)
      loadError.value = true
      return
    }
    renderMode.value = result.render_mode
    if (renderMode.value === 'vuetify') {
      // Vuetify模式
      pluginPageItems.value = result.page || []
    }
  } catch (error) {
    console.error(error)
    loadError.value = true
  } finally {
    isRefreshed.value = true
    isLoading.value = false
  }
}

// 重新加载数据（可由 PageRender 或 Vue component 触发）
function handleAction() {
  // 避免在组件已加载的情况下重复调用loadPluginUIData
  if (renderMode.value === 'vue' && componentLoaded.value) {
    return
  }
  void loadPluginUIData()
}

onMounted(() => {
  void loadPluginUIData()
})
</script>
<template>
  <VDialog scrollable max-width="80rem" :fullscreen="!display.mdAndUp.value">
    <!-- Vuetify 渲染模式 -->
    <VCard v-if="renderMode === 'vuetify'" :title="`${props.plugin?.plugin_name}`">
      <VDialogCloseBtn @click="emit('close')" />
      <LoadingBanner v-if="!isRefreshed" class="mt-5" />
      <VCardText v-else-if="loadError" class="min-h-40">
        <VAlert type="error" title="数据加载失败">
          <div>插件数据加载失败，请稍后重试</div>
          <VBtn class="mt-3" color="error" variant="tonal" @click="loadPluginUIData">重试</VBtn>
        </VAlert>
      </VCardText>
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
