<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { Plugin } from '@/api/types'
import FormRender from '@/components/render/FormRender.vue'
import PageRender from '@/components/render/PageRender.vue'
import { isNullOrEmptyObject } from '@core/utils'

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
})

// 定义触发的自定义事件
const emit = defineEmits(['remove'])

// 提示框
const $toast = useToast()

// 本身是否可见
const isVisible = ref(true)

// 插件配置页面
const pluginConfigDialog = ref(false)

// 插件配置表单数据
const pluginConfigForm = ref({})

// 插件表单配置项
let pluginFormItems = reactive([])

// 插件详情页面
const pluginInfoDialog = ref(false)

// 插件详情页面配置项
let pluginPageItems = reactive([])

// 调用API卸载插件
async function uninstallPlugin() {
  try {
    const result: { [key: string]: any } = await api.delete(`plugin/${props.plugin?.id}`)
    if (result.success) {
      $toast.success(`插件 ${props.plugin?.plugin_name} 已卸载`)

      // 通知父组件刷新
      emit('remove')
    }
    else {
      $toast.error(`插件 ${props.plugin?.plugin_name} 卸载失败：${result.message}}`)
    }
  }
  catch (error) {
    console.error(error)
  }
}

// 调用API读取表单页面
async function loadPluginForm() {
  try {
    const result: { [key: string]: any } = await api.get(`plugin/form/${props.plugin?.id}`)
    if (result) {
      pluginFormItems = result.conf
      if (result.model)
        pluginConfigForm.value = result.model
    }
  }
  catch (error) {
    console.error(error)
  }
}

// 调用API读取详情页面
async function loadPluginPage() {
  try {
    const result: [] = await api.get(`plugin/page/${props.plugin?.id}`)
    if (result)
      pluginPageItems = result
  }
  catch (error) {
    console.error(error)
  }
}

// 调用API读取配置数据
async function loadPluginConf() {
  try {
    const result: { [key: string]: any } = await api.get(`plugin/${props.plugin?.id}`)
    if (!isNullOrEmptyObject(result))
      pluginConfigForm.value = result
  }
  catch (error) {
    console.error(error)
  }
}

// 调用API保存配置数据
async function savePluginConf() {
  try {
    const result: { [key: string]: any } = await api.put(`plugin/${props.plugin?.id}`, pluginConfigForm.value)
    if (result.success) {
      $toast.success(`插件 ${props.plugin?.plugin_name} 配置已保存`)
      pluginConfigDialog.value = false
    }
    else {
      $toast.error(`插件 ${props.plugin?.plugin_name} 配置保存失败：${result.message}}`)
    }
  }
  catch (error) {
    console.error(error)
  }
}

// 显示插件详情
async function showPluginInfo() {
  pluginConfigDialog.value = false
  pluginInfoDialog.value = true
}

// 显示插件配置
async function showPluginConfig() {
  // 加载表单
  await loadPluginForm()
  // 加载配置
  await loadPluginConf()
  // 加载详情
  await loadPluginPage()
  // 显示对话框
  pluginConfigDialog.value = true
}

// 弹出菜单
const dropdownItems = ref([
  {
    title: '卸载',
    value: 1,
    props: {
      prependIcon: 'mdi-trash-can-outline',
      color: 'error',
      click: uninstallPlugin,
    },
  },
])
</script>

<template>
  <!-- 插件卡片 -->
  <VCard
    v-if="isVisible"
    :width="props.width"
    :height="props.height"
    @click="showPluginConfig"
  >
    <div
      class="relative pa-4 text-center card-cover-blurred"
      :style="{ background: `${props.plugin?.plugin_color}` }"
    >
      <div class="me-n3 absolute top-0 right-3">
        <IconBtn>
          <VIcon icon="mdi-dots-vertical" />
          <VMenu
            activator="parent"
            close-on-content-click
          >
            <VList>
              <VListItem
                v-for="(item, i) in dropdownItems"
                :key="i"
                variant="plain"
                :base-color="item.props.color"
                @click="item.props.click"
              >
                <template #prepend>
                  <VIcon :icon="item.props.prependIcon" />
                </template>
                <VListItemTitle v-text="item.title" />
              </VListItem>
            </VList>
          </VMenu>
        </IconBtn>
      </div>
      <VAvatar
        size="128"
        class="shadow"
      >
        <VImg
          :src="`/plugin/${props.plugin?.plugin_icon}`"
          aspect-ratio="4/3"
          cover
        />
      </VAvatar>
    </div>
    <VCardItem class="py-2">
      <VCardTitle>{{ props.plugin?.plugin_name }}</VCardTitle>
    </VCardItem>
    <VCardText>
      {{ props.plugin?.plugin_desc }}
    </VCardText>
  </VCard>
  <!-- 插件配置页面 -->
  <VDialog
    v-model="pluginConfigDialog"
    max-width="800"
    scrollable
    persistent
  >
    <VCard :title="props.plugin?.plugin_name">
      <DialogCloseBtn @click="pluginConfigDialog = false" />
      <VCardText>
        <FormRender
          v-for="(item, index) in pluginFormItems"
          :key="index"
          :config="item"
          :form="pluginConfigForm"
        />
      </VCardText>
      <VCardActions>
        <VBtn v-if="pluginPageItems.length > 0" @click="showPluginInfo">
          详情
        </VBtn>
        <VSpacer />
        <VBtn @click="savePluginConf">
          保存
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>

  <!-- 插件详情页面 -->
  <VDialog
    v-model="pluginInfoDialog"
    max-width="1000"
    scrollable
    persistent
  >
    <VCard :title="`${props.plugin?.plugin_name} - 详情`">
      <DialogCloseBtn @click="pluginInfoDialog = false" />
      <VCardText>
        <PageRender
          v-for="(item, index) in pluginPageItems"
          :key="index"
          :config="item"
        />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn @click="pluginInfoDialog = false">
          关闭
        </VBtn>
      </VCardActions>
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
