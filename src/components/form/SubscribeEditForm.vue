<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { numberValidator } from '@/@validators'
import api from '@/api'
import type { Site, Subscribe } from '@/api/types'

// 输入参数
const props = defineProps({
  subid: Number,
})

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save', 'close'])

// 站点数据列表
const siteList = ref<Site[]>([])

// 站点选择下载框
const selectSitesOptions = ref<{ [key: number]: string }[]>([])

// 订阅编辑表单
const subscribeForm = ref<Subscribe>({
  id: props.subid ?? 0,
  keyword: '',
  quality: '',
  resolution: '',
  effect: '',
  include: '',
  exclude: '',
  total_episode: 0,
  start_episode: 0,
  best_version: 0,
  sites: [],
  type: '',
  name: '',
  year: '',
  tmdbid: 0,
  state: '',
  last_update: '',
  username: '',
  current_priority: 0,
})

// 提示框
const $toast = useToast()

// 调用API修改订阅
async function updateSubscribeInfo() {
  try {
    const result: { [key: string]: any } = await api.put('subscribe/', subscribeForm.value)
    // 提示
    if (result.success) {
      $toast.success(`${subscribeForm.value.name} 更新成功！`)
      // 通知父组件刷新
      emit('save')
    }
    else { $toast.error(`${subscribeForm.value.name} 更新失败：${result.message}！`) }
  }
  catch (e) {
    console.log(e)
  }
}

// 获取站点列表数据
async function loadSites() {
  try {
    const data: Site[] = await api.get('site/rss')

    // 过滤站点，只有启用的站点才显示
    siteList.value = data.filter(item => item.is_active)
  }
  catch (error) {
    console.error(error)
  }
}

// 获取站点列表选择框数据
async function getSiteList() {
  // 加载订阅站点列表
  if (!siteList.value.length)
    await loadSites()

  const maps = siteList.value.map((item) => {
    return {
      title: item.name,
      value: item.id,
    }
  })

  selectSitesOptions.value = maps.flat()
}

// 获取订阅信息
async function getSubscribeInfo() {
  try {
    const result: Subscribe = await api.get(
      `subscribe/${props.subid}`,
    )
    subscribeForm.value = result
    subscribeForm.value.best_version = subscribeForm.value.best_version === 1
  }
  catch (e) {
    console.log(e)
  }
}

// 删除订阅
async function removeSubscribe() {
  try {
    const result: { [key: string]: any } = await api.delete(
      `subscribe/${props.subid}`,
    )

    if (result.success) {
      // 通知父组件刷新
      emit('remove')
    }
  }
  catch (e) {
    console.log(e)
  }
}

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

// 初始化
onMounted(async () => {
  getSiteList()
  getSubscribeInfo()
})
</script>

<template>
  <VDialog
    scrollable
    max-width="60rem"
  >
    <VCard
      :title="`编辑订阅 - ${subscribeForm.name} ${subscribeForm.season ? `第 ${subscribeForm.season} 季` : ''}`"
      class="rounded-t"
    >
      <VCardText class="pt-2">
        <DialogCloseBtn @click="emit('close')" />
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol
              cols="12"
              md="8"
            >
              <VTextField
                v-model="subscribeForm.keyword"
                label="搜索关键词"
              />
            </VCol>
            <VCol
              v-if="subscribeForm.type === '电视剧'"
              cols="12"
              md="2"
            >
              <VTextField
                v-model="subscribeForm.total_episode"
                label="总集数"
                :rules="[numberValidator]"
              />
            </VCol>
            <VCol
              v-if="subscribeForm.type === '电视剧'"
              cols="12"
              md="2"
            >
              <VTextField
                v-model="subscribeForm.start_episode"
                label="开始集数"
                :rules="[numberValidator]"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="subscribeForm.quality"
                label="质量"
                :items="qualityOptions"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="subscribeForm.resolution"
                label="分辨率"
                :items="resolutionOptions"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="subscribeForm.effect"
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
                v-model="subscribeForm.include"
                label="包含（关键字、正则式）"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="subscribeForm.exclude"
                label="排除（关键字、正则式）"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="subscribeForm.sites"
                :items="selectSitesOptions"
                chips
                label="订阅站点"
                multiple
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12">
              <VSwitch
                v-model="subscribeForm.best_version"
                label="洗版"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>

      <VCardActions>
        <VBtn color="error" @click="removeSubscribe">
          取消订阅
        </VBtn>
        <VSpacer />
        <VBtn
          variant="tonal"
          @click="updateSubscribeInfo"
        >
          保存
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
