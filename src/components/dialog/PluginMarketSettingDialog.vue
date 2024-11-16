<script lang="ts" setup>
import api from '@/api'
import { useToast } from 'vue-toast-notification'

// 输入参数
const props = defineProps({
  title: String,
})

const $toast = useToast()

// 插件仓库设置字符串
const repoString = ref('')

// 定义事件
const emit = defineEmits(['save', 'close'])

// 查询已设置的插件仓库
async function queryMarketRepoSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/PLUGIN_MARKET')
    if (result && result.data && result.data.value) repoString.value = result.data.value
  } catch (error) {
    console.log(error)
  }
}

// 保存设置
async function saveHandle() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post('system/setting/PLUGIN_MARKET', repoString.value)

    if (result.success) {
      $toast.success('插件仓库保存成功')
      emit('save')
    } else $toast.error('插件仓库保存失败！')
  } catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  queryMarketRepoSetting()
})
</script>

<template>
  <VDialog width="50rem" scrollable max-height="85vh">
    <VCard title="插件仓库设置" class="rounded-t">
      <DialogCloseBtn @click="emit('close')" />
      <VCardText class="pt-2">
        <VTextarea
          v-model="repoString"
          placeholder="格式：https://github.com/jxxghp/MoviePilot-Plugins/,https://github.com/xxxx/xxxxxx/"
          hint="多个地址使用逗号分隔，仅支持Github仓库"
          persistent-hint
        />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="elevated" @click="saveHandle" prepend-icon="mdi-content-save-check" class="px-5 me-3">
          保存
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
