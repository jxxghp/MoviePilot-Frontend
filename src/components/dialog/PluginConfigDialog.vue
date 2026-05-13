<script setup lang="ts">
import { useDisplay } from 'vuetify'
import type { Plugin } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'
import api from '@/api'
import { useToast } from 'vue-toastification'
import FormRender from '../render/FormRender.vue'
import ProgressDialog from '../dialog/ProgressDialog.vue'
import { useI18n } from 'vue-i18n'
import { loadRemoteComponent } from '@/utils/federationLoader'
import { defineComponent, h } from 'vue'

const AsyncLoadingComponent = defineComponent({
  name: 'AsyncLoadingComponent',
  setup() {
    return () => h('div', { class: 'pa-4 text-medium-emphasis' }, '组件加载中...')
  },
})

const AsyncErrorComponent = defineComponent({
  name: 'AsyncErrorComponent',
  setup() {
    return () =>
      h('div', { class: 'pa-4' }, [
        h('div', { class: 'text-error text-subtitle-1 mb-2' }, '组件加载错误'),
        h('div', { class: 'text-body-2' }, '无法加载组件，请稍后再试'),
      ])
  },
})

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  plugin: {
    type: Object as PropType<Plugin>,
  },
})

// 定义事件
const emit = defineEmits(['close', 'save', 'switch'])

// 显示器宽度
const display = useDisplay()

// 插件配置表单数据
const pluginConfigForm = ref({})

// 插件表单配置项
let pluginFormItems = reactive([])

// 进度框
const progressDialog = ref(false)

// 保存中
const saving = ref(false)

// 进度文字
const progressText = ref('')

// 提示框
const $toast = useToast()

// 是否刷新
const isRefreshed = ref(false)

// 最近一次保存时间，用于通知联邦组件刷新关联状态
const lastSavedAt = ref(0)

// 渲染模式: 'vuetify' 或 'vue'
const renderMode = ref('vuetify')

// Vue 模式：动态加载的组件
const dynamicComponent = defineAsyncComponent({
  // 工厂函数
  loader: async () => {
    try {
      if (!props.plugin?.id) {
        throw new Error('插件ID不存在')
      }

      // 动态加载远程组件
      const module = await loadRemoteComponent(props.plugin.id, 'Config')

      // 直接返回加载的组件，无需再获取default
      return module
    } catch (error) {
      console.error('加载远程组件失败:', error)
    }
  },
  // 加载中显示的组件
  loadingComponent: AsyncLoadingComponent,
  // 添加错误处理
  errorComponent: AsyncErrorComponent,
  // 添加超时设置
  timeout: 20000,
})

//调用API读取UI和配置数据
async function loadPluginUIData() {
  // 重置
  isRefreshed.value = false
  pluginFormItems = []
  pluginConfigForm.value = {}
  renderMode.value = 'vuetify'

  try {
    // 获取UI定义
    const result: { [key: string]: any } = await api.get(`plugin/form/${props.plugin?.id}`)
    if (!result) {
      console.error(`插件 ${props.plugin?.plugin_name} UI数据加载失败：无效的响应`)
      return
    }
    renderMode.value = result.render_mode
    if (renderMode.value === 'vue') {
      // Vue模式下，初始配置在同一个API返回
      if (!isNullOrEmptyObject(result.model)) {
        pluginConfigForm.value = result.model
      }
    } else {
      // Vuetify模式
      pluginFormItems = result.conf || []
      if (result.model) {
        pluginConfigForm.value = result.model
      }
    }
  } catch (error: any) {
    console.error(error)
  } finally {
    isRefreshed.value = true
  }
}

// 处理 Vue 组件触发的保存事件
function handleVueComponentSave(newConfig: Record<string, any>) {
  pluginConfigForm.value = newConfig
  savePluginConf()
}

// 调用API保存配置数据
async function savePluginConf() {
  if (saving.value) {
    return
  }

  // 显示等待提示框
  saving.value = true
  progressDialog.value = true
  progressText.value = t('dialog.pluginConfig.saving', { name: props.plugin?.plugin_name })
  try {
    const result: { [key: string]: any } = await api.put(`plugin/${props.plugin?.id}`, pluginConfigForm.value)
    if (result.success) {
      lastSavedAt.value = Date.now()
      $toast.success(t('dialog.pluginConfig.saveSuccess', { name: props.plugin?.plugin_name }))
      // 通知父组件刷新
      emit('save')
    } else {
      $toast.error(t('dialog.pluginConfig.saveFailed', { name: props.plugin?.plugin_name, message: result.message }))
    }
  } catch (error) {
    console.error(error)
  } finally {
    saving.value = false
    progressDialog.value = false
  }
}

onBeforeMount(async () => {
  await loadPluginUIData()
})
</script>
<template>
  <VDialog scrollable max-width="60rem" :fullscreen="!display.mdAndUp.value">
    <!-- Vuetify 渲染模式 -->
    <VCard v-if="renderMode === 'vuetify'" :title="`${props.plugin?.plugin_name} - ${t('dialog.pluginConfig.title')}`">
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <LoadingBanner v-if="!isRefreshed" class="mt-5" />
      <VCardText v-else="isRefreshed">
        <div>
          <FormRender v-for="(item, index) in pluginFormItems" :key="index" :config="item" :model="pluginConfigForm" />
          <div v-if="!pluginFormItems || pluginFormItems.length === 0">此插件没有可配置项</div>
        </div>
      </VCardText>
      <VCardActions class="pt-3">
        <VBtn v-if="props.plugin?.has_page" @click="emit('switch')" color="info">
          {{ t('dialog.pluginConfig.viewData') }}
        </VBtn>
        <VSpacer />
        <!-- 只有Vuetify模式显示默认保存按钮，Vue模式由组件内部控制 -->
        <VBtn
          v-if="renderMode === 'vuetify'"
          :loading="saving"
          :disabled="saving"
          @click="savePluginConf"
          prepend-icon="mdi-content-save"
          class="px-5"
        >
          保存
        </VBtn>
      </VCardActions>
    </VCard>
    <!-- Vue 渲染模式 -->
    <VCard v-else-if="renderMode === 'vue'">
      <VCardText class="pa-0">
        <component
          :is="dynamicComponent"
          :initial-config="pluginConfigForm"
          :api="api"
          :last-saved-at="lastSavedAt"
          :saving="saving"
          @save="handleVueComponentSave"
          @switch="emit('switch')"
          @close="emit('close')"
        />
      </VCardText>
    </VCard>

    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />
  </VDialog>
</template>
