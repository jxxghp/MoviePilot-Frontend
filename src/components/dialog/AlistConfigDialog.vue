<script lang="ts" setup>
import api from '@/api'

// 定义输入
const props = defineProps({
  conf: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 完成
async function handleDone() {
  await savaAlistConfig()
  emit('done')
}

// 保存rclone设置
async function savaAlistConfig() {
  try {
    await api.post(`storage/save/alist`, props.conf)
  } catch (e) {
    console.error(e)
  }
}
</script>

<template>
  <VDialog width="50rem" scrollable max-height="85vh">
    <VCard title="AList配置" class="rounded-t">
      <DialogCloseBtn @click="emit('close')" />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField v-model="props.conf.url" hint="AList服务地址" label="地址" persistent-hint />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField v-model="props.conf.username" hint="AList登录用户名" label="用户名" persistent-hint />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              type="password"
              v-model="props.conf.password"
              hint="AList登录密码"
              label="密码"
              persistent-hint
            />
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
