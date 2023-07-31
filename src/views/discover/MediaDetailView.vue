<script setup lang="ts">
import PersonCardSlideView from './PersonCardSlideView.vue'
import MediaCardSlideView from './MediaCardSlideView.vue'
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'

// 输入参数
const mediaProps = defineProps({
  mediaid: String,
  type: String,
})

// 媒体详情
const mediaDetail = ref<MediaInfo>({} as MediaInfo)

// 是否已加载完成
const isRefreshed = ref(false)

// 调用API查询详情
async function getMediaDetail() {
  if (mediaProps.mediaid && mediaProps.type) {
    const result: MediaInfo = await api.get(`tmdb/${mediaProps.mediaid}`, {
      params: {
        type_name: mediaProps.type,
      },
    })
    mediaDetail.value = result
    isRefreshed.value = true
  }
}

onBeforeMount(() => {
  getMediaDetail()
})
</script>

<template>
  <div
    v-if="!isRefreshed"
    class="mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center"
  >
    <VProgressCircular
      size="48"
      indeterminate
      color="primary"
    />
  </div>
  <div v-if="mediaDetail.tmdb_id" class="max-w-8xl mx-auto px-4">
    <div class="media-page">
      <div class="media-header">
        <div class="media-poster">
          <VImg :src="mediaDetail.poster_path" cover />
        </div>
        <div class="media-title">
          <div class="media-status" />
          <h1 class="flex flex-row items-baseline justify-start lg:justify-center">
            <span>{{ mediaDetail.title }}</span>
            <span v-if="mediaDetail.year" class="text-lg">（{{ mediaDetail.year }}）</span>
          </h1>
          <span class="media-attributes">
            <span>{{ mediaDetail.runtime }}</span>
          </span>
        </div>
        <div class="media-actions" />
      </div>
      <div class="media-overview">
        <div class="media-overview-left">
          <div v-if="mediaDetail.tagline" class="tagline">
            {{ mediaDetail.tagline }}
          </div>
          <h2 v-if="mediaDetail.overview">
            简介
          </h2>
          <p>{{ mediaDetail.overview }}</p>
        </div>
        <div class="media-overview-right" />
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <PersonCardSlideView :apipath="`tmdb/credits/${mediaDetail.tmdb_id}/${mediaProps.type}`">
          <template #title="{ loaded }">
            <div v-if="loaded" class="slider-header">
              <RouterLink :to="`/credits/tmdb/credits/${mediaDetail.tmdb_id}/${mediaProps.type}?title=演员阵容`" class="slider-title">
                <span>演员阵容</span>
                <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
              </RouterLink>
            </div>
          </template>
        </PersonCardSlideView>
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <MediaCardSlideView :apipath="`tmdb/recommend/${mediaDetail.tmdb_id}/${mediaProps.type}`">
          <template #title="{ loaded }">
            <div v-if="loaded" class="slider-header">
              <RouterLink :to="`/browse/tmdb/recommend/${mediaDetail.tmdb_id}/${mediaProps.type}?title=推荐`" class="slider-title">
                <span>推荐</span>
                <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
              </RouterLink>
            </div>
          </template>
        </MediaCardSlideView>
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <MediaCardSlideView :apipath="`tmdb/similar/${mediaDetail.tmdb_id}/${mediaProps.type}`">
          <template #title="{ loaded }">
            <div v-if="loaded" class="slider-header">
              <RouterLink :to="`/browse/tmdb/similar/${mediaDetail.tmdb_id}/${mediaProps.type}?title=类似`" class="slider-title">
                <span>类似</span>
                <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
              </RouterLink>
            </div>
          </template>
        </MediaCardSlideView>
      </div>
    </div>
  </div>
  <NoDataFound
    v-if="!mediaDetail.tmdb_id && isRefreshed"
    error-code="500"
    error-title="出错啦！"
    error-description="无法获取到媒体信息，请检查网络连接。"
  />
</template>

