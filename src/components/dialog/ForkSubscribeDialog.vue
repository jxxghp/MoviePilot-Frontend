<script setup lang="ts">
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
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
    const result = await api.get<{ value?: string[] }>('system/setting/public/FollowSubscribers')
    followUsers.value = result.value ?? []
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.requestFailed'))
  }
}

// follow用户
async function followUser() {
  try {
    await api.post<null>(`subscribe/follow?share_uid=${props.media?.share_uid}`, undefined, { feedback: 'silent' })
    queryFollowUsers()
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.requestFailed'))
  }
}

// unfollow用户
async function unfollowUser() {
  try {
    await api.delete<null>('subscribe/follow', {
      params: {
        share_uid: props.media?.share_uid,
      },
      feedback: 'silent',
    })
    queryFollowUsers()
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.requestFailed'))
  }
}

// 计算海报图片地址
const posterUrl = computed(() => {
  const url = props.media?.poster
  return getDisplayImageUrl(url || '', globalSettings.GLOBAL_IMAGE_CACHE)
})

// 获取待复制订阅的统一媒体身份
function getMediaId() {
  if (!props.media?.media_source || !props.media.media_id) return undefined
  return { mediaSource: props.media.media_source, mediaId: String(props.media.media_id) }
}

// 查看媒体详情
async function viewMediaDetail() {
  const identity = getMediaId()
  if (!identity) return
  router.push({
    path: '/media',
    query: {
      media_source: identity.mediaSource,
      media_id: identity.mediaId,
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
    const result = await api.post<{ id: number }>('subscribe/fork', props.media, { feedback: 'silent' })
    $toast.success(t('subscribe.addSuccess', { name: props.media?.share_title }))
    // 完成
    emit('fork', result.id)
  } catch (error) {
    console.error(error)
    $toast.error(
      t('subscribe.addFailed', {
        name: props.media?.share_title,
        message: getApiBusinessErrorMessage(error) || t('subscribe.requestFailed'),
      }),
    )
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
    await api.delete<null>(`subscribe/share/${props.media?.id}`, {
      params: {
        share_uid: globalSettings.USER_UNIQUE_ID,
      },
      feedback: 'silent',
    })
    $toast.success(t('subscribe.cancelSuccess'))
    // 完成
    emit('delete')
  } catch (error) {
    console.error(error)
    $toast.error(
      t('subscribe.cancelFailed', {
        message: getApiBusinessErrorMessage(error) || t('subscribe.requestFailed'),
      }),
    )
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
          <div
            class="subscribe-share-detail-layout d-flex justify-space-between flex-wrap flex-md-nowrap flex-column flex-md-row"
          >
            <div class="subscribe-share-detail__poster">
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
            <div class="flex-grow subscribe-share-detail">
              <VCardItem class="subscribe-share-detail__header pa-0">
                <VCardTitle
                  class="subscribe-share-detail__title break-words whitespace-break-spaces line-clamp-2 overflow-hidden text-ellipsis"
                >
                  {{ props.media?.share_title }}
                </VCardTitle>
                <VCardSubtitle
                  class="subscribe-share-detail__description break-words whitespace-break-spaces line-clamp-4 overflow-hidden text-ellipsis"
                >
                  {{ props.media?.share_comment }}
                </VCardSubtitle>
                <dl class="subscribe-share-detail__metadata">
                  <div class="subscribe-share-detail__metadata-row">
                    <dt>{{ t('subscribe.sharer') }}：</dt>
                    <dd>{{ media?.share_user }}</dd>
                  </div>
                  <div v-if="media?.keyword" class="subscribe-share-detail__metadata-row">
                    <dt>{{ t('subscribe.keyword') }}：</dt>
                    <dd>{{ media?.keyword }}</dd>
                  </div>
                  <div
                    v-if="media?.custom_words"
                    class="subscribe-share-detail__recognition"
                    @click.stop="toggleExpand"
                  >
                    <dt>{{ t('subscribe.recognitionWords') }}：</dt>
                    <dd
                      class="break-words"
                      :class="{
                        'line-clamp-4 overflow-hidden text-ellipsis': !isExpanded,
                      }"
                    >
                      {{ media?.custom_words }}
                    </dd>
                  </div>
                </dl>
                <div class="subscribe-share-detail__actions">
                  <div class="subscribe-share-detail__buttons">
                    <VBtn
                      color="primary"
                      :disabled="processing"
                      @click="doFork"
                      prepend-icon="mdi-heart"
                      :loading="processing"
                      class="subscribe-share-detail__button"
                    >
                      {{ t('subscribe.normalSub') }}
                    </VBtn>
                    <VBtn
                      v-if="isFollowed && props.media?.share_uid"
                      color="warning"
                      @click="unfollowUser"
                      prepend-icon="mdi-account-remove"
                      class="subscribe-share-detail__button"
                    >
                      {{ t('subscribe.unfollow') }}
                    </VBtn>
                    <VBtn
                      v-else-if="props.media?.share_uid"
                      @click="followUser"
                      color="info"
                      prepend-icon="mdi-account-plus"
                      class="subscribe-share-detail__button"
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
                      class="subscribe-share-detail__button"
                    >
                      {{ t('subscribe.cancelShare') }}
                    </VBtn>
                  </div>
                  <div class="subscribe-share-detail__usage" v-if="props.media?.count">
                    <VIcon icon="mdi-fire" size="18" />
                    <span>{{ t('subscribe.usageCount', { count: props.media?.count?.toLocaleString() }) }}</span>
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

<style scoped>
.subscribe-share-detail-layout {
  align-items: center;
  gap: 1.5rem;
}

.subscribe-share-detail__poster {
  flex: 0 0 auto;
}

.subscribe-share-detail {
  min-inline-size: 0;
}

.subscribe-share-detail__header {
  text-align: center;
}

.subscribe-share-detail__title,
.subscribe-share-detail__description {
  text-align: center;
}

.subscribe-share-detail__metadata {
  display: grid;
  gap: 0.625rem;
  margin: 1.125rem auto;
}

.subscribe-share-detail__metadata-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 0.625rem;
  min-inline-size: 0;
}

.subscribe-share-detail__metadata dt {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: end;
  white-space: nowrap;
}

.subscribe-share-detail__metadata dd {
  min-inline-size: 0;
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
  text-align: start;
}

.subscribe-share-detail__recognition {
  min-inline-size: 0;
  margin-block-start: 0.25rem;
  cursor: pointer;
}

.subscribe-share-detail__recognition dt {
  text-align: center;
  white-space: normal;
}

.subscribe-share-detail__recognition dd {
  inline-size: 100%;
  margin-block-start: 0.35rem;
  line-height: 1.5;
  text-align: center;
  white-space: pre-wrap;
}

.subscribe-share-detail__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-block-start: 1rem;
}

.subscribe-share-detail__buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  inline-size: 100%;
}

.subscribe-share-detail__usage {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.4;
}

@media (width < 360px) {
  .subscribe-share-detail__buttons {
    flex-direction: column;
  }

  .subscribe-share-detail__button {
    inline-size: 100%;
  }
}

@media (width < 960px) {
  .subscribe-share-detail-layout {
    align-items: stretch;
    gap: 1rem;
  }

  .subscribe-share-detail__poster {
    margin-inline: auto;
  }
}
</style>
