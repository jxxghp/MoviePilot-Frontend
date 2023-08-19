<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { Site } from '@/api/types'
import SiteCard from '@/components/cards/SiteCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import { numberValidator, requiredValidator } from '@/@validators'
import { doneNProgress, startNProgress } from '@/api/nprogress'

// 提示框
const $toast = useToast()

// 数据列表
const dataList = ref<Site[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 新增按钮文本
const addBtnText = ref('新增站点')
// 新增按钮状态
const addBtnState = ref(false)

// 新增站点对话框
const siteAddDialog = ref(false)

// 状态下拉项
const statusItems = [
  { title: '启用', value: true },
  { title: '停用', value: false },
]

// 站点编辑表单数据
const siteForm = reactive<Site>({
  id: 0,
  url: '',
  pri: 1,
  is_active: true,
  cookie: '',
  ua: '',
  limit_interval: 0,
  limit_seconds: 0,
  limit_count: 0,
  proxy: 0,
  render: 0,
  name: '',
  domain: '',
})

// 获取站点列表数据
async function fetchData() {
  try {
    dataList.value = await api.get('site')
    isRefreshed.value = true
  }
  catch (error) {
    console.error(error)
  }
}

// 调用API 新增站点
async function addSite() {
  if (!siteForm.url || !siteForm.name)
    return

  startNProgress()

  addBtnText.value = '新增中...'
  addBtnState.value = true

  try {
    const result: { [key: string]: string } = await api.post('site', siteForm)
    if (result.success) {
      $toast.success('新增站点成功')

      // 刷新数据
      siteAddDialog.value = false
      fetchData()
    }

    else { $toast.error(`新增站点失败：${result.message}`) }
  }
  catch (error) {
    console.error(error)
  }

  doneNProgress()

  addBtnText.value = '新增站点'
  addBtnState.value = false
}

// 加载时获取数据
onBeforeMount(fetchData)
</script>

<template>
  <div
    v-if="!isRefreshed"
    class="mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center"
  >
    <VProgressCircular
      v-if="!isRefreshed"
      size="48"
      indeterminate
      color="primary"
    />
  </div>
  <div
    v-if="dataList.length > 0"
    class="grid gap-3 grid-site-card"
  >
    <SiteCard
      v-for="data in dataList"
      :key="data.id"
      :site="data"
      @remove="fetchData"
      @update="fetchData"
    />
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有站点"
    error-description="已添加并支持的站点将会在这里显示。"
  />
  <!-- Dialog Content -->
  <VDialog
    v-model="siteAddDialog"
    max-width="800"
    persistent
    scrollable
  >
    <!-- Dialog Activator -->
    <template #activator="{ props }">
      <VBtn
        icon="mdi-plus"
        v-bind="props"
        size="x-large"
        class="fixed right-5 bottom-5"
      />
    </template>
    <VCard title="新增站点">
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
                :items="[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]"
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
          @click="siteAddDialog = false"
        >
          取消
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          :disabled="addBtnState"
          @click="addSite"
        >
          {{ addBtnText }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.grid-site-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
