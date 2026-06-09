<script setup lang="ts">
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { SubscribeShare } from '@/api/types'
import router from '@/router'
import { useToast } from 'vue-toastification'
import { VBtn } from 'vuetify/lib/components/index.mjs'
import { useI18n } from 'vue-i18n'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  media: Object as PropType<SubscribeShare>,
})

// 定义事件
const emit = defineEmits(['fork', 'delete', 'close'])

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 提示框
const $toast = useToast()

// 处理中
const processing = ref(false)

// 删除中
const deleting = ref(false)

// 是否折叠
const isExpanded = ref(false)

// follow用户列表
const followUsers = ref<string[]>([])

// 当前用户是否已follow
const isFollowed = computed(() => followUsers.value.includes(props.media?.share_uid || ''))

// 折叠展开
function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

// 加载follow用户列表
async function queryFollowUsers() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/FollowSubscribers')
    followUsers.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// follow用户
async function followUser() {
  try {
    const result: { [key: string]: any } = await api.post(`subscribe/follow?share_uid=${props.media?.share_uid}`)
    if (result.success) {
      queryFollowUsers()
    }
  } catch (error) {
    console.log(error)
  }
}

// unfollow用户
async function unfollowUser() {
  try {
    const result: { [key: string]: any } = await api.delete('subscribe/follow', {
      params: {
        share_uid: props.media?.share_uid,
      },
    })
    if (result.success) {
      queryFollowUsers()
    }
  } catch (error) {
    console.log(error)
  }
}

// 计算海报图片地址
const posterUrl = computed(() => {
  const url = props.media?.poster
  return getDisplayImageUrl(url || '', globalSettings.GLOBAL_IMAGE_CACHE)
})

// 获得mediaid
function getMediaId() {
  if (props.media?.tmdbid) return `tmdb:${props.media?.tmdbid}`
  else if (props.media?.doubanid) return `douban:${props.media?.doubanid}`
}

// 查看媒体详情
async function viewMediaDetail() {
  router.push({
    path: '/media',
    query: {
      mediaid: getMediaId(),
      title: props.media?.name,
      year: props.media?.year,
      type: props.media?.type,
    },
  })
}

// 复用订阅
async function doFork() {
  // 开始处理
  startNProgress()
  try {
    processing.value = true
    // 请求API
    const result: { [key: string]: any } = await api.post('subscribe/fork', props.media)
    // 订阅状态
    if (result.success) {
      $toast.success(t('subscribe.addSuccess', { name: props.media?.share_title }))
      // 完成
      emit('fork', result.data.id)
    } else {
      $toast.error(t('subscribe.addFailed', { name: props.media?.share_title, message: result.message }))
    }
  } catch (error) {
    console.error(error)
  } finally {
    processing.value = false
    doneNProgress()
  }
}

// 删除订阅分享
async function doDelete() {
  // 开始处理
  startNProgress()
  try {
    deleting.value = true
    // 请求API
    const result: { [key: string]: any } = await api.delete(`subscribe/share/${props.media?.id}`, {
      params: {
        share_uid: globalSettings.USER_UNIQUE_ID,
      },
    })
    // 订阅状态
    if (result.success) {
      $toast.success(t('subscribe.cancelSuccess'))
      // 完成
      emit('delete', result.data.id)
    } else {
      $toast.error(t('subscribe.cancelFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  } finally {
    deleting.value = false
    doneNProgress()
  }
}

onMounted(() => {
  queryFollowUsers()
})
</script>
<template>
  <VDialog max-width="40rem" scrollable>
    <VCard>
      <VCardText>
        <VCol>
          <div class="d-flex justify-space-between flex-wrap flex-md-nowrap flex-column flex-md-row">
            <div class="ma-auto">
              <VImg
                width="10rem"
                aspect-ratio="2/3"
                class="object-cover aspect-w-2 aspect-h-3 rounded-lg ring-1 ring-gray-500"
                :src="posterUrl"
                @click="viewMediaDetail"
                cover
              >
                <template #placeholder>
                  <div class="w-full h-full">
                    <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                  </div>
                </template>
              </VImg>
            </div>
            <div class="flex-grow">
              <VCardItem>
                <VCardTitle
                  class="text-center text-md-left break-words whitespace-break-spaces line-clamp-2 overflow-hidden text-ellipsis"
                >
                  {{ props.media?.share_title }}
                </VCardTitle>
                <VCardSubtitle
                  class="text-center text-md-left break-words whitespace-break-spaces line-clamp-4 overflow-hidden text-ellipsis"
                >
                  {{ props.media?.share_comment }}
                </VCardSubtitle>
                <VList lines="one" class="border-0">
                  <VListItem class="ps-0">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('subscribe.sharer') }}：</span>
                      <span class="text-body-1"> {{ media?.share_user }}</span>
                    </VListItemTitle>
                  </VListItem>
                  <VListItem class="ps-0" v-if="media?.keyword">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('subscribe.keyword') }}：</span>
                      <span class="text-body-1"> {{ media?.keyword }}</span>
                    </VListItemTitle>
                  </VListItem>
                  <VListItem class="ps-0" v-if="media?.custom_words" @click.stop="toggleExpand">
                    <VListItemTitle
                      class="text-center text-md-left break-words whitespace-break-spaces"
                      :class="{
                        'line-clamp-4 overflow-hidden text-ellipsis': !isExpanded,
                      }"
                    >
                      <span class="font-weight-medium">{{ t('subscribe.recognitionWords') }}：</span>
                      <span class="text-body-1"> {{ media?.custom_words }}</span>
                    </VListItemTitle>
                  </VListItem>
                </VList>
                <div class="text-center text-md-left">
                  <div>
                    <VBtn
                      color="primary"
                      :disabled="processing"
                      @click="doFork"
                      prepend-icon="mdi-heart"
                      :loading="processing"
                      class="mb-2 me-2"
                    >
                      {{ t('subscribe.normalSub') }}
                    </VBtn>
                    <VBtn
                      v-if="isFollowed && props.media?.share_uid"
                      color="warning"
                      @click="unfollowUser"
                      prepend-icon="mdi-account-remove"
                      class="mb-2 me-2"
                    >
                      {{ t('subscribe.unfollow') }}
                    </VBtn>
                    <VBtn
                      v-else-if="props.media?.share_uid"
                      @click="followUser"
                      color="info"
                      prepend-icon="mdi-account-plus"
                      class="mb-2 me-2"
                    >
                      {{ t('subscribe.follow') }}
                    </VBtn>
                    <VBtn
                      v-if="
                        (props.media?.share_uid && props.media?.share_uid === globalSettings.USER_UNIQUE_ID) ||
                        globalSettings.SUBSCRIBE_SHARE_MANAGE
                      "
                      color="error"
                      :disabled="deleting"
                      @click="doDelete"
                      prepend-icon="mdi-delete"
                      :loading="deleting"
                      class="mb-2 me-2"
                    >
                      {{ t('subscribe.cancelShare') }}
                    </VBtn>
                  </div>
                  <div class="text-xs mt-2" v-if="props.media?.count">
                    <VIcon icon="mdi-fire" />{{
                      t('subscribe.usageCount', { count: props.media?.count?.toLocaleString() })
                    }}
                  </div>
                </div>
              </VCardItem>
            </div>
          </div>
        </VCol>
      </VCardText>
      <VDialogCloseBtn @click="emit('close')" />
    </VCard>
  </VDialog>
</template>
