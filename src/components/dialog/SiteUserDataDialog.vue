<script lang="ts" setup>
import type { Site, SiteUserData } from '@/api/types'
import api from '@/api'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  site: Object as PropType<Site>,
})

// 注册事件
const emit = defineEmits(['close'])

// 站点数据列表
const siteDatas = ref<SiteUserData[]>([])

// 查询站点用户数据
async function fetchSiteUserData() {
  try {
    const result: { [key: string]: any } = await api.get(`site/userdata/${props.site?.id}`)
    if (result.success) siteDatas.value = result.data
    console.log(result)
  } catch (error) {
    console.error(error)
  }
}

onMounted(async () => {
  fetchSiteUserData()
})
</script>

<template>
  <VDialog scrollable eager max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard :title="`数据 - ${props.site?.name}`" class="rounded-t">
      <DialogCloseBtn @click="emit('close')" />
      <VCardText> </VCardText>
    </VCard>
  </VDialog>
</template>
