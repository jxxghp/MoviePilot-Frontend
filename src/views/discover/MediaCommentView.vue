<script lang="ts" setup>
import api from '@/api'
import type {
  MediaComment,
  MediaCommentAuthor,
  MediaCommentPage,
  MediaReview,
  MediaReviewPage,
} from '@/api/types'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'

// 输入参数
const props = defineProps({
  // 豆瓣ID
  doubanid: String,
  // 媒体类型：电影、电视剧
  type: String,
})

// 当前标签页：短评或影评
const activeTab = ref<'interests' | 'reviews'>('interests')

// 短评数据
const interests = ref<MediaComment[]>([])

// 影评数据
const reviews = ref<MediaReview[]>([])

// 短评总数
const interestsTotal = ref(0)

// 影评总数
const reviewsTotal = ref(0)

// 加载状态
const loading = ref(false)

// 是否已尝试加载
const hasTriedLoading = ref(false)

// 每页数量
const PAGE_SIZE = 10

// 容器引用
const containerRef = ref<HTMLElement | null>(null)

// 全局设置：用于读取图片缓存开关
const globalSettingsStore = useGlobalSettingsStore()

// 头像加载失败的原始地址；豆瓣 CDN 有防盗链，直连会返回 418，失败后回退到首字母
const failedAvatarUrls = ref<Set<string>>(new Set())

/**
 * 计算作者头像的可显示地址。
 * 豆瓣头像域名对非同源 Referer 返回 418，必须统一走后端图片代理，否则头像区域会留空。
 * @param author 评论作者
 * @returns 可用的图片地址；无头像或此前已加载失败时返回空字符串以回退到首字母
 */
function getAvatarSrc(author?: MediaCommentAuthor): string {
  const rawAvatar = author?.avatar
  if (!rawAvatar || failedAvatarUrls.value.has(rawAvatar)) return ''
  return getDisplayImageUrl(rawAvatar, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE)
}

/**
 * 记录加载失败的头像，触发模板回退到首字母展示。
 * @param author 评论作者
 */
function handleAvatarError(author?: MediaCommentAuthor) {
  const rawAvatar = author?.avatar
  if (!rawAvatar) return
  // 替换整个 Set 以触发响应式更新
  failedAvatarUrls.value = new Set(failedAvatarUrls.value).add(rawAvatar)
}

