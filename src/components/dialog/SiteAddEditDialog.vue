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
  Array.from({ length: 100 }, (_, i) => i + 1).map(item => ({
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
      <VDivider />
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteForm.url"
                label="站点地址"
                :rules="[requiredValidator]"
                hint="格式：http://www.example.com/"
                persistent-hint
              />
            </VCol>
            <VCol cols="6" md="3">
              <VSelect
                v-model="siteForm.pri"
                label="优先级"
                :items="priorityItems"
                :rules="[requiredValidator]"
                hint="优先级越小越优先"
                persistent-hint
              />
            </VCol>
            <VCol cols="6" md="3">
              <VSelect
                v-model="siteForm.is_active"
                :items="statusItems"
                label="状态"
                hint="站点启用/停用"
                persistent-hint
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="9">
              <VTextField
                v-model="siteForm.rss"
                label="RSS地址"
                hint="订阅模式为`站点RSS`时使用的订阅链接，如未自动获取需手动补充"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="3">
              <VTextField v-model="siteForm.timeout" label="超时时间（秒）" hint="站点请求超时时间" persistent-hint />
            </VCol>
            <VCol cols="12">
              <VTextarea v-model="siteForm.cookie" label="站点Cookie" hint="站点请求头中的Cookie信息" persistent-hint />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteForm.token"
                label="请求头（Authorization）"
                hint="站点请求头中的Authorization信息，特殊站点需要"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteForm.apikey"
                label="令牌（API Key）"
                hint="站点的访问API Key，特殊站点需要"
                persistent-hint
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="siteForm.ua"
                label="站点User-Agent"
                hint="获取Cookie的浏览器对应的User-Agent"
                persistent-hint
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_interval"
                label="单位周期（秒）"
                :rules="[numberValidator]"
                hint="限流控制的单位周期时长"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_count"
                label="周期内访问次数"
                :rules="[numberValidator]"
                hint="单位周期内允许的访问次数"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_seconds"
                label="访问间隔（秒）"
                :rules="[numberValidator]"
                hint="每次访问需要间隔的最小时间"
                persistent-hint
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VSwitch v-model="siteForm.proxy" label="代理" hint="使用代理服务器访问该站点" persistent-hint />
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch v-model="siteForm.render" label="仿真" hint="使用浏览器模拟真实访问该站点" persistent-hint />
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
