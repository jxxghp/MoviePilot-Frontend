<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import PullRefresh from 'pull-refresh-vue3'
import api from '@/api'
import type { Subscribe } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import SubscribeCard from '@/components/cards/SubscribeCard.vue'
import store from '@/store'

// 输入参数
const props = defineProps({
  type: String,
})

// 是否刷新过
const isRefreshed = ref(false)

// 数据列表
const dataList = ref<Subscribe[]>([])

// 质量选择框数据
const qualityOptions = ref([
  {
    title: '全部',
    value: '',
  },
  {
    title: '蓝光原盘',
    value: 'Blu-?Ray.+VC-?1|Blu-?Ray.+AVC|UHD.+blu-?ray.+HEVC|MiniBD',
  },
  {
    title: 'Remux',
    value: 'Remux',
  },
  {
    title: 'BluRay',
    value: 'Blu-?Ray',
  },
  {
    title: 'UHD',
    value: 'UHD|UltraHD',
  },
  {
    title: 'WEB-DL',
    value: 'WEB-?DL|WEB-?RIP',
  },
  {
    title: 'HDTV',
    value: 'HDTV',
  },
  {
    title: 'H265',
    value: '[Hx].?265|HEVC',
  },
  {
    title: 'H264',
    value: '[Hx].?264|AVC',
  },
])

// 分辨率选择框数据
const resolutionOptions = ref([
  {
    title: '全部',
    value: '',
  },
  {
    title: '4k',
    value: '4K|2160p|x2160',
  },
  {
    title: '1080p',
    value: '1080[pi]|x1080',
  },
  {
    title: '720p',
    value: '720[pi]|x720',
  },
])

// 特效选择框数据
const effectOptions = ref([
  {
    title: '全部',
    value: '',
  },
  {
    title: '杜比视界',
    value: 'Dolby[\\s.]+Vision|DOVI|[\\s.]+DV[\\s.]+',
  },
  {
    title: '杜比全景声',
    value: 'Dolby[\\s.]*\\+?Atmos|Atmos',
  },
  {
    title: 'HDR',
    value: '[\\s.]+HDR[\\s.]+|HDR10|HDR10\\+',
  },
  {
    title: 'SDR',
    value: '[\\s.]+SDR[\\s.]+',
  },
])

const defaultSubscribeConfigFrom = ref<Subscribe>({
  quality: '',
  resolution: '',
  effect: '',
  include: '',
  exclude: '',
  best_version: 0,
  search_imdbid: 0,
  sites: [],
  save_path: '',
})

// 弹窗
const dialog = ref(false)

// 提示框
const $toast = useToast()

// 保存用户设置的默认订阅规则
async function setDefaultSubscribeConfig() {
  try {
    let subscribe_config_url = ""
    if (props.type == "电影") {
      subscribe_config_url = 'system/setting/DefaultMovieSubscribeConfig'
    } else {
      subscribe_config_url = 'system/setting/DefaultTvSubscribeConfig'
    }
    const result: { [key: string]: any } = await api.post(
      subscribe_config_url,
      defaultSubscribeConfigFrom.value)
    if (result.success) {
      $toast.success(props.type + '订阅默认规则保存成功')
    } else {
      $toast.error(props.type + '订阅默认规则保存失败！')
    }
    dialog.value = false
  }
  catch (error) {
    console.log(error)
  }
}

// 查询用户设置的默认订阅规则
async function queryDefaultSubscribeConfig() {
  try {
    let subscribe_config_url = ""
    if (props.type == "电影") {
      subscribe_config_url = 'system/setting/DefaultMovieSubscribeConfig'
    } else {
      subscribe_config_url = 'system/setting/DefaultTvSubscribeConfig'
    }
    const result: { [key: string]: any } = await api.get(subscribe_config_url)

    if (result.data.value) {
      defaultSubscribeConfigFrom.value = result.data?.value ?? ''
    }
  }
  catch (error) {
    console.log(error)
  }
}

// 加载时获取数据
onBeforeMount(queryDefaultSubscribeConfig)

// 获取订阅列表数据
async function fetchData() {
  try {
    dataList.value = await api.get('subscribe/')
    isRefreshed.value = true
  }
  catch (error) {
    console.error(error)
  }
}

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

// 过滤数据，管理员用户显示全部，非管理员只显示自己的订阅
const filteredDataList = computed(() => {
// 从Vuex Store中获取用户信息
  const superUser = store.state.auth.superUser
  const userName = store.state.auth.userName
  if (superUser)
    return dataList.value.filter(data => data.type === props.type)
  else
    return dataList.value.filter(data => data.type === props.type && (data.username === userName))
})
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
      v-if="filteredDataList.length > 0"
      class="grid gap-3 grid-subscribe-card p-1"
    >
      <SubscribeCard
        v-for="data in filteredDataList"
        :key="data.id"
        :media="data"
        @remove="fetchData"
        @save="fetchData"
      />
    </div>
    <NoDataFound
      v-if="filteredDataList.length === 0 && isRefreshed"
      error-code="404"
      error-title="没有订阅"
      error-description="请通过搜索添加电影、电视剧订阅。"
    />
  </PullRefresh>
  <!-- 底部操作按钮 -->
  <span class="fixed right-5 bottom-5">
    <VBtn icon="mdi-view-dashboard-edit" class="me-2" color="primary" size="x-large" @click="dialog = true" />
  </span>
   <!-- 弹窗，根据配置生成选项 -->
  <VDialog
    v-model="dialog"
    max-width="1000"
    scrollable
  >
    <VCard :title="`设置${props.type}订阅默认规则`">
      <VCardText>
        <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="defaultSubscribeConfigFrom.quality"
                label="质量"
                :items="qualityOptions"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="defaultSubscribeConfigFrom.resolution"
                label="分辨率"
                :items="resolutionOptions"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="defaultSubscribeConfigFrom.effect"
                label="特效"
                :items="effectOptions"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="defaultSubscribeConfigFrom.include"
                label="包含（关键字、正则式）"
                hint="支持正则表达式，多个关键字用 | 分隔表示或"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="defaultSubscribeConfigFrom.exclude"
                label="排除（关键字、正则式）"
                hint="支持正则表达式，多个关键字用 | 分隔表示或"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="defaultSubscribeConfigFrom.sites"
                :items="selectSitesOptions"
                chips
                label="订阅站点"
                multiple
                hint="只订阅选中的订阅站点，不选则订阅所有可订阅站点"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol
              cols="12"
            >
              <VTextField
                v-model="defaultSubscribeConfigFrom.save_path"
                label="保存路径"
                hint="指定该订阅的下载保存路径，留空自动使用设定的下载目录"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <VSwitch
                v-model="defaultSubscribeConfigFrom.best_version"
                label="洗版"
                hint="开启后不管媒体库是否存在，均会根据洗版优先级进行过滤下载，直到下载到了最高优先级的资源为止"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSwitch
                v-model="defaultSubscribeConfigFrom.search_imdbid"
                label="使用 ImdbID 搜索"
                hint="开启后将使用 ImdbID 搜索资源，搜索结果更精确，但不是所有站点都支持"
              />
            </VCol>
          </VRow>
      </VCardText>
      <VCardActions>
        <VBtn
          color="primary"
          @click="dialog = false"
        >
          取消
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          @click="setDefaultSubscribeConfig"
        >
          保存
        </VBtn>
      </VCardActions>
    </VCard>
  </vdialog>
</template>

<style lang="scss">
.grid-subscribe-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