// 拉取当前标签页数据；短评与影评共用分页协议，按已加载条数作为偏移
async function fetchData() {
  if (!props.doubanid) return
  loading.value = true
  try {
    if (activeTab.value === 'interests') {
      const page: MediaCommentPage = await api.get(
        `douban/interests/${props.doubanid}/${props.type}?start=${interests.value.length}&count=${PAGE_SIZE}`,
      )
      interests.value.push(...(page.items ?? []))
      interestsTotal.value = page.total ?? interests.value.length
    } else {
      const page: MediaReviewPage = await api.get(
        `douban/reviews/${props.doubanid}/${props.type}?start=${reviews.value.length}&count=${PAGE_SIZE}`,
      )
      reviews.value.push(...(page.items ?? []))
      reviewsTotal.value = page.total ?? reviews.value.length
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
    hasTriedLoading.value = true
  }
}

// 切换标签页时按需加载，避免同时请求两个接口
function handleTabChange(value: unknown) {
  const tab = value === 'reviews' ? 'reviews' : 'interests'
  activeTab.value = tab
  const loaded = tab === 'interests' ? interests.value.length : reviews.value.length
  if (loaded === 0) {
    fetchData()
  }
}

// 当前标签页是否还有更多数据
const hasMore = computed(() => {
  if (activeTab.value === 'interests') {
    return interests.value.length < interestsTotal.value
  }
  return reviews.value.length < reviewsTotal.value
})

// 当前标签页是否为空
const isEmpty = computed(() => {
  if (!hasTriedLoading.value) return false
  return activeTab.value === 'interests' ? interests.value.length === 0 : reviews.value.length === 0
})

// 评分按五星制展示
function getRatingStars(rating?: number) {
  return rating ?? 0
}

const { stop } = useIntersectionObserver(
  containerRef,
  ([{ isIntersecting }]) => {
    if (isIntersecting) {
      fetchData()
      stop()
    }
  },
  {
    rootMargin: '300px',
  },
)
</script>

<template>
  <div ref="containerRef">
    <div class="comment-header">
      <VTabs :model-value="activeTab" density="compact" @update:model-value="handleTabChange">
        <VTab value="interests">
          {{ $t('media.comments') }}
          <span v-if="interestsTotal" class="comment-count">{{ interestsTotal }}</span>
        </VTab>
        <VTab value="reviews">
          {{ $t('media.reviews') }}
          <span v-if="reviewsTotal" class="comment-count">{{ reviewsTotal }}</span>
        </VTab>
      </VTabs>
    </div>
    <VWindow :model-value="activeTab" class="comment-window">
      <VWindowItem value="interests">
        <VList v-if="interests.length > 0" density="compact" class="comment-list">
          <VListItem v-for="item in interests" :key="item.id" class="comment-item">
            <template #prepend>
              <VAvatar size="32">
                <VImg
                  v-if="getAvatarSrc(item.author)"
                  :src="getAvatarSrc(item.author)"
                  cover
                  @error="handleAvatarError(item.author)"
                />
                <span v-else>{{ item.author?.name?.charAt(0) ?? '?' }}</span>
              </VAvatar>
            </template>
            <VListItemTitle class="comment-author">
              {{ item.author?.name }}
              <VRating
                v-if="item.rating"
                :model-value="getRatingStars(item.rating)"
                density="compact"
                length="5"
                readonly
                size="x-small"
                class="ms-2"
              />
            </VListItemTitle>
            <div class="comment-text">{{ item.comment }}</div>
            <VListItemSubtitle class="comment-meta">
              <span v-if="item.create_time">{{ item.create_time }}</span>
              <span v-if="item.vote_count" class="ms-2">{{ $t('media.usefulCount', { count: item.vote_count }) }}</span>
            </VListItemSubtitle>
          </VListItem>
        </VList>
      </VWindowItem>
      <VWindowItem value="reviews">
        <VList v-if="reviews.length > 0" density="compact" class="comment-list">
          <VListItem v-for="item in reviews" :key="item.id" class="comment-item">
            <template #prepend>
              <VAvatar size="32">
                <VImg
                  v-if="getAvatarSrc(item.author)"
                  :src="getAvatarSrc(item.author)"
                  cover
                  @error="handleAvatarError(item.author)"
                />
                <span v-else>{{ item.author?.name?.charAt(0) ?? '?' }}</span>
              </VAvatar>
            </template>
            <VListItemTitle class="comment-author">
              {{ item.title }}
              <VRating
                v-if="item.rating"
                :model-value="getRatingStars(item.rating)"
                density="compact"
                length="5"
                readonly
                size="x-small"
                class="ms-2"
              />
            </VListItemTitle>
            <!-- 摘要用普通块级元素承载：VListItemSubtitle 是 -webkit-box 行数截断容器，会把正文压成一行 -->
            <div class="comment-text">{{ item.abstract }}</div>
            <VListItemSubtitle class="comment-meta">
              <span v-if="item.author?.name">{{ item.author.name }}</span>
              <span v-if="item.create_time" class="ms-2">{{ item.create_time }}</span>
              <span v-if="item.useful_count" class="ms-2">
                {{ $t('media.usefulCount', { count: item.useful_count }) }}
              </span>
            </VListItemSubtitle>
          </VListItem>
        </VList>
      </VWindowItem>
    </VWindow>
    <div v-if="loading" class="comment-loading">
      <VProgressCircular indeterminate size="24" />
    </div>
    <div v-else-if="hasMore" class="comment-more">
      <VBtn variant="text" size="small" @click="fetchData">{{ $t('common.loadMore') }}</VBtn>
    </div>
    <div v-else-if="isEmpty" class="comment-empty">
      <span>{{ $t('common.noData') }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.comment-header {
  margin-block-end: 0.5rem;
}

.comment-count {
  margin-inline-start: 0.25rem;
  opacity: 0.6;
  font-size: 0.75rem;
}

.comment-window {
  overflow: visible;
}

.comment-list {
  padding: 0;
}

.comment-item {
  padding-inline: 0;
  /* 头像与用户名同行，长评论时头像保持在顶部而不是垂直居中 */
  align-items: flex-start;
}

.comment-item :deep(.v-list-item__prepend) {
  align-self: flex-start;
  /* 抵消 VListItem 默认的垂直居中内边距，让头像顶部与用户名首行对齐 */
  padding-block: 0;
}

.comment-author {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}

.comment-text {
  display: block;
  margin-block-start: 0.375rem;
  /* pre-line 保留豆瓣正文里的段落换行，同时让长句正常折行 */
  white-space: pre-line;
  overflow: visible;
  overflow-wrap: anywhere;
  font-size: 0.875rem;
  line-height: 1.5;
  opacity: 1;
}

.comment-meta {
  font-size: 0.75rem;
  opacity: 0.6;
}

.comment-loading,
.comment-more,
.comment-empty {
  display: flex;
  justify-content: center;
  padding-block: 0.75rem;
}

.comment-empty {
  opacity: 0.6;
  font-size: 0.875rem;
}
</style>
