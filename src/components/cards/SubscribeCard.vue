<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { calculateTimeDifference } from '@/@core/utils'
import { formatSeason } from '@/@core/utils/formatters'
import { numberValidator } from '@/@validators'
import api from '@/api'
import type { Site, Subscribe } from '@/api/types'

// 输入参数
const props = defineProps({
  media: Object as PropType<Subscribe>,
})

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save'])

// 提示框
const $toast = useToast()

// 图片是否加载完成
const imageLoaded = ref(false)

// 订阅弹窗
const subscribeInfoDialog = ref(false)

// 站点数据列表
const siteList = ref<Site[]>([])

// 站点选择下载框
const selectSitesOptions = ref<{ [key: number]: string }[]>([])

// 订阅编辑表单
const subscribeForm = reactive<any>(props.media ?? {})

// 类型转换
subscribeForm.best_version = subscribeForm.best_version === 1

// 上一次更新时间
const lastUpdateText = ref(
  `${
    props.media?.last_update
      ? `${calculateTimeDifference(props.media?.last_update || '')}前`
      : ''
  }`,
)

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 根据 type 返回不同的图标
function getIcon() {
  if (props.media?.type === '电影')
    return 'mdi-movie'
  else if (props.media?.type === '电视剧')
    return 'mdi-television-classic'
  else
    return 'mdi-help-circle'
}

// 计算百分比
function getPercentage() {
  if (props.media?.total_episode === 0)
    return 0

  return Math.round(
    (((props.media?.total_episode ?? 0) - (props.media?.lack_episode ?? 0))
      / (props.media?.total_episode ?? 1))
      * 100,
  )
}

// 计算文本颜色
function getTextColor() {
  return imageLoaded.value ? 'white' : ''
}

// 计算文本类
function getTextClass() {
  return imageLoaded.value ? 'text-white' : ''
}

