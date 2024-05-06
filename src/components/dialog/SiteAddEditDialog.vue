<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import type { Site } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { numberValidator, requiredValidator } from '@/@validators'
import api from '@/api'
import { useDisplay } from 'vuetify'
import { useConfirm } from 'vuetify-use-dialog'

// 显示器宽度
const display = useDisplay()

// 确认框
const createConfirm = useConfirm()

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
  if (props.siteid) fetchSiteInfo()
})

// 查询站点信息
async function fetchSiteInfo() {
  try {
    siteForm.value = await api.get(`site/${props.siteid}`)
    siteForm.value.proxy = siteForm.value.proxy === 1
    siteForm.value.render = siteForm.value.render === 1
  } catch (error) {
    console.error(error)
  }
}

// 调用API 新增站点
async function addSite() {
  if (!siteForm.value?.url) return
  startNProgress()
  try {
    const result: { [key: string]: string } = await api.post('site/', siteForm.value)
    if (result.success) {
      $toast.success('新增站点成功')
      emit('save')
    } else {
      $toast.error(`新增站点失败：${result.message}`)
    }
  } catch (error) {
    console.error(error)
  }
  doneNProgress()
}

// 调用API删除站点信息
async function deleteSiteInfo() {
  const isConfirmed = await createConfirm({
    title: '确认',
    content: `是否确认删除站点？`,
  })

  if (!isConfirmed) return

  try {
    const result: { [key: string]: any } = await api.delete(`site/${siteForm.value?.id}`)
    if (result.success) emit('remove')
    else $toast.error(`${siteForm.value?.name} 删除失败：${result.message}`)
  } catch (error) {
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
    } else {
      $toast.error(`${siteForm.value?.name} 更新失败：${result.message}`)
    }
  } catch (error) {
    $toast.error(`${siteForm.value?.name} 更新失败！`)
    console.error(error)
  }
  doneNProgress()
}
</script>

<template>
  <VDialog scrollable :close-on-back="false" persistent eager max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard
      :title="`${props.oper === 'add' ? '新增' : '编辑'}站点${props.oper !== 'add' ? ` - ${siteForm.name}` : ''}`"
      class="rounded-t"
    >
      <DialogCloseBtn @click="emit('close')" />
      <VCardText class="pt-2">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteForm.url"
                label="站点地址"
                :rules="[requiredValidator]"
                hint="格式：http://www.example.com/"
              />
            </VCol>
            <VCol cols="12" md="3">
              <VSelect
                v-model="siteForm.pri"
                label="优先级"
                :items="priorityItems"
                :rules="[requiredValidator]"
                hint="站点资源下载优先级，优先级数字越小越优先下载"
              />
            </VCol>
            <VCol cols="12" md="3">
              <VSelect v-model="siteForm.is_active" :items="statusItems" label="状态" />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="siteForm.rss"
                label="RSS地址"
                hint="订阅模式为站点RSS时，将会使用此地址获取站点种子资源，该地址一般会自动获取，也可手动补充"
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="siteForm.cookie"
                label="站点Cookie"
                hint="浏览器打开站点首页，打开开发人员工具，刷新页面后在网络选项中找到首页地址，在请求头中获取Cookie信息"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteForm.token"
                label="请求头（Authorization）"
                hint="在开发人员工具，网络请求头中获取Authorization，仅个别站点需要"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField v-model="siteForm.apikey" label="令牌（API Key）" hint="站点的访问API Key，仅个别站点需要" />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="siteForm.ua"
                label="站点User-Agent"
                hint="在开发人员工具，网络请求头中获取User-Agent信息，需与站点Cookie配套使用"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_interval"
                label="单位周期（秒）"
                :rules="[numberValidator]"
                hint="设定站点限流的单位周期，单位为秒，0为不限流"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_count"
                label="访问次数"
                :rules="[numberValidator]"
                hint="设定单位周期内站点允许的访问次数，0为不限制"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_seconds"
                label="访问间隔（秒）"
                :rules="[numberValidator]"
                hint="设定单位周期内每次站点访问需间隔时间，单位为秒，0为不限制"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VSwitch v-model="siteForm.proxy" label="代理" hint="站点是否需要代理访问，需要设置好代理服务器信息" />
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="siteForm.render"
                label="仿真"
                hint="站点是否需要使用浏览器模拟访问，开启可以一定程度上提升连通性，但会大大增加站点请求时间"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="pt-3">
        <VBtn v-if="props.oper !== 'add'" color="error" @click="deleteSiteInfo" variant="outlined" class="me-3">
          删除
        </VBtn>
        <VSpacer />
        <VBtn
          v-if="props.oper === 'add'"
          color="primary"
          variant="elevated"
          @click="addSite"
          prepend-icon="mdi-plus"
          class="px-5"
        >
          新增
        </VBtn>
        <VBtn
          v-else
          color="primary"
          variant="elevated"
          @click="updateSiteInfo"
          prepend-icon="mdi-content-save"
          class="px-5"
        >
          保存
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
