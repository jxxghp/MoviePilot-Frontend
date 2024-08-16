<script lang="ts" setup>
import api from '@/api'

// 定义输入
const props = defineProps({
  conf: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
})

if (!props.conf.filepath) {
  props.conf.filepath = '/moviepilot/.config/rclone/rclone.conf'
}

if (!props.conf.content) {
  props.conf.content = '# 请在此处填写rclone配置文件内容 \n# 请参考 https://rclone.org/docs/ \n# 存储节点名必须为：MP'
}

// 定义事件
const emit = defineEmits(['done', 'close'])

// 完成
async function handleDone() {
  await savaRcloneConfig()
  emit('done')
}

// 保存rclone设置
async function savaRcloneConfig() {
  try {
    await api.post(`storage/save/rclone`, props.conf)
  } catch (e) {
    console.error(e)
  }
}
</script>

<template>
  <VDialog width="50rem" scrollable max-height="85vh">
    <VCard title="Rclone网盘配置" class="rounded-t">
      <DialogCloseBtn @click="emit('close')" />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField v-model="props.conf.filepath" label="rclone配置文件路径" />
          </VCol>
          <VCol cols="12">
            <VAceEditor
              v-model:value="props.conf.content"
              lang="ini"
              theme="monokai"
              style="block-size: 30rem"
              class="rounded"
            >
            </VAceEditor>
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="elevated" @click="handleDone" prepend-icon="mdi-check" class="px-5 me-3"> 完成 </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
