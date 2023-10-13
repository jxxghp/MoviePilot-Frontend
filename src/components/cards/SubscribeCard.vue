<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import SubscribeEditForm from '../form/SubscribeEditForm.vue'
import { calculateTimeDifference } from '@/@core/utils'
import { formatSeason } from '@/@core/utils/formatters'
import api from '@/api'
import type { Subscribe } from '@/api/types'

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
const subscribeEditDialog = ref(false)

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

// 编辑订阅响应
async function editSubscribeDialog() {
  subscribeEditDialog.value = true
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
</script>

<template>
  <VCard
    :key="props.media?.id"
    :class="`${props.media?.best_version ? 'outline-dashed outline-1' : ''}`"
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
  <SubscribeEditForm
    v-model="subscribeEditDialog"
    :subid="props.media?.id"
    @remove="() => { emit('remove');subscribeEditDialog = false; }"
    @save="() => { emit('save');subscribeEditDialog = false; }"
    @close="subscribeEditDialog = false"
  />
</template>
