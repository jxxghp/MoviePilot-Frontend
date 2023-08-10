<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { calculateTimeDifference } from '@/@core/utils'
import { formatSeason } from '@/@core/utils/formatters'
import api from '@/api'
import type { Rss, Site } from '@/api/types'

// 输入参数
const props = defineProps({
  media: Object as PropType<Rss>,
})

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save'])

// 提示框
const $toast = useToast()

// 图片是否加载完成
const imageLoaded = ref(false)

// 订阅弹窗
const rssInfoDialog = ref(false)

// 站点名称
const siteName = ref('')

// 订阅编辑表单
const rssForm = reactive({
  id: props.media?.id,
  // RSS地址
  url: props.media?.url,
  // 类型
  type: props.media?.type,
  // 标题
  title: props.media?.title,
  // 年份
  year: props.media?.year,
  // TMDBID
  tmdbid: props.media?.tmdbid,
  // 季号
  season: props.media?.season,
  // 总集数
  total_episode: props.media?.total_episode,
  // 包含
  include: props.media?.include,
  // 排除
  exclude: props.media?.exclude,
  // 洗版
  best_version: props.media?.best_version,
  // 是否使用代理服务器
  proxy: props.media?.proxy,
  // 保存路径
  save_path: props.media?.save_path,
  // 状态 0-停用，1-启用
  state: props.media?.state,

})

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

// 计算文本颜色
function getTextColor() {
  return imageLoaded.value ? 'white' : ''
}

// 计算文本类
function getTextClass() {
  return imageLoaded.value ? 'text-white' : ''
}

// 删除订阅
async function removerRss() {
  try {
    const result: { [key: string]: any } = await api.delete(
      `rss/${props.media?.id}`,
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

// 调用API修改订阅
async function updateRssInfo() {
  rssInfoDialog.value = false
  try {
    const result: { [key: string]: any } = await api.put('rss', rssForm)

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

// 查询站点名称
async function querySiteName() {
  try {
    const result: Site = await api.get(
      `site/domain/${props.media?.url?.split('/')[2]}`,
    )

    if (result)
      siteName.value = result.name
  }
  catch (e) {
    // 截取URL中的主域名作为站点名称
    siteName.value = props.media?.url?.split('/')[2] || '未知'
    console.log(e)
  }
}

// 编辑订阅响应
async function editRssDialog() {
  rssInfoDialog.value = true
}

// 生成1到50季的下拉框选项
const seasonItems = ref(
  Array.from({ length: 50 }, (_, i) => i + 1).map(item => ({
    title: `第 ${item} 季`,
    value: item,
  })),
)

// 弹出菜单
const dropdownItems = ref([
  {
    title: '编辑',
    value: 1,
    props: {
      prependIcon: 'mdi-file-edit-outline',
      click: editRssDialog,
    },
  },
  {
    title: '取消订阅',
    value: 3,
    props: {
      prependIcon: 'mdi-trash-can-outline',
      color: 'error',
      click: removerRss,
    },
  },
])

onMounted(() => {
  querySiteName()
})
</script>

<template>
  <VCard
    :key="props.media?.id"
    :class="`${rssForm.best_version ? 'outline-dashed outline-1' : ''}`"
    @click="editRssDialog"
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
          v-bind="props"
          icon="mdi-progress-clock"
          :color="getTextColor()"
          class="me-1"
        />
        <span
          class="text-subtitle-2 me-4"
          :class="getTextClass()"
        >{{ props.media?.processed || 0 }}</span>
        <IconBtn
          v-if="siteName"
          icon="mdi-web"
          :color="getTextColor()"
          class="me-1"
        />
        <span
          v-if="siteName"
          class="text-subtitle-2 me-4"
          :class="getTextClass()"
        >
          {{ siteName }}
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
  </VCard>
  <!-- 订阅编辑弹窗 -->
  <VDialog
    v-model="rssInfoDialog"
    max-width="1000"
    persistent
    scrollable
  >
    <!-- Dialog Content -->
    <VCard :title="`订阅 - ${props.media?.name}`">
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
                readonly
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="rssForm.title"
                label="标题"
                readonly
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="rssForm.year"
                label="年份"
                readonly
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSelect
                v-model="rssForm.season"
                label="季"
                :items="seasonItems"
                readonly
              />
            </VCol>
            <VCol
              cols="12"
            >
              <VTextField
                v-model="rssForm.include"
                label="包含"
              />
            </VCol>
            <VCol
              cols="12"
            >
              <VTextField
                v-model="rssForm.exclude"
                label="排除"
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
              md="6"
            >
              <VSwitch
                v-model="rssForm.best_version"
                label="洗版"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSwitch
                v-model="rssForm.proxy"
                label="代理服务器"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>

      <VCardActions>
        <VBtn @click="rssInfoDialog = false">
          取消
        </VBtn>
        <VSpacer />
        <VBtn @click="updateRssInfo">
          确定
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