// 删除订阅
async function removeSubscribe() {
  try {
    const result: { [key: string]: any } = await api.delete(
      `subscribe/${props.media?.id}`,
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

// 搜索订阅
async function searchSubscribe() {
  try {
    const result: { [key: string]: any } = await api.get(
      `subscribe/search/${props.media?.id}`,
    )

    // 提示
    if (result.success)
      $toast.success(`${props.media?.name} 提交搜索请求成功！`)
  }
  catch (e) {
    console.log(e)
  }
}

// 调用API修改订阅
async function updateSubscribeInfo() {
  subscribeInfoDialog.value = false
  try {
    const result: { [key: string]: any } = await api.put('subscribe/', subscribeForm)

    // 提示
    if (result.success) {
      $toast.success(`${props.media?.name} 更新成功！`)
      // 通知父组件刷新
      emit('remove')
    }
    else { $toast.error(`${props.media?.name} 更新失败：${result.message}！`) }
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

// 编辑订阅响应
async function editSubscribeDialog() {
  await getSiteList()
  subscribeInfoDialog.value = true
}

// 弹出菜单
const dropdownItems = ref([
  {
    title: '编辑',
    value: 1,
    props: {
      prependIcon: 'mdi-file-edit-outline',
      click: editSubscribeDialog,
    },
  },
  {
    title: '搜索',
    value: 2,
    props: {
      prependIcon: 'mdi-magnify',
      click: searchSubscribe,
    },
  },
  {
    title: '取消订阅',
    value: 3,
    props: {
      prependIcon: 'mdi-trash-can-outline',
      color: 'error',
      click: removeSubscribe,
    },
  },
])

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
</script>

<template>
  <VCard
    :key="props.media?.id"
    :class="`${subscribeForm.best_version ? 'outline-dashed outline-1' : ''}`"
    @click="editSubscribeDialog"
  >
    <template #image>
      <VImg
        :src="props.media?.backdrop || props.media?.poster"
        aspect-ratio="2/3"
        cover
        class="brightness-50"
        @load="imageLoadHandler"
      />
    </template>
    <VCardItem>
      <template #prepend>
        <VIcon
          size="1.9rem"
          :color="getTextColor()"
          :icon="getIcon()"
        />
      </template>
      <VCardTitle :class="getTextClass()">
        {{ props.media?.name }}
        {{ formatSeason(props.media?.season ? props.media?.season.toString() : "") }}
      </VCardTitle>
      <template #append>
        <div class="me-n3">
          <IconBtn>
            <VIcon
              icon="mdi-dots-vertical"
              :color="getTextColor()"
            />
            <VMenu
              activator="parent"
              close-on-content-click
            >
              <VList>
                <VListItem
                  v-for="(item, i) in dropdownItems"
                  :key="i"
                  variant="plain"
                  :base-color="item.props.color"
                  @click="item.props.click"
                >
                  <template #prepend>
                    <VIcon :icon="item.props.prependIcon" />
                  </template>
                  <VListItemTitle v-text="item.title" />
                </VListItem>
              </VList>
            </VMenu>
          </IconBtn>
        </div>
      </template>
    </VCardItem>

    <VCardText>
      <p
        class="clamp-text mb-0"
        :class="getTextClass()"
      >
        {{ props.media?.description }}
      </p>
    </VCardText>

    <VCardText class="d-flex justify-space-between align-center flex-wrap">
      <div class="d-flex align-center">
        <IconBtn
          icon="mdi-star"
          :color="getTextColor()"
          class="me-1"
        />
        <span
          class="text-subtitle-2 me-4"
          :class="getTextClass()"
        >{{
          props.media?.vote
        }}</span>
        <IconBtn
          v-if="props.media?.total_episode"
          v-bind="props"
          icon="mdi-progress-clock"
          :color="getTextColor()"
          class="me-1"
        />
        <span
          v-if="props.media?.season"
          class="text-subtitle-2 me-4"
          :class="getTextClass()"
        >{{ (props.media?.total_episode || 0) - (props.media?.lack_episode || 0) }} /
          {{ props.media?.total_episode }}</span>
        <IconBtn
          v-if="props.media?.username"
          icon="mdi-account"
          :color="getTextColor()"
          class="me-1"
        />
        <span
          v-if="props.media?.username"
          class="text-subtitle-2 me-4"
          :class="getTextClass()"
        >
          {{ props.media?.username }}
        </span>
      </div>
    </VCardText>
    <VCardText
      v-if="lastUpdateText"
      class="absolute right-0 bottom-0 d-flex align-center p-2 text-gray-300"
    >
      <VIcon
        icon="mdi-download"
        class="me-1"
      /> {{ lastUpdateText }}
    </VCardText>
    <VProgressLinear
      v-if="getPercentage() > 0"
      :model-value="getPercentage()"
      bg-color="success"
      color="success"
    />
  </VCard>
  <!-- 订阅编辑弹窗 -->
  <VDialog
    v-model="subscribeInfoDialog"
    max-width="50rem"
    persistent
    scrollable
  >
    <!-- Dialog Content -->
    <VCard :title="`订阅 - ${props.media?.name}`">
      <VCardText class="pt-2">
        <DialogCloseBtn @click="subscribeInfoDialog = false" />
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="subscribeForm.keyword"
                label="搜索关键词"
              />
            </VCol>
            <VCol
              v-if="props.media?.type === '电视剧'"
              cols="12"
              md="3"
            >
              <VTextField
                v-model="subscribeForm.total_episode"
                label="总集数"
                :rules="[numberValidator]"
              />
            </VCol>
            <VCol
              v-if="props.media?.type === '电视剧'"
              cols="12"
              md="3"
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
              md="6"
            >
              <VTextField
                v-model="subscribeForm.include"
                label="包含（关键字、正则式）"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="subscribeForm.exclude"
                label="排除（关键字、正则式）"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12">
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
        <VBtn @click="subscribeInfoDialog = false">
          取消
        </VBtn>
        <VSpacer />
        <VBtn @click="updateSubscribeInfo">
          确定
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
