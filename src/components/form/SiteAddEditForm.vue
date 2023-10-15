<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import type { Site } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { numberValidator, requiredValidator } from '@/@validators'
import api from '@/api'

// 输入参数
const props = defineProps({
  siteid: Number,
  oper: String,
})

// 注册事件
const emit = defineEmits(['save', 'remove', 'close'])

// 站点编辑表单数据
const siteForm = ref<Site>({
  id: props.siteid ?? 0,
  url: '',
  rss: '',
  cookie: '',
  ua: '',
  pri: 0,
  is_active: true,
  limit_interval: 0,
  limit_seconds: 0,
  name: '',
  domain: '',
})

// 提示框
const $toast = useToast()

// 状态下拉项
const statusItems = [
  { title: '启用', value: true },
  { title: '停用', value: false },
]

// 生成1到50的优先级下拉框选项
const priorityItems = ref(
  Array.from({ length: 50 }, (_, i) => i + 1).map(item => ({
    title: item,
    value: item,
  })),
)

// 监控输入参数
watchEffect(async () => {
  if (props.siteid)
    fetchSiteInfo()
})

// 查询站点信息
async function fetchSiteInfo() {
  try {
    siteForm.value = await api.get(`site/${props.siteid}`)
    siteForm.value.proxy = siteForm.value.proxy === 1
    siteForm.value.render = siteForm.value.render === 1
  }
  catch (error) {
    console.error(error)
  }
}

// 调用API 新增站点
async function addSite() {
  if (!siteForm.value?.url)
    return
  startNProgress()
  try {
    const result: { [key: string]: string } = await api.post('site/', siteForm.value)
    if (result.success) {
      $toast.success('新增站点成功')
      emit('save')
    }

    else { $toast.error(`新增站点失败：${result.message}`) }
  }
  catch (error) {
    console.error(error)
  }
  doneNProgress()
}

// 调用API删除站点信息
async function deleteSiteInfo() {
  try {
    const result: { [key: string]: any } = await api.delete(`site/${siteForm.value?.id}`)
    if (result.success)
      emit('remove')

    else $toast.error(`${siteForm.value?.name} 删除失败：${result.message}`)
  }
  catch (error) {
    $toast.error(`${siteForm.value?.name} 删除失败！`)
    console.error(error)
  }
}

// 调用API更新站点信息
async function updateSiteInfo() {
  startNProgress()
  try {
    const result: { [key: string]: any } = await api.put('site/', siteForm.value)
    if (result.success) {
      $toast.success(`${siteForm.value?.name} 更新成功！`)
      emit('save')
    }
    else { $toast.error(`${siteForm.value?.name} 更新失败：${result.message}`) }
  }
  catch (error) {
    $toast.error(`${siteForm.value?.name} 更新失败！`)
    console.error(error)
  }
  doneNProgress()
}
</script>

<template>
  <VDialog
    scrollable
    max-width="60rem"
  >
    <VCard
      :title="`${props.oper === 'add' ? '新增' : '编辑'}站点${props.oper !== 'add' ? ` - ${siteForm.name}` : ''}`"
      class="rounded-t"
    >
      <DialogCloseBtn @click="emit('close')" />
      <VCardText class="pt-2">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="siteForm.url"
                label="站点地址"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="3"
            >
              <VSelect
                v-model="siteForm.pri"
                label="优先级"
                :items="priorityItems"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="3"
            >
              <VSelect
                v-model="siteForm.is_active"
                :items="statusItems"
                label="状态"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="siteForm.rss"
                label="RSS地址"
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="siteForm.cookie"
                label="站点Cookie"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="siteForm.ua"
                label="站点User-Agent"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="siteForm.limit_interval"
                label="单位周期（秒）"
                :rules="[numberValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="siteForm.limit_seconds"
                label="访问次数"
                :rules="[numberValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="siteForm.limit_seconds"
                label="访问间隔（秒）"
                :rules="[numberValidator]"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <VSwitch
                v-model="siteForm.proxy"
                label="代理"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSwitch
                v-model="siteForm.render"
                label="仿真"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions>
        <VBtn
          v-if="props.oper === 'add'"
          @click="emit('close')"
        >
          取消
        </VBtn>
        <VBtn
          v-else
          color="error"
          @click="deleteSiteInfo"
        >
          删除
        </VBtn>
        <VSpacer />
        <VBtn
          v-if="props.oper === 'add'"
          color="primary"
          variant="tonal"
          @click="addSite"
        >
          新增
        </VBtn>
        <VBtn
          v-else
          color="primary"
          variant="tonal"
          @click="updateSiteInfo"
        >
          保存
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