<style lang="scss">
.media-page {
  position: relative;
  background-position: 50%;
  background-size: cover;
  margin-block-start: calc(-4rem - env(safe-area-inset-top));
  margin-inline: -1rem;
  padding-block-start: calc(4rem + env(safe-area-inset-top));
  padding-inline: 1rem;
}

.media-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-block-start: 1rem;
}

@media (min-width: 1280px) {
  .media-header {
    flex-direction: row;
    align-items: flex-end;
  }
}

.media-overview {
  display: flex;
  flex-direction: column;
  padding-top: 2rem;
  padding-bottom: 1rem;
}

@media (min-width: 1024px) {
  .media-overview {
    flex-direction: row;
  }
}

.media-poster {
  width: 8rem;
  overflow: hidden;
  border-radius: .25rem;
  --tw-shadow: 0 1px 3px 0 rgba(0, 0, 0, .1), 0 1px 2px -1px rgba(0, 0, 0, .1);
  --tw-shadow-colored: 0 1px 3px 0 var(--tw-shadow-color), 0 1px 2px -1px var(--tw-shadow-color);
  box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
}

@media (min-width: 1280px) {
  .media-poster {
    margin-right: 1rem;
    width: 13rem;
  }
}

@media (min-width: 768px) {
  .media-poster {
    width: 11rem;
    border-radius: .5rem;
    --tw-shadow: 0 25px 50px -12px rgba(0, 0, 0, .25);
    --tw-shadow-colored: 0 25px 50px -12px var(--tw-shadow-color);
    box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
  }
}

.media-title {
  margin-top: 1rem;
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  text-align: center;
}

@media (min-width: 1280px) {
  .media-title {
    margin-right: 1rem;
    margin-top: 0;
    text-align: left;
  }
}

.media-title>h1 {
    font-size: 1.5rem;
    line-height: 2rem;
    font-weight: 700;
}

@media (min-width: 1280px) {
  .media-title>h1 {
      font-size: 2.25rem;
      line-height: 2.5rem;
  }
}

ul.media-crew {
    margin-top: 1.5rem;
    display: grid;
    grid-template-columns: repeat(2,minmax(0,1fr));
    gap: 1.5rem;
}

@media (min-width: 640px) {
  ul.media-crew {
      grid-template-columns: repeat(3,minmax(0,1fr));
  }
}

.media-status {
  margin-bottom: .5rem;
}

.media-attributes {
  margin-top: .25rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

@media (min-width: 1280px) {
  .media-attributes {
    margin-top: 0;
    justify-content: flex-start;
    font-size: 1rem;
    line-height: 1.5rem;
  }
}

@media (min-width: 640px) {
  .media-attributes {
    font-size: .875rem;
    line-height: 1.25rem;
  }
}

.media-actions {
  position: relative;
  margin-top: 1rem;
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

@media (min-width: 1280px) {
  .media-actions {
    margin-top: 0;
  }
}

@media (min-width: 640px) {
  .media-actions {
    flex-wrap: nowrap;
    justify-content: flex-end;
  }
}

.media-overview-left {
  flex: 1 1 0%;
}

@media (min-width: 1024px) {
  .media-overview-left {
    margin-right: 2rem;
  }
}

.media-overview-right {
  margin-top: 2rem;
  width: 100%;
}

@media (min-width: 1024px) {
  .media-overview-right {
    margin-top: 0;
    width: 20rem;
  }
}

.media-overview h2 {
    font-size: 1.25rem;
    line-height: 1.75rem;
    font-weight: 700;
}

@media (min-width: 640px) {
  .media-overview h2 {
      font-size: 1.5rem;
      line-height: 2rem;
  }
}

.tagline {
    margin-bottom: 1rem;
    font-size: 1.25rem;
    line-height: 1.75rem;
    font-style: italic;
}

@media (min-width: 1024px) {
  .tagline {
      font-size: 1.5rem;
      line-height: 2rem;
  }
}
</style>
