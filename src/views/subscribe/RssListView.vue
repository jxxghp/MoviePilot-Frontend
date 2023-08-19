<script lang="ts" setup>
import PullRefresh from 'pull-refresh-vue3'
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { Rss } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import RssCard from '@/components/cards/RssCard.vue'
import { numberValidator, requiredValidator } from '@/@validators'
import { doneNProgress, startNProgress } from '@/api/nprogress'

// 提示框
const $toast = useToast()

// 是否刷新过
const isRefreshed = ref(false)

// 新增按钮文本
const addBtnText = ref('新增订阅')
// 新增按钮状态
const addBtnState = ref(false)

// 新增自定义订阅对话框
const rssAddDialog = ref(false)

// 新增订阅表单
const rssForm = reactive({
  // RSS地址
  url: '',
  // 类型
  type: '电影',
  // 标题
  title: '',
  // 年份
  year: '',
  // 季号
  season: 1,
  // 包含
  include: '',
  // 排除
  exclude: '',
  // 洗版
  best_version: false,
  // 是否使用代理服务器
  proxy: false,
  // 是否使用过滤规则
  filter: true,
  // 保存路径
  save_path: '',
  // 状态 0-停用，1-启用
  state: 1,

})

// 数据列表
const dataList = ref<Rss[]>([])

// 获取订阅列表数据
async function fetchData() {
  try {
    dataList.value = await api.get('rss')
    isRefreshed.value = true
  }
  catch (error) {
    console.error(error)
  }
}

// 调用API 新增自定义订阅
async function addRss() {
  if (!rssForm.url || !rssForm.title)
    return

  startNProgress()

  addBtnText.value = '新增中...'
  addBtnState.value = true

  if (rssForm.type === '电影')
    rssForm.season = 0

  try {
    const result: { [key: string]: string } = await api.post('rss', rssForm)
    if (result.success) {
      $toast.success('新增自定义订阅成功')

      // 刷新数据
      rssAddDialog.value = false
      fetchData()
    }

    else { $toast.error(`新增自定义订阅失败：${result.message}`) }
  }
  catch (error) {
    console.error(error)
  }

  doneNProgress()

  addBtnText.value = '新增订阅'
  addBtnState.value = false
}

// 生成1到50季的下拉框选项
const seasonItems = ref(
  Array.from({ length: 50 }, (_, i) => i + 1).map(item => ({
    title: `第 ${item} 季`,
    value: item,
  })),
)

// 加载时获取数据
onBeforeMount(fetchData)

// 刷新状态
const loading = ref(false)

// 下拉刷新
function onRefresh() {
  loading.value = true
  fetchData()
  loading.value = false
}
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
  <PullRefresh
    v-model="loading"
    @refresh="onRefresh"
  >
    <div
      v-if="dataList.length > 0"
      class="grid gap-3 grid-rss-card p-1"
    >
      <RssCard
        v-for="data in dataList"
        :key="data.id"
        :media="data"
        @remove="fetchData"
        @save="fetchData"
      />
    </div>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed"
      error-code="404"
      error-title="没有自定义订阅"
      error-description="点击右下角按钮新增订阅。"
    />
  </PullRefresh>

  <!-- 新增订阅 -->
  <VDialog
    v-model="rssAddDialog"
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

    <!-- Dialog Content -->
    <VCard title="新增自定义订阅">
      <VCardText class="pt-2">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol
              cols="12"
            >
              <VTextField
                v-model="rssForm.url"
                label="RSS地址"
                placeholder="https://example.com/rss"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSelect
                v-model="rssForm.type"
                label="类型"
                :items="[{ title: '电影', value: '电影' }, { title: '电视剧', value: '电视剧' }]"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="rssForm.title"
                label="标题"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="rssForm.year"
                label="年份"
                :rules="[numberValidator]"
              />
            </VCol>
            <VCol
              v-if="rssForm.type === '电视剧'"
              cols="12"
              md="6"
            >
              <VSelect
                v-model="rssForm.season"
                label="季"
                :items="seasonItems"
              />
            </VCol>
            <VCol
              cols="12"
            >
              <VTextField
                v-model="rssForm.include"
                label="包含"
                placeholder="支持正则表达式"
              />
            </VCol>
            <VCol
              cols="12"
            >
              <VTextField
                v-model="rssForm.exclude"
                label="排除"
                placeholder="支持正则表达式"
              />
            </VCol>
            <VCol
              cols="12"
            >
              <VTextField
                v-model="rssForm.save_path"
                label="保存路径"
                placeholder="留空自动"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSelect
                v-model="rssForm.state"
                label="状态"
                :items="[{
                  title: '启用',
                  value: 1,
                }, {
                  title: '停用',
                  value: 0,
                }]"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <VSwitch
                v-model="rssForm.best_version"
                label="洗版"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSwitch
                v-model="rssForm.proxy"
                label="代理服务器"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSwitch
                v-model="rssForm.filter"
                label="过滤规则"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions>
        <VBtn
          @click="rssAddDialog = false"
        >
          取消
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          :disabled="addBtnState"
          @click="addRss"
        >
          {{ addBtnText }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.grid-rss-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
